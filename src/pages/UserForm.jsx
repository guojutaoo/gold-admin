import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import './UserForm.css';

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMessage = (data && data.error) || `HTTP error! status: ${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function UserForm() {
  const location = useLocation();
  const [isTokenValid, setIsTokenValid] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [boundEmail, setBoundEmail] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    monitorAssets: {
      gold: true,
      silver: false
    },
    notifyModes: ['interval'],
    pushFrequency: '2',
    dropThreshold: '5'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');

    if (!token) {
      setAccessToken('');
      setBoundEmail('');
      setIsTokenValid(false);
      return;
    }

    setAccessToken(token);
    setIsTokenValid(null);
    requestJson(`/api/form/verify?token=${encodeURIComponent(token)}`)
      .then((result) => {
        setIsTokenValid(true);
        const email = result?.bound_email || '';
        setBoundEmail(email);
        if (email) {
          setFormData((prev) => ({ ...prev, email }));
        }
      })
      .catch(() => {
        setBoundEmail('');
        setIsTokenValid(false);
      });
  }, [location.search]);

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAssetChange = (asset) => {
    setFormData(prev => ({
      ...prev,
      monitorAssets: {
        ...prev.monitorAssets,
        [asset]: !prev.monitorAssets[asset]
      }
    }));
  };

  const handleNotifyModeToggle = (mode) => {
    setFormData((prev) => {
      const nextModes = prev.notifyModes.includes(mode)
        ? prev.notifyModes.filter((item) => item !== mode)
        : [...prev.notifyModes, mode];

      return {
        ...prev,
        notifyModes: nextModes,
      };
    });
  };

  const handleSubmit = async () => {
    if (!formData.email.trim()) {
      toast.error('请输入邮箱');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    if (boundEmail && formData.email.trim().toLowerCase() !== boundEmail.toLowerCase()) {
      toast.error(`该 token 已绑定邮箱 ${boundEmail}，如需更换请重新购买`);
      return;
    }

    if (!formData.monitorAssets.gold && !formData.monitorAssets.silver) {
      toast.error('请至少选择一种监控资产');
      return;
    }

    const hasInterval = formData.notifyModes.includes('interval');
    const hasDrop = formData.notifyModes.includes('drop');

    if (!formData.notifyModes.length) {
      toast.error('请至少选择一种通知方式');
      return;
    }

    if (hasInterval && !String(formData.pushFrequency || '').trim()) {
      toast.error('请选择定时提醒频率');
      return;
    }

    if (hasDrop && !String(formData.dropThreshold || '').trim()) {
      toast.error('请输入价格变动阈值');
      return;
    }

    setIsSubmitting(true);

    try {
      const resolvedIntervalHours = hasInterval
        ? Number(formData.pushFrequency)
        : hasDrop
          ? 2
          : null;

      const payload = {
        token: accessToken,
        email: formData.email.trim(),
        monitor_gold: formData.monitorAssets.gold,
        monitor_silver: formData.monitorAssets.silver,
        notify_modes: formData.notifyModes,
        interval_hours: resolvedIntervalHours,
        drop_threshold: hasDrop ? Number(formData.dropThreshold) : null,
        price_threshold: null,
      };

      const result = await requestJson('/api/form/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const email = result?.bound_email || payload.email;
      setBoundEmail(email);

      toast.success('保存成功！');

      setFormData((prev) => ({
        ...prev,
        email,
      }));
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        setIsTokenValid(false);
        toast.error('链接无效或已过期，请重新购买');
        return;
      }
      toast.error(error.message || '保存失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = () => {
    setFormData({
      email: '',
      monitorAssets: {
        gold: true,
        silver: false
      },
      notifyModes: ['interval'],
      pushFrequency: '2',
      dropThreshold: '5'
    });
    toast.success('表单已清空');
  };

  if (isTokenValid === false) {
    return (
      <div className="error-page">
        <div className="error-container">
          <div className="error-icon">🔒</div>
          <h1>需要购买服务</h1>
          <p>未检测到有效 token，或 token 已失效</p>
          <p className="error-subtitle">购买后会获得专属链接，用于填写此表单</p>
        </div>
      </div>
    );
  }

  if (isTokenValid === null) {
    return (
      <div className="loading-page">
        <div className="loading-spinner"></div>
        <p>验证中...</p>
      </div>
    );
  }

  return (
    <div className="form-layout">
      <Toaster position="top-center" />

      <main className="main-content standalone">
        <header className="content-header">
          <h1>用户配置</h1>
          <span className="header-subtitle">每个链接只能绑定一个email</span>
        </header>

        <div className="form-container">
          <div className="form-group">
            <label className="form-label">邮箱</label>
            <input
              type="email"
              className="form-input"
              placeholder="user@example.com"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={Boolean(boundEmail)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">监控资产</label>
            <div className="checkbox-wrapper">
              <label className={`custom-checkbox ${formData.monitorAssets.gold ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={formData.monitorAssets.gold}
                  onChange={() => handleAssetChange('gold')}
                />
                <span className="check-icon">✓</span>
                <span className="checkbox-text">黄金（实物黄金、基准金价）</span>
              </label>
              <label className={`custom-checkbox ${formData.monitorAssets.silver ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={formData.monitorAssets.silver}
                  onChange={() => handleAssetChange('silver')}
                />
                <span className="check-icon">✓</span>
                <span className="checkbox-text">白银</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">通知方式</label>
            <div className="checkbox-wrapper">
              <label
                className={`custom-checkbox ${formData.notifyModes.includes('interval') ? 'checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={formData.notifyModes.includes('interval')}
                  onChange={() => handleNotifyModeToggle('interval')}
                />
                <span className="check-icon">✓</span>
                <span className="checkbox-text">定时提醒（整点）</span>
              </label>
              <label
                className={`custom-checkbox ${formData.notifyModes.includes('drop') ? 'checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={formData.notifyModes.includes('drop')}
                  onChange={() => handleNotifyModeToggle('drop')}
                />
                <span className="check-icon">✓</span>
                <span className="checkbox-text">价格变动告警</span>
              </label>
            </div>
          </div>

          {formData.notifyModes.includes('interval') && (
            <div className="form-group">
              <label className="form-label">定时提醒频率</label>
              <div className="select-wrapper">
                <select
                  className="form-select"
                  value={formData.pushFrequency}
                  onChange={(e) => handleChange('pushFrequency', e.target.value)}
                >
                  {[1, 2, 4, 8, 16].map((hour) => (
                    <option key={hour} value={String(hour)}>
                      每 {hour} 小时整点提醒一次
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {formData.notifyModes.includes('drop') && (
            <div className="form-group">
              <label className="form-label">价格变动阈值</label>
              <div className="input-wrapper">
                <input
                  type="number"
                  className="form-input with-suffix"
                  value={formData.dropThreshold}
                  onChange={(e) => handleChange('dropThreshold', e.target.value)}
                  placeholder="例如 5"
                  min="0"
                  step="0.1"
                />
                <span className="input-suffix">%</span>
              </div>
              {!formData.notifyModes.includes('interval') && (
                <div className="form-hint">
                  未配置定时提醒时，价格变动告警默认以 2 小时前价格为基准
                </div>
              )}
            </div>
          )}

          <div className="form-hint">
            频率与静默规则：同一方向的价格提醒每 30 分钟最多发送 1 次，夜间 23:00–07:00 默认静默。在此期间不会发邮件给用户
          </div>

          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? '提交中...' : '保存'}
            </button>
            <button
              className="btn-secondary"
              onClick={handleClear}
              disabled={isSubmitting}
            >
              清空
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default UserForm;

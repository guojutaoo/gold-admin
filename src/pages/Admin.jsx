import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Toaster, toast } from 'react-hot-toast';
import { usersApi, logsApi, statsApi, adminApi } from '../services/api';
import './Admin.css';

function Admin() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    monitoring: 0,
    sentToday: 0,
    pending: 0,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [resumeUserId, setResumeUserId] = useState(null);

  const [form, setForm] = useState({
    id: '',
    email: '',
    plan: 'paid',
    assets: ['gold'],
    notifyModes: ['interval'],
    intervalHours: 2,
    dropThreshold: 2,
    priceThreshold: 500,
  });
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // 加载数据
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/login');
      return;
    }
    loadData();
  }, [isAdmin, navigate]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [usersData, logsData, statsData] = await Promise.all([
        usersApi.getAll(),
        logsApi.getAllLogs(),
        statsApi.getStats(),
      ]);
      setUsers(usersData);
      setLogs(logsData);
      setStats(statsData);
    } catch (error) {
      toast.error('加载数据失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const normalizeNotifyModes = (value) => {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const formatNotifyModes = (modes, intervalHours, dropThreshold, priceThreshold) => {
    if (!modes || modes.length === 0) {
      return '--';
    }
    const safeValue = (value) => (Number.isFinite(value) ? value : '--');
    return modes
      .map((mode) => {
        if (mode === 'interval') {
          return `${safeValue(intervalHours)}小时一次`;
        }
        if (mode === 'drop') {
          return `价格浮动${safeValue(dropThreshold)}%`;
        }
        if (mode === 'threshold') {
          return `价格提醒${safeValue(priceThreshold)}元/克`;
        }
        return mode;
      })
      .join(' / ');
  };

  const openEditModal = (userData) => {
    const modes = normalizeNotifyModes(userData.notifyModes || userData.notifyMode);
    setForm({
      id: userData.id,
      email: userData.email || '',
      plan: userData.plan || 'paid',
      assets: userData.assets || ['gold'],
      notifyModes: modes.length ? modes : ['interval'],
      intervalHours: userData.intervalHours || 2,
      dropThreshold: userData.dropThreshold ?? 2,
      priceThreshold: userData.priceThreshold ?? 500,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({
      id: '',
      email: '',
      plan: 'paid',
      assets: ['gold'],
      notifyModes: ['interval'],
      intervalHours: 2,
      dropThreshold: 2,
      priceThreshold: 500,
    });
  };

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleAsset = (asset) => {
    setForm((prev) => ({
      ...prev,
      assets: prev.assets.includes(asset)
        ? prev.assets.filter((a) => a !== asset)
        : [...prev.assets, asset],
    }));
  };

  const toggleNotifyMode = (mode) => {
    setForm((prev) => ({
      ...prev,
      notifyModes: prev.notifyModes.includes(mode)
        ? prev.notifyModes.filter((item) => item !== mode)
        : [...prev.notifyModes, mode],
    }));
  };

  const sendBroadcastEmail = async () => {
    if (!broadcastSubject.trim()) {
      toast.error('请输入邮件标题');
      return;
    }
    if (!broadcastContent.trim()) {
      toast.error('请输入邮件内容');
      return;
    }
    try {
      setIsBroadcasting(true);
      const result = await adminApi.sendBroadcastEmail({
        subject: broadcastSubject.trim(),
        content: broadcastContent.trim(),
      });
      toast.success(`已发送 ${result.sent}/${result.total}`);
      if (result.failed > 0) {
        toast.error(`发送失败 ${result.failed} 个`);
      }
      setBroadcastSubject('');
      setBroadcastContent('');
    } catch (error) {
      toast.error('发送失败: ' + error.message);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const saveUser = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('请输入有效邮箱');
      return;
    }
    if (!form.plan) {
      toast.error('请选择用户套餐');
      return;
    }
    if (!form.assets.length) {
      toast.error('请选择监控品种');
      return;
    }
    if (!form.notifyModes.length) {
      toast.error('请选择至少一种通知方式');
      return;
    }
    if (form.notifyModes.includes('interval') && !Number.isFinite(form.intervalHours)) {
      toast.error('请输入间隔时间');
      return;
    }
    if (form.notifyModes.includes('drop') && !Number.isFinite(form.dropThreshold)) {
      toast.error('请输入价格浮动比例');
      return;
    }
    if (form.notifyModes.includes('threshold') && !Number.isFinite(form.priceThreshold)) {
      toast.error('请输入价格提醒阈值');
      return;
    }

    const payload = {
      email: form.email.trim(),
      plan: form.plan,
      monitor_gold: form.assets.includes('gold'),
      monitor_silver: form.assets.includes('silver'),
      notify_modes: form.notifyModes,
      notify_mode: form.notifyModes.join(','),
      interval_hours: form.notifyModes.includes('interval') ? form.intervalHours : null,
      drop_threshold: form.notifyModes.includes('drop') ? form.dropThreshold : null,
      price_threshold: form.notifyModes.includes('threshold') ? form.priceThreshold : null,
    };

    try {
      if (form.id) {
        await usersApi.update(form.id, payload);
        toast.success('用户更新成功！');
      } else {
        await usersApi.create({
          ...payload,
          role: 'user',
        });
        toast.success('用户新增成功！');
      }
      closeModal();
      loadData();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const confirmResume = (id) => {
    setResumeUserId(id);
    setResumeModalOpen(true);
  };

  const executeResume = async () => {
    try {
      await usersApi.update(resumeUserId, { status: 'active' });
      toast.success('用户已恢复');
      setResumeModalOpen(false);
      setResumeUserId(null);
      loadData();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const pauseUser = async (id) => {
    try {
      await usersApi.update(id, { status: 'paused' });
      toast.success('用户已暂停');
      loadData();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <Toaster position="top-center" />

      {/* 侧边栏 */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <h2 className="logo">💰 金价监控</h2>
          <button
            className="collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>
        <nav className="sidebar-nav">
          <Link
            to="/admin"
            className={`nav-item ${location.pathname === '/admin' ? 'active' : ''}`}
          >
            <span className="nav-icon">👥</span>
            <span className="nav-text">用户管理</span>
          </Link>
          <Link
            to="/config"
            className={`nav-item ${location.pathname === '/config' ? 'active' : ''}`}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">用户设置</span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="user-profile">
            <span className="user-avatar">👤</span>
            <div className="user-details">
              <span className="user-name">{user?.name || '管理员'}</span>
              <span className="user-role">超级管理员</span>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <span className="logout-text">退出登录</span>
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className={`main-content ${sidebarCollapsed ? 'expanded' : ''}`}>
        {/* 统计卡片 */}
        <div className="stats-row">
          <div className="stat-box">
            <p className="stat-label">总用户</p>
            <p className="stat-value">{stats.total}</p>
            <p className="stat-foot">👥 全部注册用户</p>
          </div>
          <div className="stat-box">
            <p className="stat-label">正常监控</p>
            <p className="stat-value">{stats.active}</p>
            <p className="stat-foot">✅ 状态正常的用户</p>
          </div>
          <div className="stat-box">
            <p className="stat-label">监控中</p>
            <p className="stat-value">{stats.monitoring}</p>
            <p className="stat-foot">📊 正在监控的用户</p>
          </div>
          <div className="stat-box">
            <p className="stat-label">今日已发</p>
            <p className="stat-value">{stats.sentToday}</p>
            <p className="stat-foot">📨 今日发送通知</p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>群发邮件</h3>
              <p className="helper-text">发送给所有状态正常的用户</p>
            </div>
          </div>
          <div className="form-body">
            <div className="form-field">
              <label>邮件标题</label>
              <input
                type="text"
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
                placeholder="请输入标题"
              />
            </div>
            <div className="form-field">
              <label>邮件内容</label>
              <textarea
                rows={6}
                value={broadcastContent}
                onChange={(e) => setBroadcastContent(e.target.value)}
                placeholder="请输入邮件内容"
              />
            </div>
            <div className="form-actions">
              <button
                className="btn-primary"
                type="button"
                onClick={sendBroadcastEmail}
                disabled={isBroadcasting}
              >
                {isBroadcasting ? '发送中...' : '发送给全部正常用户'}
              </button>
            </div>
          </div>
        </div>

        {/* 用户表格 */}
        <div className="panel">
          <div className="panel-header">
            <h3>用户列表</h3>
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              + 新增用户
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户</th>
                <th>邮箱</th>
                <th>状态</th>
                <th>套餐</th>
                <th>监控品种</th>
                <th>通知模式</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.user_id}</td>
                  <td>
                    <div className="name-cell">
                      <strong>{u.name}</strong>
                    </div>
                  </td>
                  <td>
                    <Link to={`/config?email=${encodeURIComponent(u.email)}`} className="email-link">
                      {u.email}
                    </Link>
                  </td>
                  <td>
                    <span className={`status-tag ${u.status}`}>
                      {u.status === 'active' ? '正常' : '已暂停'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-tag ${u.plan}`}>
                      {u.plan === 'paid' ? '付费' : '试用'}
                    </span>
                  </td>
                  <td>
                    {u.assets?.map((asset) => (
                      <span key={asset} className="chip active">
                        {asset === 'gold' ? '黄金' : '白银'}
                      </span>
                    ))}
                  </td>
                  <td>
                    {formatNotifyModes(
                      normalizeNotifyModes(u.notifyModes || u.notifyMode),
                      u.intervalHours,
                      u.dropThreshold,
                      u.priceThreshold
                    )}
                  </td>
                  <td>{u.created_at?.split('T')[0]}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="action-link edit"
                        onClick={() => openEditModal(u)}
                      >
                        编辑
                      </button>
                      {u.status === 'active' ? (
                        <button
                          className="action-link warning"
                          onClick={() => pauseUser(u.id)}
                        >
                          暂停
                        </button>
                      ) : (
                        <button
                          className="action-link success"
                          onClick={() => confirmResume(u.id)}
                        >
                          恢复
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 最近通知 */}
        <div className="panel">
          <div className="panel-header">
            <h3>最近通知</h3>
            <span className="link-btn">
              最近5条记录
            </span>
          </div>
          <div className="logs-list">
            {logs.length === 0 ? (
              <div className="no-logs">
                <span className="no-logs-icon">📭</span>
                <span>暂无通知记录</span>
              </div>
            ) : (
              logs.slice(0, 5).map((log) => (
                <div key={log.id} className="log-item">
                  <div className="log-info">
                    <span className="log-user">{log.user_name || log.user_id}</span>
                    <span className="log-asset">{log.asset}</span>
                    <span className="log-mode">{log.mode}</span>
                  </div>
                  <div className="log-meta">
                    <span className={`log-status ${log.status}`}>
                      {log.status === 'sent' ? '已发送' : '待发送'}
                    </span>
                    <span className="log-time">
                      {log.sent_at || log.created_at}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* 新增/编辑用户弹窗 */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? '编辑用户' : '新增用户'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>邮箱</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                  placeholder="请输入邮箱"
                />
              </div>
              <div className="form-field">
                <label>用户套餐</label>
                <select
                  value={form.plan}
                  onChange={(e) => updateForm('plan', e.target.value)}
                >
                  <option value="paid">付费</option>
                  <option value="trial">试用</option>
                </select>
              </div>
              <div className="form-field">
                <label>监控品种</label>
                <div className="asset-chips">
                  <label className={`chip ${form.assets.includes('gold') ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={form.assets.includes('gold')}
                      onChange={() => toggleAsset('gold')}
                    />
                    <span className="check">✓</span>
                    <span>黄金</span>
                  </label>
                  <label className={`chip ${form.assets.includes('silver') ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={form.assets.includes('silver')}
                      onChange={() => toggleAsset('silver')}
                    />
                    <span className="check">✓</span>
                    <span>白银</span>
                  </label>
                </div>
              </div>
              <div className="form-field">
                <label>通知模式</label>
                <div className="notify-options">
                  <label
                    className={`notify-option ${
                      form.notifyModes.includes('interval') ? 'active' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.notifyModes.includes('interval')}
                      onChange={() => toggleNotifyMode('interval')}
                    />
                    <span>定时提醒</span>
                  </label>
                  <label
                    className={`notify-option ${
                      form.notifyModes.includes('drop') ? 'active' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.notifyModes.includes('drop')}
                      onChange={() => toggleNotifyMode('drop')}
                    />
                    <span>价格浮动提醒</span>
                  </label>
                  <label
                    className={`notify-option ${
                      form.notifyModes.includes('threshold') ? 'active' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.notifyModes.includes('threshold')}
                      onChange={() => toggleNotifyMode('threshold')}
                    />
                    <span>价格提醒</span>
                  </label>
                </div>
              </div>
              {form.notifyModes.includes('interval') && (
                <div className="form-field">
                  <label>间隔时间（小时）</label>
                  <select
                    value={form.intervalHours}
                    onChange={(e) =>
                      updateForm('intervalHours', Number(e.target.value))
                    }
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((hour) => (
                      <option key={hour} value={hour}>
                        {hour} 小时
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.notifyModes.includes('drop') && (
                <div className="form-field">
                  <label>价格浮动比例</label>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={form.dropThreshold}
                      onChange={(e) =>
                        updateForm('dropThreshold', Number(e.target.value))
                      }
                    />
                    <span className="input-suffix">%</span>
                  </div>
                </div>
              )}
              {form.notifyModes.includes('threshold') && (
                <div className="form-field">
                  <label>价格提醒阈值（元/克）</label>
                  <input
                    type="number"
                    min="1"
                    value={form.priceThreshold}
                    onChange={(e) =>
                      updateForm('priceThreshold', Number(e.target.value))
                    }
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>
                取消
              </button>
              <button className="btn-primary" onClick={saveUser}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 恢复确认弹窗 */}
      {resumeModalOpen && (
        <div className="modal-overlay" onClick={() => setResumeModalOpen(false)}>
          <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认恢复</h3>
            </div>
            <div className="modal-body">
              <p className="confirm-text">确定要恢复该用户的权限吗？</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setResumeModalOpen(false)}
              >
                取消
              </button>
              <button className="btn-success" onClick={executeResume}>
                恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { adminApi, configApi, logsApi } from '../services/api';
import './UserConfig.css';

function UserConfig() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [config, setConfig] = useState({
    monitorGold: true,
    monitorSilver: false,
    notifyModes: ['interval'],
    intervalHours: 2,
    dropThreshold: 5,
    priceThreshold: 500,
  });

  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [searchEmail, setSearchEmail] = useState('');
  const [resultUser, setResultUser] = useState(null);
  const [resultConfig, setResultConfig] = useState(null);
  const [resultLogs, setResultLogs] = useState([]);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (isAdmin()) {
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        const [configData, logsData] = await Promise.all([
          configApi.get(),
          logsApi.getMyLogs(),
        ]);
        const notifyModes = Array.isArray(configData.notify_modes)
          ? configData.notify_modes
          : typeof configData.notify_mode === 'string'
          ? configData.notify_mode.split(',').map((item) => item.trim()).filter(Boolean)
          : [];
        setConfig({
          monitorGold: configData.monitor_gold ?? true,
          monitorSilver: configData.monitor_silver ?? false,
          notifyModes: notifyModes.length ? notifyModes : ['interval'],
          intervalHours: configData.interval_hours || 2,
          dropThreshold: configData.drop_threshold || 5,
          priceThreshold: configData.price_threshold || 500,
        });
        setLogs(logsData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isAdmin]);

  const logsPageSize = 10;

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((logs?.length || 0) / logsPageSize));
    setLogsPage((prev) => Math.min(Math.max(prev, 1), totalPages));
  }, [logs, logsPageSize]);

  const formatNotifyMode = (mode) => {
    const modes = Array.isArray(mode)
      ? mode
      : typeof mode === 'string'
      ? mode.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    if (!modes.length) {
      return '--';
    }
    return modes
      .map((item) => {
        if (item === 'interval') return '定时提醒';
        if (item === 'drop') return '价格浮动提醒';
        if (item === 'threshold') return '价格提醒';
        return item;
      })
      .join('、');
  };

  const formatAssets = (cfg) => {
    if (!cfg) return '--';
    const assets = [];
    if (cfg.monitor_gold) assets.push('黄金');
    if (cfg.monitor_silver) assets.push('白银');
    return assets.length ? assets.join('、') : '无';
  };

  const formatLogContent = (content) => {
    if (!content) return '--';
    const parts = content.split(';');
    const map = {};
    parts.forEach(p => {
      const [k, v] = p.split('=');
      if (k && v) map[k] = v;
    });

    if (map.error) {
      return `⚠️ 发送失败: ${map.error}`;
    }

    // Interval: 【定时播报】黄金/白银最新行情
    if (map.interval) {
      return `【定时播报】黄金/白银最新行情 (间隔: ${map.interval}h)`;
    }

    // Threshold: 【黄金阈值提醒】已达到 580 元/克
    if (map.threshold && map.price) {
      const assetName = map.label || (map.category === 'anchor' ? '白银' : '黄金');
      const dirText = map.dir === 'down' ? '下跌' : '上涨';
      return `【${assetName}阈值提醒】${dirText}至 ${map.price}元/克 (阈值: ${map.threshold})`;
    }

    // Drop: 【黄金价格变动】积存金(工行) 下跌 2.5%
    if (map.change_percent) {
      const assetName = map.label || (map.category === 'anchor' ? '白银' : '黄金');
      const dirText = map.dir === 'down' ? '下跌' : '上涨';
      return `【${assetName}价格变动】${dirText} ${map.change_percent}% (阈值: ${map.threshold}%)`;
    }
    
    // Fallback
    const items = [];
    if (map.dir) items.push(`方向: ${map.dir === 'up' ? '涨' : '跌'}`);
    if (map.price) items.push(`价格: ${map.price}`);
    return items.join(' | ') || content;
  };

  const handleSearch = useCallback(async ({ email, userId } = {}) => {
    const targetEmail = email;
    if (!targetEmail && !userId) {
      setSearchError('请输入用户邮箱');
      return;
    }

    try {
      setIsSearching(true);
      setSearchError('');
      const data = await adminApi.getUserInfo({
        email: targetEmail || undefined,
        userId: userId || undefined,
      });
      if (data?.found === false) {
        setResultUser(null);
        setResultConfig(null);
        setResultLogs([]);
        setSearchError('用户不存在');
        return;
      }
      setResultUser(data.user || null);
      setResultConfig(data.config || null);
      setResultLogs(data.logs || []);
    } catch (error) {
      setSearchError(error.message);
      setResultUser(null);
      setResultConfig(null);
      setResultLogs([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin()) {
      return;
    }
    const params = new URLSearchParams(location.search);
    const email = params.get('email');
    const userId = params.get('userId');
    if (email || userId) {
      if (email) {
        setSearchEmail(email);
      }
      handleSearch({ email, userId });
    }
  }, [location.search, isAdmin, handleSearch]);

  const handleSave = async () => {
    if (!config.notifyModes.length) {
      setSaveMessage('请选择至少一种通知方式');
      return;
    }
    if (config.notifyModes.includes('interval') && !Number.isFinite(config.intervalHours)) {
      setSaveMessage('请设置提醒间隔');
      return;
    }
    if (config.notifyModes.includes('drop') && !Number.isFinite(config.dropThreshold)) {
      setSaveMessage('请设置价格浮动比例');
      return;
    }
    if (config.notifyModes.includes('threshold') && !Number.isFinite(config.priceThreshold)) {
      setSaveMessage('请设置价格提醒阈值');
      return;
    }
    setIsSaving(true);
    try {
      await configApi.update({
        monitor_gold: config.monitorGold,
        monitor_silver: config.monitorSilver,
        notify_modes: config.notifyModes,
        notify_mode: config.notifyModes.join(','),
        interval_hours: config.notifyModes.includes('interval') ? config.intervalHours : null,
        drop_threshold: config.notifyModes.includes('drop') ? config.dropThreshold : null,
        price_threshold: config.notifyModes.includes('threshold') ? config.priceThreshold : null,
      });
      setSaveMessage('保存成功！');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('保存失败: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="user-config-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  const formatTime = (isoString) => {
    if (!isoString) return '--';
    try {
      return new Date(isoString).toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        timeZone: 'Asia/Shanghai'
      });
    } catch {
      return isoString;
    }
  };

  const handleClosePreview = () => setPreviewHtml(null);

  const logsTotalPages = Math.max(1, Math.ceil((logs?.length || 0) / logsPageSize));
  const logsPageStart = (logsPage - 1) * logsPageSize;
  const pagedLogs = logs.slice(logsPageStart, logsPageStart + logsPageSize);

  return (
    <div className="config-layout">
      {previewHtml && (
        <div className="preview-overlay" onClick={handleClosePreview}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3>邮件预览</h3>
              <button className="close-btn" onClick={handleClosePreview}>×</button>
            </div>
            <div className="preview-content">
              <iframe 
                srcDoc={previewHtml} 
                title="Email Preview"
                style={{ width: '100%', height: '500px', border: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
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
          {isAdmin() ? (
            <>
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
            </>
          ) : (
            <Link
              to="/config"
              className={`nav-item ${location.pathname === '/config' ? 'active' : ''}`}
            >
              <span className="nav-icon">⚙️</span>
              <span className="nav-text">用户设置</span>
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-profile">
            <span className="user-avatar">👤</span>
            <div className="user-details">
              <span className="user-name">{user?.name || '用户'}</span>
              <span className="user-role">
                {isAdmin() ? '超级管理员' : user?.email}
              </span>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <span className="logout-text">退出登录</span>
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className={`main-content ${sidebarCollapsed ? 'expanded' : ''}`}>
        {isAdmin() ? (
          <div className="dashboard-grid">
            <div className="dashboard-card full-width">
              <div className="card-header">
                <h3>用户邮箱查询</h3>
              </div>
              <div className="search-bar">
                <input
                  className="search-input"
                  placeholder="请输入用户邮箱"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch({ email: searchEmail.trim() });
                    }
                  }}
                />
                <button
                  className="search-btn"
                  onClick={() => handleSearch({ email: searchEmail.trim() })}
                  disabled={isSearching || !searchEmail.trim()}
                >
                  {isSearching ? '查询中...' : '查询'}
                </button>
              </div>
              {searchError && <div className="search-error">{searchError}</div>}
            </div>

            <div className="dashboard-card">
              <div className="card-header">
                <h3>用户信息</h3>
              </div>
              {resultUser ? (
                <div className="info-list">
                  <div className="info-item">
                    <span className="info-label">用户ID</span>
                    <span className="info-value">{resultUser.user_id}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">姓名</span>
                    <span className="info-value">{resultUser.name}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">邮箱</span>
                    <span className="info-value">{resultUser.email}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">角色</span>
                    <span className="info-value">{resultUser.role}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">状态</span>
                    <span className="info-value">{resultUser.status}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">套餐</span>
                    <span className="info-value">{resultUser.plan}</span>
                  </div>
                </div>
              ) : (
                <div className="empty-state">暂无用户信息</div>
              )}
            </div>

            <div className="dashboard-card">
              <div className="card-header">
                <h3>配置信息</h3>
              </div>
              {resultConfig ? (
                <div className="info-list">
                  <div className="info-item">
                    <span className="info-label">监控品种</span>
                    <span className="info-value">{formatAssets(resultConfig)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">通知方式</span>
                    <span className="info-value">
                      {formatNotifyMode(resultConfig.notify_modes || resultConfig.notify_mode)}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">间隔小时</span>
                    <span className="info-value">
                      {(resultConfig.notify_modes || resultConfig.notify_mode || '')
                        .toString()
                        .includes('interval')
                        ? resultConfig.interval_hours ?? '--'
                        : '--'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">价格浮动比例</span>
                    <span className="info-value">
                      {(resultConfig.notify_modes || resultConfig.notify_mode || '')
                        .toString()
                        .includes('drop')
                        ? resultConfig.drop_threshold !== null && resultConfig.drop_threshold !== undefined
                          ? `${resultConfig.drop_threshold}%`
                          : '--'
                        : '--'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">价格提醒阈值</span>
                    <span className="info-value">
                      {(resultConfig.notify_modes || resultConfig.notify_mode || '')
                        .toString()
                        .includes('threshold')
                        ? resultConfig.price_threshold !== null && resultConfig.price_threshold !== undefined
                          ? `${resultConfig.price_threshold}元/克`
                          : '--'
                        : '--'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="empty-state">暂无配置信息</div>
              )}
            </div>

            <div className="dashboard-card logs-card full-width">
              <div className="card-header">
                <h3>用户操作信息</h3>
              </div>
              <div className="logs-list">
                {resultLogs.length === 0 ? (
                  <div className="no-logs">暂无操作记录</div>
                ) : (
                  resultLogs.slice(0, 20).map((log) => (
                    <div key={log.id} className="log-item">
                      <div className="log-time">{formatTime(log.sent_at || log.created_at)}</div>
                      <div className="log-recipient">{resultUser?.email}</div>
                      <div className="log-info">
                      <span className="log-asset">{log.asset}</span>
                      <span className="log-mode">{log.mode}</span>
                    </div>
                    <div 
                      className="log-content-detail clickable" 
                      title="点击预览邮件"
                      onClick={() => log.html_content && setPreviewHtml(log.html_content)}
                    >
                      {formatLogContent(log.content)}
                      {log.html_content && <span className="preview-icon"> 👁️</span>}
                    </div>
                    <div className="log-meta">
                      <span className={`log-status ${log.status}`}>
                          {log.status === 'sent' ? '已发送' : '失败'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="dashboard-grid">
              <div className="dashboard-card config-card">
                <div className="card-header">
                  <h3>⚙️ 监控配置</h3>
                  {saveMessage && <span className="save-message">{saveMessage}</span>}
                </div>

                <div className="config-form">
                  <div className="config-section">
                    <label className="config-label">监控品种</label>
                    <div className="checkbox-group">
                      <label className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={config.monitorGold}
                          onChange={(e) => setConfig({ ...config, monitorGold: e.target.checked })}
                        />
                        <span className="checkbox-label">黄金（积存金、基准金价和首饰金）</span>
                      </label>
                      <label className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={config.monitorSilver}
                          onChange={(e) => setConfig({ ...config, monitorSilver: e.target.checked })}
                        />
                        <span className="checkbox-label">白银</span>
                      </label>
                    </div>
                  </div>

                  <div className="config-section">
                    <label className="config-label">通知方式</label>
                    <div className="notify-options">
                      <label
                        className={`notify-option ${
                          config.notifyModes.includes('interval') ? 'active' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={config.notifyModes.includes('interval')}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              notifyModes: e.target.checked
                                ? [...config.notifyModes, 'interval']
                                : config.notifyModes.filter((mode) => mode !== 'interval'),
                            })
                          }
                        />
                        <span>定时提醒</span>
                      </label>
                      <label
                        className={`notify-option ${
                          config.notifyModes.includes('drop') ? 'active' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={config.notifyModes.includes('drop')}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              notifyModes: e.target.checked
                                ? [...config.notifyModes, 'drop']
                                : config.notifyModes.filter((mode) => mode !== 'drop'),
                            })
                          }
                        />
                        <span>价格浮动提醒</span>
                      </label>
                      <label
                        className={`notify-option ${
                          config.notifyModes.includes('threshold') ? 'active' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={config.notifyModes.includes('threshold')}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              notifyModes: e.target.checked
                                ? [...config.notifyModes, 'threshold']
                                : config.notifyModes.filter((mode) => mode !== 'threshold'),
                            })
                          }
                        />
                        <span>价格提醒</span>
                      </label>
                    </div>
                  </div>

                  {config.notifyModes.includes('interval') && (
                    <div className="config-section">
                      <label className="config-label">提醒间隔（小时）</label>
                      <select
                        className="config-select"
                        value={config.intervalHours}
                        onChange={(e) =>
                          setConfig({ ...config, intervalHours: Number(e.target.value) })
                        }
                      >
                        {[1, 2, 4, 8, 16].map((hour) => (
                          <option key={hour} value={hour}>
                            {hour} 小时
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {config.notifyModes.includes('drop') && (
                    <div className="config-section">
                      <label className="config-label">价格浮动比例</label>
                      <div className="config-input-group">
                        <input
                          type="number"
                          className="config-input"
                          min="1"
                          max="50"
                          value={config.dropThreshold}
                          onChange={(e) =>
                            setConfig({ ...config, dropThreshold: Number(e.target.value) })
                          }
                        />
                        <span className="input-suffix">%</span>
                      </div>
                    </div>
                  )}

                  {config.notifyModes.includes('threshold') && (
                    <div className="config-section">
                      <label className="config-label">价格提醒阈值（元/克）</label>
                      <input
                        type="number"
                        className="config-input"
                        min="1"
                        value={config.priceThreshold}
                        onChange={(e) =>
                          setConfig({ ...config, priceThreshold: Number(e.target.value) })
                        }
                      />
                    </div>
                  )}

                  <button
                    className="save-btn"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? '保存中...' : '保存配置'}
                  </button>
                  <div className="input-hint">
                    频率与静默规则：同一方向的价格提醒每 30 分钟最多发送 1 次，夜间 23:00–07:00 默认静默。在此期间不会发邮件给用户
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-card logs-card">
              <div className="card-header">
                <h3>📋 最近通知</h3>
                {logs.length > 0 && (
                  <div className="logs-pager">
                    <button
                      className="pager-btn"
                      onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                      disabled={logsPage <= 1}
                      type="button"
                    >
                      上一页
                    </button>
                    <span className="pager-info">
                      第 {logsPage}/{logsTotalPages} 页 · 共 {logs.length} 条
                    </span>
                    <button
                      className="pager-btn"
                      onClick={() =>
                        setLogsPage((p) => Math.min(logsTotalPages, p + 1))
                      }
                      disabled={logsPage >= logsTotalPages}
                      type="button"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>
              <div className="logs-list">
                {logs.length > 0 && (
                  <div className="notice-row notice-header">
                    <div className="notice-cell notice-time">时间</div>
                    <div className="notice-cell notice-mode">订阅类型</div>
                    <div className="notice-cell notice-content">邮件内容</div>
                    <div className="notice-cell notice-status">状态</div>
                  </div>
                )}
                {pagedLogs.map((log) => (
                  <div key={log.id} className="notice-row">
                    <div className="notice-cell notice-time">{formatTime(log.sent_at || log.created_at)}</div>
                    <div className="notice-cell notice-mode">
                      {log.asset === 'gold' ? '黄金' : log.asset === 'silver' ? '白银' : '综合'}
                    </div>
                    <div
                      className={`notice-cell notice-content ${log.html_content ? 'clickable' : ''}`}
                      title={log.html_content ? '点击预览邮件' : log.content}
                      onClick={() => log.html_content && setPreviewHtml(log.html_content)}
                    >
                      {formatLogContent(log.content)}
                      {log.html_content && <span className="preview-icon"> 👁️</span>}
                    </div>
                    <div className="notice-cell notice-status">
                      <span className={`log-status ${log.status}`}>
                        {log.status === 'sent' ? '已发送' : '失败'}
                      </span>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="no-logs">暂无通知记录</div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default UserConfig;

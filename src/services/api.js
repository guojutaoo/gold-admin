const API_BASE_URL = import.meta.env.DEV
  ? '/api'
  : '/api';

// 获取 token
const getToken = () => localStorage.getItem('token');

// 通用请求函数
async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = `${API_BASE_URL}${url}`;
  console.log('[API Request]', options.method || 'GET', fullUrl);

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  console.log('[API Response]', response.status, fullUrl);

  // 检查响应类型
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('[API Error] Non-JSON response:', text.substring(0, 200));
    throw new Error('Server returned non-JSON response. Is the backend server running?');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return data;
}

// ==================== 认证相关 ====================

export const authApi = {
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () =>
    request('/auth/me'),
};

// ==================== 用户管理 ====================

export const usersApi = {
  getAll: () =>
    request('/users'),

  create: (userData) =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  update: (id, userData) =>
    request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),

  delete: (id) =>
    request(`/users/${id}`, {
      method: 'DELETE',
    }),
};

// ==================== 用户配置 ====================

export const configApi = {
  get: () =>
    request('/config'),

  update: (config) =>
    request('/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};

// ==================== 通知日志 ====================

export const logsApi = {
  getMyLogs: () =>
    request('/logs'),

  getAllLogs: () =>
    request('/logs/all'),

  create: (logData) =>
    request('/logs', {
      method: 'POST',
      body: JSON.stringify(logData),
    }),
};

// ==================== 金价 ====================

export const pricesApi = {
  getGoldPrices: () =>
    request('/gold-prices'),
};

// ==================== 管理员查询 ====================

export const adminApi = {
  getUserInfo: ({ email, userId }) => {
    const params = new URLSearchParams();
    if (email) {
      params.append('email', email);
    }
    if (userId) {
      params.append('userId', userId);
    }
    return request(`/admin/user-info?${params.toString()}`);
  },
  sendBroadcastEmail: ({ subject, content }) =>
    request('/admin/broadcast-email', {
      method: 'POST',
      body: JSON.stringify({ subject, content }),
    }),
};

// ==================== 统计 ====================

export const statsApi = {
  getStats: () =>
    request('/stats'),
};

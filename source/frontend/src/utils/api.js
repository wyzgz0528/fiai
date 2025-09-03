import axios from 'axios';
import { message } from 'antd';

// 全局导航函数，用于在API拦截器中进行路由跳转
let globalNavigate = null;
export const setGlobalNavigate = (navigate) => {
  globalNavigate = navigate;
};

// 防止重复刷新token的标志
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// 创建axios实例
const isLocalStatic = typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '5173';
const API_BASE = import.meta.env.VITE_API_BASE_URL;
const api = axios.create({
  // 优先使用环境变量；
  // - 开发/本地静态预览：指向 3001 开发后端
  // - 生产：不设置前缀（空字符串），这样各处写的以 /api 开头的路径不会叠加成 /api/api
  baseURL: API_BASE || ((import.meta.env.DEV || isLocalStatic) ? 'http://localhost:3001' : ''),
  timeout: 30000, // 增加超时时间到30秒
  // 跨域时允许携带并接收 Cookie（登录接口返回的 Set-Cookie 才能被浏览器保存）
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    console.log('发送请求:', config.method?.toUpperCase(), config.url);
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    console.log('收到响应:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    console.error('响应错误:', error);
    
    const originalRequest = error.config;
    
    // 处理token过期的情况
    if (error.response?.status === 401 && !originalRequest._retry) {
      const errorMsg = error.response?.data?.msg;
      
      // 如果是身份过期错误且不是登录或刷新token接口
      if (errorMsg?.includes('身份已过期') && !originalRequest.url.includes('/login') && !originalRequest.url.includes('/refresh-token')) {
        if (isRefreshing) {
          // 如果已经在刷新token，将请求加入队列
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          }).catch(err => {
            return Promise.reject(err);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // 尝试刷新token
          const refreshResponse = await api.post('/api/user/refresh-token');
          const newToken = refreshResponse.data.token;
          
          // 更新本地存储的token
          localStorage.setItem('token', newToken);
          
          // 更新axios默认header
          api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
          
          // 处理队列中的请求
          processQueue(null, newToken);
          
          // 重试原始请求
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
          
        } catch (refreshError) {
          // 刷新token失败，清除本地数据并跳转到登录页
          processQueue(refreshError, null);
          
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('real_name');
          localStorage.removeItem('user_id');
          localStorage.removeItem('username');
          
          message.error('登录已过期，请重新登录');

          // 延迟跳转，让用户看到错误信息
          setTimeout(() => {
            if (globalNavigate) {
              // 使用 React Router 的导航函数
              globalNavigate('/login');
            } else {
              // 回退方案：使用 window.location
              window.location.href = '/login';
            }
          }, 1500);
          
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }
    
    if (error.code === 'ECONNABORTED') {
      message.error('请求超时，请检查网络连接');
    } else if (error.response) {
      const { status, data } = error.response;
      switch (status) {
        case 401:
          if (!data?.msg?.includes('身份已过期')) {
            message.error('登录失败，请检查用户名和密码');
          }
          break;
        case 403:
          message.error('权限不足');
          break;
        case 404: {
          const msg = data?.msg || data?.error || '接口不存在';
          message.error(msg);
          break;
        }
        case 500:
          message.error('服务器错误，请稍后重试');
          break;
        default:
          message.error(data?.error || '请求失败');
      }
    } else {
      message.error('网络错误，请检查连接');
    }
    
    return Promise.reject(error);
  }
);

// API客户端
const apiClient = {
  get: (url, config) => api.get(url, config),
  post: (url, data, config) => api.post(url, data, config),
  put: (url, data, config) => api.put(url, data, config),
  delete: (url, config) => api.delete(url, config),
  upload: (url, formData, config) => api.post(url, formData, { ...config, headers: { 'Content-Type': 'multipart/form-data' } }),
  download: (url, filename) => api.get(url, { responseType: 'blob' }).then(response => {
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  })
};

// 用户API
export const userApi = {
  login: async (credentials) => {
    try {
      console.log('尝试登录:', credentials);
      const response = await api.post('/api/user/login', credentials);
      console.log('登录成功:', response.data);
      return response.data;
    } catch (error) {
      console.error('登录错误:', error);
      throw error;
    }
  },
  
  register: async (userData) => {
    try {
      const response = await api.post('/api/user/register', userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  refreshToken: async () => {
    try {
      const response = await api.post('/api/user/refresh-token');
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  getProfile: async () => {
    try {
      const response = await api.get('/api/user/profile');
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  updateProfile: async (profileData) => {
    try {
      const response = await api.put('/api/user/profile', profileData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// 简单实现 loanApi、reimbursementApi、systemApi，便于前端导入
export const loanApi = {
  getAll: (config) => api.get('/api/loans', config),
  getById: (id, config) => api.get(`/api/loans/${id}`, config),
  create: (data, config) => api.post('/api/loans', data, config),
  repay: (id, data, config) => api.post(`/api/loans/${id}/repay`, data, config),
  // 可根据实际需要补充其它方法
};

export const reimbursementApi = {
  getAll: (config) => api.get('/api/reimbursement/reimbursement-forms', config),
  getById: (id, config) => api.get(`/api/reimbursement/reimbursement-forms/${id}`, config),
  create: (data, config) => api.post('/api/reimbursement/reimbursement-forms/auto-generate', data, config),
  confirmPayment: (id, data, config) => api.post(`/api/reimbursement/reimbursement-forms/${id}/confirm-payment`, data, config),
  // 批量下载ZIP（返回blob）
  batchDownloadZip: (formIds) => api.post('/api/reimbursement/admin/batch-download', { formIds }, { responseType: 'blob' }),
  // 可根据实际需要补充其它方法
};

export const systemApi = {
  getStats: (config) => api.get('/api/system/stats', config),
  getStatsMine: () => api.get('/api/system/stats', { params: { scope: 'mine' } }),
  getStatsByUser: (userId) => api.get('/api/system/stats', { params: { userId } }),
  // 可根据实际需要补充其它方法
};

// 导出 api 实例以支持直接使用
export { api };

export default apiClient;
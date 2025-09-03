// 身份验证相关工具函数

// 检查token是否即将过期（剩余时间少于1小时）
export const isTokenExpiringSoon = () => {
  const token = localStorage.getItem('token');
  if (!token) return true;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // 转换为毫秒
    const now = Date.now();
    const timeLeft = exp - now;
    
    // 如果剩余时间少于1小时，返回true
    return timeLeft < 60 * 60 * 1000;
  } catch (error) {
    console.error('解析token失败:', error);
    return true;
  }
};

// 检查token是否已过期
export const isTokenExpired = () => {
  const token = localStorage.getItem('token');
  if (!token) return true;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // 转换为毫秒
    const now = Date.now();
    
    return exp < now;
  } catch (error) {
    console.error('解析token失败:', error);
    return true;
  }
};

// 获取token剩余时间（毫秒）
export const getTokenTimeLeft = () => {
  const token = localStorage.getItem('token');
  if (!token) return 0;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // 转换为毫秒
    const now = Date.now();
    
    return Math.max(0, exp - now);
  } catch (error) {
    console.error('解析token失败:', error);
    return 0;
  }
};

// 格式化剩余时间为可读字符串
export const formatTimeLeft = (milliseconds) => {
  const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
  const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days}天${hours}小时`;
  } else if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  } else {
    return `${minutes}分钟`;
  }
};

// 清除所有登录信息
export const clearAuthData = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('real_name');
  localStorage.removeItem('user_id');
  localStorage.removeItem('username');
};

// 检查是否已登录
export const isLoggedIn = () => {
  return localStorage.getItem('token') && !isTokenExpired();
};

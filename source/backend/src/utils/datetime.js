// 统一的时间处理工具
// 为中国业务系统提供北京时间支持

/**
 * 获取当前北京时间的字符串表示
 * @returns {string} 格式：'YYYY-MM-DD HH:mm:ss'
 */
function getCurrentBeijingTime() {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

/**
 * 获取当前北京时间的ISO字符串（用于数据库存储）
 * @returns {string} 格式：'YYYY-MM-DDTHH:mm:ss'
 */
function getCurrentBeijingTimeISO() {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().replace('Z', '').substring(0, 19);
}

/**
 * 将UTC时间转换为北京时间字符串
 * @param {string|Date} utcTime UTC时间
 * @returns {string} 北京时间字符串
 */
function utcToBeijingTime(utcTime) {
  const date = new Date(utcTime);
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

/**
 * 格式化时间为中国习惯的显示格式
 * @param {string|Date} time 时间
 * @returns {string} 格式：'YYYY/M/D HH:mm:ss'
 */
function formatChineseDateTime(time) {
  const date = new Date(time);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  getCurrentBeijingTime,
  getCurrentBeijingTimeISO,
  utcToBeijingTime,
  formatChineseDateTime
};

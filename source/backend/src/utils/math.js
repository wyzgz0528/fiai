/**
 * 数学工具函数
 */

/**
 * 四舍五入到小数点后2位
 * @param {number|string} n - 要四舍五入的数字
 * @returns {number} 四舍五入后的数字
 */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * 安全的数字转换，确保结果为有效数字
 * @param {any} value - 要转换的值
 * @param {number} defaultValue - 默认值
 * @returns {number} 转换后的数字
 */
function safeNumber(value, defaultValue = 0) {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * 格式化金额显示（保留2位小数）
 * @param {number|string} amount - 金额
 * @returns {string} 格式化后的金额字符串
 */
function formatAmount(amount) {
  return round2(amount).toFixed(2);
}

/**
 * 计算数组中数字的总和，并四舍五入到2位小数
 * @param {Array} numbers - 数字数组
 * @returns {number} 总和
 */
function sumAndRound(numbers) {
  const sum = numbers.reduce((total, num) => total + safeNumber(num), 0);
  return round2(sum);
}

module.exports = {
  round2,
  safeNumber,
  formatAmount,
  sumAndRound
};

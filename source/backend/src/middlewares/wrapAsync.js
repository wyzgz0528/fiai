// 简化 async 路由错误捕获并支持直接抛 BizError
module.exports = function wrapAsync(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

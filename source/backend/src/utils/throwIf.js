const { BizError } = require('../middlewares/errorHandler');

// 条件为真则抛出指定业务错误码
function throwIf(condition, code, message, extra) {
  if (condition) throw new BizError(code, message, extra);
}

module.exports = { throwIf };

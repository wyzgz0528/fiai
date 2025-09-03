// 错误码元数据：统一 http 状态、默认 message、是否建议重试等
// 仅维护纯数据，不放逻辑，以便前端/文档生成复用
const CODES = require('./errorCodes');

// 约定字段：
// http: HTTP 状态码
// message: 默认描述（可被实际抛出时覆盖）
// retry: 客户端是否可立刻重试（true/false/'after-fix'）
// level: 建议日志级别(info|warn|error)
// clientAction: 前端建议动作(refresh|silent|show-dialog|none)

const meta = {
  [CODES.FORM_NOT_FOUND]:      { http: 404, message: '表单不存在', retry: false, level: 'info',  clientAction: 'refresh' },
  [CODES.LOAN_NOT_FOUND]:      { http: 404, message: '借款记录不存在', retry: false, level: 'info',  clientAction: 'refresh' },
  [CODES.FORBIDDEN]:           { http: 403, message: '权限不足', retry: false, level: 'warn',  clientAction: 'show-dialog' },
  [CODES.USER_MISMATCH]:       { http: 403, message: '用户不匹配', retry: false, level: 'warn',  clientAction: 'show-dialog' },
  [CODES.INVALID_STATE]:       { http: 422, message: '当前状态不允许此操作', retry: false, level: 'info',  clientAction: 'refresh' },
  [CODES.INVALID_ITEM]:        { http: 422, message: '提交内容不合法', retry: 'after-fix', level: 'info',  clientAction: 'show-dialog' },
  [CODES.INVALID_RECORD_IDS]:  { http: 422, message: '记录 ID 无效', retry: 'after-fix', level: 'info',  clientAction: 'show-dialog' },
  [CODES.UNPROCESSED_RECORDS]: { http: 422, message: '仍有未处理记录', retry: false, level: 'info',  clientAction: 'none' },
  [CODES.LOAN_INVALID_STATUS]: { http: 422, message: '借款状态不允许此操作', retry: false, level: 'info',  clientAction: 'refresh' },
  [CODES.LOAN_INSUFFICIENT]:   { http: 422, message: '借款余额不足', retry: false, level: 'info',  clientAction: 'show-dialog' },
  [CODES.CONFLICT]:            { http: 409, message: '数据版本冲突，请刷新后重试', retry: true, level: 'warn',  clientAction: 'refresh' },
  [CODES.IDEMPOTENT_REPLAY]:   { http: 200, message: '重复提交（已使用历史结果）', retry: false, level: 'info',  clientAction: 'silent' }
};

function getErrorMeta(code) {
  return meta[code];
}

module.exports = {
  errorMeta: meta,
  getErrorMeta
};

const winston = require('winston');
const { getErrorMeta } = require('../constants/errorMeta');

// 根据环境决定是否写入文件，测试环境避免保持文件句柄
const useFile = process.env.NODE_ENV !== 'test' && !process.env.DISABLE_FILE_LOG;
const transports = [];
if (useFile) {
  transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  transports.push(new winston.transports.File({ filename: 'logs/combined.log' }));
}
// 控制台输出：非生产环境 或 显式开启 CONSOLE_LOG
if (process.env.NODE_ENV !== 'production' || process.env.CONSOLE_LOG) {
  transports.push(new winston.transports.Console({ format: winston.format.simple() }));
}

// 若未配置任何 transport（例如生产环境且禁用文件且未开启控制台），兜底增加控制台输出，避免内存警告
if (transports.length === 0) {
  transports.push(new winston.transports.Console({ format: winston.format.simple() }));
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports
});

// 统一错误处理中间件
const errorHandler = (err, req, res, next) => {
  // 优先从 AppError / 业务 code 解析 http
  let payloadCode = err.code; // 约定 AppError(code) 时写入
  let statusCode;
  let clientMessage;

  if (payloadCode) {
    const m = getErrorMeta(payloadCode);
    if (m) {
      statusCode = m.http;
      clientMessage = err.message || m.message;
    }
  }

  // 回退到旧逻辑
  if (!statusCode) {
    // 避免测试中 logger 已被释放仍写入导致 write after end
    try {
      if(!res.headersSent) {
        logger.error('API Error', {
          error: err.message,
          stack: err.stack,
          url: req.url,
          method: req.method,
          user: req.user?.id,
          ip: req.ip
        });
      }
    } catch(_) {}
    if(res.headersSent) return; // 已发送响应则不再继续

    // 根据错误类型返回不同的状态码
    statusCode = 500;
    clientMessage = '服务器内部错误';

    if (err.name === 'ValidationError') {
      statusCode = 400;
      clientMessage = err.message;
    } else if (err.name === 'UnauthorizedError') {
      statusCode = 401;
      clientMessage = '未授权访问';
    } else if (err.name === 'ForbiddenError') {
      statusCode = 403;
      clientMessage = '权限不足';
    } else if (err.name === 'NotFoundError') {
      statusCode = 404;
      clientMessage = '资源不存在';
    } else if (err.code === 'SQLITE_CONSTRAINT') {
      statusCode = 400;
      clientMessage = '数据约束冲突';
    }
  }

  // 替换原先直接使用 message/statusCode 的响应构造
  if (!res.headersSent) {
    res.status(statusCode || err.statusCode || 500).json({
      success: false,
      code: payloadCode,
      message: clientMessage || err.message || '服务器内部错误',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
};

// 自定义错误类
class AppError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 新增统一业务 AppError，支持 code
class BizError extends AppError {
  constructor(code, message, extra) {
    const meta = getErrorMeta(code) || {}; // 允许未登记 code
    super(message || meta.message || '业务错误', meta.http || 400);
    this.code = code;
    if (extra) this.extra = extra;
  }
}

module.exports = {
  errorHandler,
  logger,
  AppError,
  BizError
};
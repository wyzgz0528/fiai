const { v4: uuidv4 } = require('uuid');
const { logger } = require('./errorHandler');

function requestContext(req, res, next) {
  req.requestId = uuidv4();
  res.setHeader('X-Request-Id', req.requestId);
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
  // 在测试环境默认关闭；当设置 QUIET_REQUEST_LOG=1 时也关闭（用于本地降噪）
  if (process.env.NODE_ENV !== 'test' && process.env.QUIET_REQUEST_LOG !== '1') {
      try {
        logger.info('request', {
          id: req.requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          durationMs: ms,
          userId: req.user?.userId,
          role: req.user?.role,
          ip: req.ip
        });
      } catch (_) {}
    }
  });
  next();
}

module.exports = { requestContext };

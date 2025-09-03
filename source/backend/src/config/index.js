require('dotenv').config();
const fs = require('fs');

function parseArray(val) {
  if (!val) return [];
  return String(val).split(/[,;\s]+/).filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3002,
  jwtSecret: process.env.JWT_SECRET || 'test-123456789',
  corsOrigins: parseArray(process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174'),
  security: {
    enableHelmet: process.env.ENABLE_HELMET !== 'false',
    enableRateLimiter: process.env.ENABLE_RATE_LIMITER === 'true',
    enableSecurityHeaders: process.env.ENABLE_SECURITY_HEADERS !== 'false',
  },
  rateLimiter: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    loginWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) || 5 * 60 * 1000,
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 5,
  },
  upload: {
    maxFileSize: parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 10 * 1024 * 1024,
  }
};

// 简单的运行期配置自检
function validateConfig() {
  if (!config.jwtSecret || config.jwtSecret.length < 8) {
    console.warn('[config] JWT_SECRET 过短，建议在 .env 中设置更复杂的值');
  }
}

validateConfig();

module.exports = config;

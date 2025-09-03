const helmet = require('helmet');
const { logger } = require('./errorHandler');

// CORS配置
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
};

// XSS保护
const xssProtection = (req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

// 输入清理
const sanitizeInput = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = value.replace(/[<>]/g, '');
    } else {
      sanitized[key] = sanitizeInput(value);
    }
  }
  return sanitized;
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>]/g, '');
};

// SQL注入保护
const sqlInjectionProtection = (req, res, next) => {
  const body = req.body;
  const query = req.query;
  
  // 检查请求体
  if (body) {
    req.body = sanitizeInput(body);
  }
  
  // 检查查询参数
  if (query) {
    req.query = sanitizeInput(query);
  }
  
  next();
};

// 文件上传安全
const fileUploadSecurity = (req, res, next) => {
  // 检查文件类型
  if (req.file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: '不支持的文件类型' });
    }
    
    // 检查文件大小 (10MB)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: '文件大小超过限制' });
    }
  }
  
  next();
};

// 请求限制
const requestThrottling = (req, res, next) => {
  // 简单的内存限制，生产环境建议使用Redis
  const clientIP = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15分钟
  const maxRequests = 100; // 最大请求数
  
  if (!req.app.locals.requestCounts) {
    req.app.locals.requestCounts = new Map();
  }
  
  const clientRequests = req.app.locals.requestCounts.get(clientIP) || [];
  const validRequests = clientRequests.filter(time => now - time < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  
  validRequests.push(now);
  req.app.locals.requestCounts.set(clientIP, validRequests);
  
  next();
};

// 安全头设置
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};

module.exports = { 
  corsOptions, 
  xssProtection, 
  sqlInjectionProtection, 
  fileUploadSecurity, 
  requestThrottling, 
  securityHeaders, 
  sanitizeInput 
}; 
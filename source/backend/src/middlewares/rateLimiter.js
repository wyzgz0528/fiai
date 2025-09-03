const { logger } = require('./errorHandler');
const config = require('../config');

// 内存存储（生产建议 Redis）
const requestCounts = new Map();
const WINDOW_MS = config.rateLimiter.windowMs; // 15分钟默认
const MAX_REQUESTS = config.rateLimiter.max;   // 默认 100
const LOGIN_WINDOW_MS = config.rateLimiter.loginWindowMs; // 默认 5 分钟
const MAX_LOGIN_ATTEMPTS = config.rateLimiter.loginMax;   // 默认 5

function isActive(){
  // 显式开启或测试模式临时开启
  return config.security.enableRateLimiter || process.env.RATE_LIMIT_TEST === '1';
}

// 清理过期
function cleanupExpiredRequests(){
  const now = Date.now();
  for(const [key, arr] of requestCounts.entries()){
    const valid = arr.filter(ts=> now - ts < WINDOW_MS);
    if(valid.length) requestCounts.set(key, valid); else requestCounts.delete(key);
  }
}
const __interval = setInterval(cleanupExpiredRequests, WINDOW_MS);
try { if(process.env.NODE_ENV==='test') __interval.unref && __interval.unref(); } catch(_){}
function shutdownRateLimiter(){ clearInterval(__interval); }
function _resetRateLimiter(){ requestCounts.clear(); }
module.exports.shutdownRateLimiter = shutdownRateLimiter;
module.exports._resetRateLimiter = _resetRateLimiter;

function track(key, limit, windowMs){
  const now = Date.now();
  const list = requestCounts.get(key) || [];
  const valid = list.filter(ts=> now - ts < windowMs);
  if(valid.length >= limit) return { blocked: true, remaining: 0, reset: valid[0] + windowMs };
  valid.push(now); requestCounts.set(key, valid);
  return { blocked:false, remaining: limit - valid.length, reset: now + windowMs };
}

const rateLimiter = (req,res,next)=>{
  if(!isActive()) return next();
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const effectiveMax = process.env.RATE_LIMIT_TEST==='1' ? 3 : MAX_REQUESTS;
  const r = track(`gen:${ip}`, effectiveMax, WINDOW_MS);
  if(r.blocked){
    try { logger && logger.warn && logger.warn('Rate limit exceeded', { ip, url:req.url, method:req.method }); } catch(_){ console.warn('Rate limit exceeded', ip, req.url); }
    return res.status(429).json({ success:false, message:'请求过于频繁，请稍后再试', retryAfter: Math.ceil((r.reset - Date.now())/1000) });
  }
  res.set({ 'X-RateLimit-Limit': effectiveMax, 'X-RateLimit-Remaining': r.remaining, 'X-RateLimit-Reset': new Date(r.reset).toISOString() });
  next();
};

const loginRateLimiter = (req,res,next)=>{
  if(!isActive()) return next();
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const effectiveMax = process.env.RATE_LIMIT_TEST==='1' ? 2 : MAX_LOGIN_ATTEMPTS;
  const r = track(`login:${ip}`, effectiveMax, LOGIN_WINDOW_MS);
  if(r.blocked){
    try { logger && logger.warn && logger.warn('Login rate limit exceeded', { ip }); } catch(_){ console.warn('Login rate limit exceeded', ip); }
    return res.status(429).json({ success:false, message:'登录尝试过于频繁，请稍后再试' });
  }
  next();
};

module.exports = { rateLimiter, loginRateLimiter, shutdownRateLimiter, _resetRateLimiter };
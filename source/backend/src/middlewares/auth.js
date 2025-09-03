const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { logAction } = require('../utils/audit');

const JWT_SECRET = config.jwtSecret;

function extractToken(req) {
  const verbose = process.env.VERBOSE_AUTH === '1' && process.env.NODE_ENV !== 'production';
  // 1) Authorization header
  let header = req.headers['authorization'];
  if (header) {
    if (header.startsWith('Bearer ')) header = header.slice(7);
    if (verbose) console.log('【verifyToken】使用 Authorization 头中的 token');
    return header;
  }
  // 2) Query 参数 ?token=
  if (req.query && req.query.token) {
    if (verbose) console.log('【verifyToken】使用 query.token');
    return String(req.query.token);
  }
  // 3) Cookie 中的 token/jwt/auth_token（未使用 cookie-parser，手动解析）
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    if (verbose) console.log('【verifyToken】尝试从 Cookie 提取 token');
    const pairs = cookieHeader.split(';').map(s => s.trim());
    for (const p of pairs) {
      const eq = p.indexOf('=');
      if (eq === -1) continue;
      const k = p.slice(0, eq).trim();
      const v = decodeURIComponent(p.slice(eq + 1));
      if (['token', 'jwt', 'auth_token', 'Authorization'].includes(k)) {
        return v;
      }
    }
  }
  return null;
}

function verifyToken(req, res, next) {
  const verbose = process.env.VERBOSE_AUTH === '1' && process.env.NODE_ENV !== 'production';
  let token = extractToken(req);
  if (verbose) console.log('【verifyToken】提取到 token:', token ? '[已获取]' : '[为空]');
  if (verbose) console.log('【verifyToken】JWT_SECRET 长度:', JWT_SECRET ? String(JWT_SECRET).length : 0);
  if (!token) {
    if (verbose) console.log('【verifyToken】未收到任何 token 来源 (Header/Query/Cookie)');
    return res.status(401).json({ msg: '请登录' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (verbose) console.log('【verifyToken】解码结果:', decoded);
    req.user = decoded;
    next();
  } catch (e) {
    if (verbose) console.error('【verifyToken】JWT 校验失败:', e.message);
    return res.status(401).json({ msg: '身份已过期，请重新登录', detail: e.message });
  }
}

/**
 * 角色权限验证中间件
 * @param {Array} allowedRoles - 允许的角色列表
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证用户'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `权限不足，需要以下角色之一: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = { verifyToken, logAction, extractToken, requireRole };

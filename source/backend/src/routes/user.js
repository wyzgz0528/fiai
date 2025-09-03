const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyToken, logAction } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/requirePermission');
const { loginRateLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// 登录
// 登录增加限流防爆破
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    // 精简调试日志：避免输出敏感信息（如密码）
    const { username, password } = req.body;
    
    console.log('收到登录请求:', { username }); // 添加调试日志
    
    // 查找用户
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      console.log('用户不存在:', username); // 添加调试日志
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    // 避免输出密码校验的布尔结果与任何敏感字段
    
    if (!isValidPassword) {
      console.log('密码验证失败:', username); // 添加调试日志
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 生成JWT token (有效期7天)
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'test-123456789',
      { expiresIn: '7d' }
    );
    
    console.log('登录成功:', username);

    // 设置 HttpOnly Cookie，便于新窗口/下载链接自动携带凭证
    try {
      const sevenDays = 7 * 24 * 60 * 60; // seconds
      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: sevenDays * 1000,
        path: '/',
      });
    } catch (_) { /* noop */ }

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('登录API错误:', error); // 添加调试日志
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// token 刷新接口
router.post('/refresh-token', verifyToken, (req, res) => {
  try {
    // 生成新的 token (有效期7天)
    const newToken = jwt.sign(
      { userId: req.user.userId, username: req.user.username, role: req.user.role },
      process.env.JWT_SECRET || 'test-123456789',
      { expiresIn: '7d' }
    );
    
    // 同步更新 HttpOnly Cookie
    try {
      const sevenDays = 7 * 24 * 60 * 60; // seconds
      res.cookie('token', newToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: sevenDays * 1000,
        path: '/',
      });
    } catch (_) { /* noop */ }

    res.json({
      success: true,
      token: newToken
    });
  } catch (error) {
    console.error('刷新token失败:', error);
    res.status(500).json({ error: '刷新token失败' });
  }
});

// 注册
router.post('/register', async (req, res) => {
  const { username, real_name, password, password2 } = req.body;
  if (!username || !password || !password2 || !real_name)
    return res.status(400).json({ msg: '所有字段必填' });
  if (password !== password2)
    return res.status(400).json({ msg: '两次输入的密码必须一致' });
  if (password.length < 8)
    return res.status(400).json({ msg: '密码长度必须大于等于8位' });
  const exists = db.prepare('SELECT 1 FROM users WHERE username=?').get(username);
  if (exists) return res.status(409).json({ msg: '用户名已存在' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users(username, password, real_name, role) VALUES (?,?,?,?)')
    .run(username, hash, real_name, 'employee');
  logAction({userId:null, action:'register', detail:username, ip:req.ip});
  res.json({ msg: '注册成功' });
});

// 获取当前用户信息（兼容 /me 与 /profile）
router.get('/me', verifyToken, (req, res) => {
  const user = db.prepare('SELECT id, username, real_name, role, created_at FROM users WHERE id=?').get(req.user.userId);
  res.json(user);
});
router.get('/profile', verifyToken, (req, res) => {
  const user = db.prepare('SELECT id, username, real_name, role, created_at FROM users WHERE id=?').get(req.user.userId);
  res.json(user);
});

// 统一资料更新处理（供多路由复用）
function updateProfileHandler(req, res) {
  try {
    const { real_name, old_password, new_password, confirm_password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.userId);
    if (!user) return res.status(404).json({ msg: '用户不存在' });

    // 修改姓名
    if (typeof real_name === 'string' && real_name && real_name !== user.real_name) {
      db.prepare('UPDATE users SET real_name=? WHERE id=?').run(real_name, req.user.userId);
    }

    // 修改密码
    if (new_password || confirm_password) {
      if (!old_password) return res.status(400).json({ msg: '请输入原密码' });
      if (!bcrypt.compareSync(String(old_password), user.password)) return res.status(400).json({ msg: '原密码错误' });
      if (!new_password || String(new_password).length < 8) return res.status(400).json({ msg: '新密码至少8位' });
      if (String(new_password) !== String(confirm_password)) return res.status(400).json({ msg: '两次输入的新密码不一致' });
      const hash = bcrypt.hashSync(String(new_password), 10);
      db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.user.userId);
    }

    res.json({ msg: '修改成功' });
  } catch (error) {
    console.error('个人信息修改失败:', error);
    res.status(500).json({ msg: '个人信息修改失败' });
  }
}

// 个人信息修改（兼容多个路径与方法）
router.post('/update-profile', verifyToken, updateProfileHandler);
router.post('/user/update-profile', verifyToken, updateProfileHandler); // 兼容旧路径
router.put('/profile', verifyToken, updateProfileHandler); // REST 风格，与前端一致

// ============ Admin: 用户管理 ============
// 重置任意用户密码（admin）
router.post('/admin/reset-password', verifyToken, requirePermission('users.manage'), async (req, res) => {
  try {
    const { user_id, new_password } = req.body || {};
    const uid = parseInt(user_id);
    if (!uid || !new_password) return res.status(400).json({ msg: 'user_id 与 new_password 必填' });
    if (String(new_password).length < 8) return res.status(400).json({ msg: '新密码至少8位' });
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(uid);
    if (!user) return res.status(404).json({ msg: '用户不存在' });
    const hash = await bcrypt.hash(String(new_password), 10);
    db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, uid);
    logAction({ userId: req.user.userId, action: 'admin_reset_password', detail: `userId=${uid}` , ip: req.ip});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ msg: '重置失败', detail: error.message });
  }
});

// 查询用户列表（admin）
router.get('/admin/users', verifyToken, requirePermission('users.read.all'), (req, res) => {
  try {
  const q = (req.query.q || '').trim();
  const onlyDel = String(req.query.onlyDeletable || req.query.deletable || '').trim() === '1';
  const withStats = String(req.query.withStats || '').trim() === '1';

    const whereParts = [];
    const params = [];
    if (q) {
      whereParts.push('(username LIKE ? OR real_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (onlyDel) {
      // 仅返回无任何报销单/借款记录/旧记录的用户
      whereParts.push(`NOT EXISTS (SELECT 1 FROM reimbursement_forms rf WHERE rf.user_id = users.id)`);
      whereParts.push(`NOT EXISTS (SELECT 1 FROM loans l WHERE l.user_id = users.id)`);
      try {
        // 兼容旧表
        whereParts.push(`NOT EXISTS (SELECT 1 FROM reimbursements r WHERE r.user_id = users.id)`);
      } catch (_) {}
    }

    let sql = 'SELECT id, username, real_name, role, created_at FROM users';
    if (whereParts.length) {
      sql += ' WHERE ' + whereParts.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';
    let rows = db.prepare(sql).all(...params);

    if (withStats || onlyDel) {
      rows = rows.map((r) => {
        try {
          const formCnt = db.prepare('SELECT COUNT(*) AS c FROM reimbursement_forms WHERE user_id=?').get(r.id).c || 0;
          const loanCnt = db.prepare('SELECT COUNT(*) AS c FROM loans WHERE user_id=?').get(r.id).c || 0;
          let oldReimbCnt = 0;
          try { oldReimbCnt = db.prepare('SELECT COUNT(*) AS c FROM reimbursements WHERE user_id=?').get(r.id).c || 0; } catch (_) {}
          const canDelete = (formCnt === 0 && loanCnt === 0 && oldReimbCnt === 0 && r.role !== 'admin');
          return { ...r, _stats: { reimbursement_forms: formCnt, loans: loanCnt, reimbursements_legacy: oldReimbCnt }, _can_delete: canDelete };
        } catch (_) {
          return { ...r, _stats: { reimbursement_forms: 0, loans: 0, reimbursements_legacy: 0 }, _can_delete: (r.role !== 'admin') };
        }
      });
      if (onlyDel) {
        rows = rows.filter(r => r._can_delete);
      }
    }

    res.json(rows);
  } catch (error) {
    res.status(500).json({ msg: '查询失败', detail: error.message });
  }
});

// 删除用户（仅当该用户没有任何报销单/借款记录）（admin）
router.delete('/admin/users/:id', verifyToken, requirePermission('users.manage'), (req, res) => {
  try {
    const uid = parseInt(req.params.id);
    if (!uid) return res.status(400).json({ msg: '无效的用户ID' });
    if (uid === req.user.userId) {
      return res.status(400).json({ msg: '不允许删除当前登录的管理员账号' });
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id=?').get(uid);
    if (!user) return res.status(404).json({ msg: '用户不存在' });

    // 严格校验：无任何报销单/借款记录方可删除
    const formCnt = db.prepare('SELECT COUNT(*) AS c FROM reimbursement_forms WHERE user_id=?').get(uid).c || 0;
    const loanCnt = db.prepare('SELECT COUNT(*) AS c FROM loans WHERE user_id=?').get(uid).c || 0;
    // 兼容历史：如果仍有旧 reimbursements 记录，也禁止删除
    let oldReimbCnt = 0;
    try { oldReimbCnt = db.prepare('SELECT COUNT(*) AS c FROM reimbursements WHERE user_id=?').get(uid).c || 0; } catch (_) {}

    if (formCnt > 0 || loanCnt > 0 || oldReimbCnt > 0) {
      return res.status(400).json({
        msg: '该用户存在历史数据，无法删除',
        detail: { reimbursement_forms: formCnt, loans: loanCnt, reimbursements_legacy: oldReimbCnt }
      });
    }

  // 删除前可选清理：与用户相关的日志/审批记录等非关键数据，避免外键/引用阻塞
  try { db.prepare('DELETE FROM logs WHERE user_id=?').run(uid); } catch (_) {}
  try { db.prepare('DELETE FROM loan_approval_logs WHERE approver_id=?').run(uid); } catch (_) {}
  try { db.prepare('DELETE FROM loan_payment_logs WHERE operator_id=?').run(uid); } catch (_) {}
  try { db.prepare('DELETE FROM reimbursement_form_approval_logs WHERE approver_id=?').run(uid); } catch (_) {}
  try { db.prepare('DELETE FROM reimbursement_form_splits WHERE created_by=?').run(uid); } catch (_) {}
  try { db.prepare('DELETE FROM reimbursement_loan_links WHERE created_by=?').run(uid); } catch (_) {}
  try { db.prepare('DELETE FROM audit_events WHERE user_id=?').run(uid); } catch (_) {}

    // 删除用户
    db.prepare('DELETE FROM users WHERE id=?').run(uid);
    logAction({ userId: req.user.userId, action: 'admin_delete_user', detail: `userId=${uid}`, ip: req.ip });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ msg: '删除失败', detail: error.message });
  }
});
// ============ Admin 接口结束 ============

module.exports = router;

const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { z } = require('zod');
const { normalizeFormStatus, formStatusToZh } = require('../utils/status_maps');
const { hasPermission } = require('../auth/permissions');

const router = express.Router();

// 查询参数校验
const listQuerySchema = z.object({
  my: z.string().optional(),
  todo: z.string().optional(),
  real_name: z.string().max(50).optional(),
  status: z.string().optional()
});

router.get('/reimbursement-forms', verifyToken, validate(listQuerySchema, 'query'), (req, res) => {
  try {
    let sql = `SELECT rf.*, u.real_name FROM reimbursement_forms rf LEFT JOIN users u ON rf.user_id = u.id`;
    const where = [];
    const params = [];
    if (req.query.my === '1') {
      where.push('rf.user_id = ?');
      params.push(req.user.userId);
    } else if (req.query.todo === '1') {
      if (hasPermission(req.user.role,'forms.approve.finance')) {
        // 财务仅看自己可操作的状态：
        // 审核（submitted/待财务审核/草稿）+ 打款（manager_approved/总经理已通过）
        where.push("rf.status IN ('submitted','待财务审核','草稿','draft','manager_approved','总经理已审批','总经理已通过')");
      } else if (hasPermission(req.user.role,'forms.approve.manager')) {
        where.push("rf.status IN ('finance_approved','财务已审核','财务已通过')");
      } else {
        return res.json([]);
      }
    } else if (!hasPermission(req.user.role,'forms.read.department') && !hasPermission(req.user.role,'forms.read.all')) {
      where.push('rf.user_id = ?');
      params.push(req.user.userId);
    }
    if (req.query.real_name) {
      where.push('u.real_name LIKE ?');
      params.push(`%${req.query.real_name}%`);
    }
    if (req.query.status) {
      const items = String(req.query.status).split(',').map(s => s.trim()).filter(Boolean);
      // 直接匹配原值集合（保持与大路由一致的兼容策略）
      const expanded = items.flatMap(s => {
        switch (s) {
          case 'draft': return ['草稿'];
          case 'submitted': return ['submitted','待财务审核'];
          case 'finance_approved': return ['finance_approved','财务已审核','财务已通过'];
          case 'finance_rejected': return ['finance_rejected','财务已驳回'];
          case 'manager_approved': return ['manager_approved','总经理已审批','总经理已通过'];
          case 'manager_rejected': return ['manager_rejected','总经理已驳回'];
          case 'paid': return ['paid','已打款'];
          // 兼容旧状态
          case 'approved': return ['manager_approved','总经理已审批','总经理已通过'];
          case 'rejected': return ['finance_rejected','财务已驳回','已驳回'];
          default: return [s];
        }
      });
      const placeholders = expanded.map(() => '?').join(',');
      where.push(`rf.status IN (${placeholders})`);
      params.push(...expanded);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY rf.created_at DESC';
    const rows = db.prepare(sql).all(...params);
    const list = rows.map(r => ({
      ...r,
      status_en: normalizeFormStatus(r.status),
      status_zh: formStatusToZh(r.status)
    }));
    res.json(list);
  } catch (e) {
    res.status(500).json({ success: false, message: '获取报销单失败', requestId: req.requestId });
  }
});

module.exports = router;

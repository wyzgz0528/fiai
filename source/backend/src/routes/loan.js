const express = require('express');
const router = express.Router();
const db = require('../db');
const { LOAN_STATUS } = require('../constants/status');
// 添加：确保 loans 表存在审批意见字段
(function ensureLoanCommentCols(){
  try {
    const cols = db.prepare("PRAGMA table_info(loans)").all().map(c=>c.name);
    const addCol = (name)=>{ try { db.prepare(`ALTER TABLE loans ADD COLUMN ${name} TEXT`).run(); } catch(_){} };
    if (!cols.includes('finance_comment')) addCol('finance_comment');
    if (!cols.includes('manager_comment')) addCol('manager_comment');
  } catch(e) {
    console.error('检查/添加贷款审批意见列失败', e.message);
  }
})();

// 自愈迁移：将 loans 表中遗留的英文状态统一为中文（避免聚合漏算）
function selfHealLoanStatuses() {
  try {
    const map = new Map([
      ['draft','草稿'],
      ['pending','待财务审核'],
      ['finance_approved','财务已审核'],
      ['manager_approved','总经理已审批'],
      ['paid','已打款'],
      ['partial_repaid','部分已还'],
      ['repaid','已还清'],
      ['rejected','已驳回']
    ]);
    // 仅在存在英文状态时才执行更新，避免无意义写入
    const distinct = db.prepare("SELECT DISTINCT status FROM loans").all().map(r => r.status || '');
    const englishLeft = distinct.filter(s => map.has(s));
    if (englishLeft.length > 0) {
      const updateStmt = db.prepare('UPDATE loans SET status = ? WHERE status = ?');
      db.transaction(() => {
        englishLeft.forEach(en => updateStmt.run(map.get(en), en));
      })();
      console.log(`[loan] 自愈：已将英文状态统一为中文 -> ${englishLeft.join(', ')}`);
    }
  } catch (e) {
    console.warn('[loan] 规范化英文状态失败（可忽略）:', e.message);
  }
}
// 启动时先执行一次
selfHealLoanStatuses();
const { verifyToken, logAction } = require('../middlewares/auth');
const { recordAudit } = require('../utils/audit');
const { requirePermission } = require('../middlewares/requirePermission');

// 统一借款状态规范与中文映射
// 已删除旧的状态映射函数，系统已标准化为中文状态

// 已删除状态映射函数，系统已标准化

// 英文状态兼容层已移除：仅接受与存储中文状态

// 查询借款列表，支持 my=1 查询本人，todo=1 查询待我审批，userId 查询指定员工
router.get('/loans', verifyToken, (req, res) => {
  try {
  // 确保任何遗留英文状态在列表返回前被规范为中文
  selfHealLoanStatuses();
    let userId;
    if (req.query.my === '1') {
      userId = req.user.userId;
    } else if (req.query.userId) {
      userId = parseInt(req.query.userId);
    } else if (req.query.user_id) {
      userId = parseInt(req.query.user_id);
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 10));
  const search = (req.query.search || '').trim();
    const statusFilter = (req.query.status || '').trim();
  const nameFilter = (req.query.name || '').trim();
    const sortField = (req.query.sortField || '').trim();
    const sortOrder = ((req.query.sortOrder || 'desc').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
    let where = 'WHERE 1=1';
    let params = [];
    if (userId) {
      where += ' AND l.user_id = ?';
      params.push(userId);
    }
    if (search) {
      where += ' AND (l.purpose LIKE ? OR l.remark LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (nameFilter) {
      where += ' AND u.real_name LIKE ?';
      params.push(`%${nameFilter}%`);
    }
    if (statusFilter) {
      // 仅接受中文状态筛选
      where += ' AND l.status = ?';
      params.push(statusFilter);
    }
    // todo=1 查询待我审批/处理
    if (req.query.todo === '1') {
      const { hasPermission } = require('../auth/permissions');
      if (hasPermission(req.user.role,'loans.approve.finance')) {
        // 财务待办：
        // 1) 待财务审核（需审批）
        // 2) 总经理已审批（需打款）
        // 3) 已打款/部分已还 且 剩余金额>0（可执行还款登记/冲抵）
        where += ` AND ( 
          l.status IN ('待财务审核','总经理已审批') 
          OR (l.status IN ('已打款','部分已还') AND COALESCE(l.remaining_amount,0) > 0)
        )`;
      } else if (hasPermission(req.user.role,'loans.approve.manager')) {
        where += ` AND l.status = '财务已审核'`;
      } else {
        return res.json({ total: 0, loans: [] });
      }
    } else if (req.user.role === 'employee') {
      // 员工只能查自己
      where += ' AND l.user_id = ?';
      params.push(req.user.userId);
    }
    const total = db.prepare(`SELECT COUNT(*) as c FROM loans l ${where}`).get(...params).c;
    let orderBy = 'ORDER BY l.created_at DESC';
    if (sortField) {
      const allow = new Set(['created_at','amount','status','remaining_amount','id']);
      const field = allow.has(sortField) ? sortField : 'created_at';
      orderBy = `ORDER BY l.${field} ${sortOrder}`;
    }
    const rows = db.prepare(`
      SELECT 
        l.*, 
        u.real_name,
        -- 当列为空时，回填最近一次相关审批/打款的备注
        COALESCE(
          l.finance_comment,
          (
            SELECT la.comment 
            FROM loan_approval_logs la 
            WHERE la.loan_id = l.id 
              AND la.action IN ('approve','finance_pay')
              AND la.to_status IN ('财务已审核','已打款')
            ORDER BY la.created_at DESC 
            LIMIT 1
          )
        ) AS finance_comment,
        COALESCE(
          l.manager_comment,
          (
            SELECT la2.comment 
            FROM loan_approval_logs la2 
            WHERE la2.loan_id = l.id 
              AND la2.action = 'approve'
              AND la2.to_status = '总经理已审批'
            ORDER BY la2.created_at DESC 
            LIMIT 1
          )
        ) AS manager_comment
      FROM loans l 
      LEFT JOIN users u ON l.user_id=u.id
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page-1)*pageSize);
    // 如果是导出所有记录（all=1），需要获取冲抵信息
    let finalMapped = rows.map(r => ({ ...r }));

    if (req.query.all === '1') {
      // 获取所有借款的冲抵信息
      const loanIds = rows.map(r => r.id);
      let offsetsMap = {};

      if (loanIds.length > 0) {
        try {
          // 获取借款冲抵信息，包括关联的报销单号
          const offsets = db.prepare(`
            SELECT
              rll.loan_id,
              rll.offset_amount,
              rll.created_at as offset_date,
              rf.form_number,
              rf.id as form_id,
              rf.total_amount as form_total_amount
            FROM reimbursement_loan_links rll
            LEFT JOIN reimbursement_forms rf ON rll.form_id = rf.id
            WHERE rll.loan_id IN (${loanIds.map(()=>'?').join(',')})
            ORDER BY rll.created_at DESC
          `).all(...loanIds);

          for (const off of offsets) {
            if (!offsetsMap[off.loan_id]) offsetsMap[off.loan_id] = [];
            offsetsMap[off.loan_id].push({
              offset_amount: off.offset_amount,
              offset_date: off.offset_date,
              form_number: off.form_number,
              form_id: off.form_id,
              form_total_amount: off.form_total_amount
            });
          }
        } catch (e) {
          console.warn('获取借款冲抵信息失败:', e.message);
          offsetsMap = {};
        }
      }

      // 将冲抵信息添加到结果中
      finalMapped = rows.map(row => ({
        ...row,
        offsets: offsetsMap[row.id] || []
      }));

      // 导出时直接返回数组
      return res.json(finalMapped);
    }

    // 兼容旧测试：my=1 或 todo=1 且未显式分页参数时直接返回数组
    if ((req.query.my === '1' || req.query.todo === '1') && !req.query.page && !req.query.pageSize) {
      return res.json(finalMapped);
    }
    res.json({ total, loans: finalMapped });
  } catch (error) {
    console.error('获取借款列表失败:', error);
    res.status(500).json({ msg: '获取借款列表失败' });
  }
});

// 获取个人借款汇总信息
router.get('/loans/summary', verifyToken, (req, res) => {
  try {
    const userId = req.user.userId;
    
    // 获取借款统计
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total_loans,
        COALESCE(SUM(CASE WHEN status = '待财务审核' THEN 1 ELSE 0 END), 0) as pending_count,
        COALESCE(SUM(CASE WHEN status = '总经理已审批' THEN 1 ELSE 0 END), 0) as approved_count,
        COALESCE(SUM(CASE WHEN status = '已打款' THEN 1 ELSE 0 END), 0) as paid_count,
        COALESCE(SUM(CASE WHEN status = '已还清' THEN 1 ELSE 0 END), 0) as repaid_count,
        COALESCE(SUM(CASE WHEN status IN ('已打款', '部分已还') THEN remaining_amount ELSE 0 END), 0) as outstanding_balance,
        COALESCE(SUM(amount), 0) as total_amount
      FROM loans 
      WHERE user_id = ?
    `).get(userId);
    
    res.json(summary);
  } catch (error) {
    console.error('获取借款汇总失败:', error);
    res.status(500).json({ msg: '获取借款汇总失败' });
  }
});

// 员工借款余额列表（管理区）
router.get('/loans/balance-list', verifyToken, requirePermission('loans.read.all'), (req, res) => {
  // 聚合前做一次自愈，避免英文状态导致漏算
  selfHealLoanStatuses();
  const rows = db.prepare(`
    SELECT u.id as user_id,
           u.real_name,
           SUM(CASE WHEN l.status IN ('已打款','部分已还') THEN COALESCE(l.remaining_amount,0) ELSE 0 END) as balance,
           SUM(CASE WHEN l.status IN ('已打款','部分已还') AND COALESCE(l.remaining_amount,0) > 0 THEN 1 ELSE 0 END) as active_loans_count
    FROM users u
    LEFT JOIN loans l ON u.id = l.user_id
    GROUP BY u.id
    HAVING balance > 0
    ORDER BY balance DESC
  `).all();
  res.json(rows);
});

// 查询当前用户借款余额
router.get('/loans/balance', verifyToken, (req, res) => {
  // 自愈一次，避免遗留英文状态影响余额
  selfHealLoanStatuses();
  // 只允许员工本人查自己的余额
  const userId = req.user.userId;
  // 只统计已打款未还清的借款（已打款、部分已还）
  const row = db.prepare("SELECT SUM(remaining_amount) as balance FROM loans WHERE user_id=? AND status IN ('已打款','部分已还')").get(userId);
  res.json({ balance: row.balance || 0 });
});

// 新建借款（兼容旧测试：允许 employee 创建，不要求 loans.update.all）
router.post('/loans', verifyToken, (req, res) => {
  try {
    const { hasPermission } = require('../auth/permissions');
    if (req.user.role !== 'employee' && !hasPermission(req.user.role, 'loans.update.all')) {
      return res.status(403).json({ msg: '无权限' });
    }
    const { amount, purpose } = req.body;
    if (!amount || !purpose) return res.status(400).json({ msg: '金额和用途必填' });
    const info = db.prepare('INSERT INTO loans(user_id, amount, remaining_amount, purpose, status, created_at) VALUES (?,?,?,?,?,datetime(\'now\', \'localtime\'))')
      .run(req.user.userId, +amount, +amount, purpose, '待财务审核');
    logAction({ userId: req.user.userId, action: 'create_loan', detail: `借款金额:${amount}`, ip: req.ip });
    recordAudit({ userId: req.user.userId, eventType: 'loan.create', entity: 'loan', entityId: info.lastInsertRowid, detail: `amount=${amount}`, ip: req.ip });
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(info.lastInsertRowid);
    return res.json({ id: info.lastInsertRowid });
  } catch (e) {
    console.error('创建借款失败', e);
    return res.status(500).json({ msg: '创建借款失败' });
  }
});

// 内部复用函数：执行审批
function performLoanApproval({ req, res, loanId, action, comment }) {
  const { hasPermission } = require('../auth/permissions');
  const canFinance = hasPermission(req.user.role,'loans.approve.finance');
  const canManager = hasPermission(req.user.role,'loans.approve.manager');
  if (!(canFinance || canManager)) {
    return res.status(403).json({ msg: '无权限' });
  }
  const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
  if (!loan) return res.status(404).json({ msg: '未找到' });
  let canApprove = false; let to_status = '';
  if (canFinance && loan.status === '待财务审核') {
    canApprove = true; to_status = action === 'approve' ? '财务已审核' : '已驳回';
  } else if (canManager && loan.status === '财务已审核') {
    canApprove = true; to_status = action === 'approve' ? '总经理已审批' : '已驳回';
  }
  if (!canApprove) return res.status(403).json({ msg: '操作无效或无权限' });
  db.transaction(() => {
    if (to_status === '财务已审核') {
      db.prepare('UPDATE loans SET status=?, finance_comment=? WHERE id=?').run(to_status, comment, loan.id);
    } else if (to_status === '总经理已审批') {
      db.prepare('UPDATE loans SET status=?, manager_comment=? WHERE id=?').run(to_status, comment, loan.id);
    } else {
      db.prepare('UPDATE loans SET status=? WHERE id=?').run(to_status, loan.id);
    }
    db.prepare('INSERT INTO loan_approval_logs(loan_id, approver_id, action, comment, from_status, to_status, created_at) VALUES (?,?,?,?,?,?,datetime(\'now\', \'localtime\'))')
      .run(loan.id, req.user.userId, action, comment, loan.status, to_status);
    logAction({ userId: req.user.userId, action: 'approval_loan', detail: `${action}`, ip: req.ip });
    recordAudit({ userId:req.user.userId, eventType:'loan.approval', entity:'loan', entityId:loan.id, detail:`action=${action} to=${to_status}`, ip:req.ip });
  })();
  return res.json({ msg: '已操作' });
}

// 借款审批（统一入口）
router.post('/loans/:id/approve', verifyToken, (req, res) => {
  const action = req.body.action;
  const comment = req.body.comment || req.body.approval_comment || req.body.remark || '';
  return performLoanApproval({ req, res, loanId: req.params.id, action, comment });
});

// 兼容老接口：财务审批
router.post('/loans/:id/finance-approve', verifyToken, requirePermission('loans.approve.finance'), (req, res) => {
  const action = req.body.action || 'approve';
  const comment = req.body.comment || req.body.approval_comment || req.body.remark || '';
  return performLoanApproval({ req, res, loanId: req.params.id, action, comment });
});

// 兼容老接口：总经理审批
router.post('/loans/:id/manager-approve', verifyToken, requirePermission('loans.approve.manager'), (req, res) => {
  const action = req.body.action || 'approve';
  const comment = req.body.comment || req.body.approval_comment || req.body.remark || '';
  return performLoanApproval({ req, res, loanId: req.params.id, action, comment });
});

// 借款财务打款接口
router.post('/loans/:id/finance-pay', verifyToken, requirePermission('loans.pay.finance'), (req, res) => {
  const loanId = req.params.id;
  const comment = req.body.comment || req.body.approval_comment || req.body.remark || '';
  const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
  if (!loan) return res.status(404).json({ msg: '未找到' });
  if (loan.status !== '总经理已审批') return res.status(400).json({ msg: '当前状态不可打款' });
  db.transaction(() => {
    db.prepare('UPDATE loans SET status=?, finance_comment=? WHERE id=?').run('已打款', comment || '', loanId);
    db.prepare('INSERT INTO loan_approval_logs(loan_id, approver_id, action, comment, from_status, to_status, created_at) VALUES (?,?,?,?,?,?,datetime(\'now\', \'localtime\'))')
      .run(loanId, req.user.userId, 'finance_pay', comment || '', loan.status, '已打款');
    logAction({ userId: req.user.userId, action: 'finance_pay_loan', detail: `loanId:${loanId}`, ip: req.ip });
    recordAudit({ userId:req.user.userId, eventType:'loan.pay', entity:'loan', entityId:loanId, detail:`paid`, ip:req.ip });
  })();
  res.json({ msg: '已打款', status_en: '已打款' });
});

// 兼容旧端点：/loans/:id/pay (等价 finance-pay)
router.post('/loans/:id/pay', verifyToken, requirePermission('loans.pay.finance'), (req, res) => {
  // 复用 finance-pay 逻辑
  req.url = `/loans/${req.params.id}/finance-pay`;
  router.handle(req, res);
});

// 兼容旧端点：提交 (从 pending/draft 进入 pending 保持幂等)
router.post('/loans/:id/submit', verifyToken, (req, res) => {
  const loanId = req.params.id;
  const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
  if(!loan) return res.status(404).json({ msg:'未找到' });
  if(loan.user_id !== req.user.userId) return res.status(403).json({ msg:'无权限' });
  if(loan.status !== '待财务审核') {
    // 已进入审批流，幂等返回
    return res.json({ msg:'已提交' });
  }
  // 当前创建即 pending，无需额外变更，直接返回
  res.json({ msg:'已提交', status_en:'待财务审核' });
});

// 员工更新借款（仅 pending 或 rejected 可编辑）
router.put('/loans/:id', verifyToken, (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
    if (!loan) return res.status(404).json({ msg: '未找到' });
    if (loan.user_id !== req.user.userId) return res.status(403).json({ msg: '无权限' });
  
  if (!['待财务审核','已驳回','草稿'].includes(loan.status)) return res.status(400).json({ msg: '当前状态不可编辑' });
    const { amount, purpose, remark } = req.body || {};
    if (amount != null && !(Number(amount) > 0)) return res.status(400).json({ msg: '金额必须为正数' });
    if (purpose != null && !String(purpose).trim()) return res.status(400).json({ msg: '用途必填' });
    const next = {
      amount: amount != null ? Number(amount) : loan.amount,
      purpose: purpose != null ? String(purpose) : loan.purpose,
      remark: remark != null ? String(remark) : loan.remark
    };
    // 若修改金额，重置余额为新金额（仅在未打款审批前有效）
    const shouldReset = amount != null;
    const tx = db.transaction(() => {
      if (shouldReset) {
        db.prepare('UPDATE loans SET amount=?, remaining_amount=? , purpose=?, remark=? WHERE id=?')
          .run(next.amount, next.amount, next.purpose, next.remark || '', loanId);
      } else {
        db.prepare('UPDATE loans SET purpose=?, remark=? WHERE id=?')
          .run(next.purpose, next.remark || '', loanId);
      }
    });
    tx();
    logAction({ userId: req.user.userId, action:'loan_update_self', detail:`loanId=${loanId}` });
    res.json({ success:true });
  } catch (error) {
    console.error('员工更新借款失败:', error);
    res.status(500).json({ msg:'更新失败' });
  }
});

// 员工撤回借款（pending -> draft）
router.post('/loans/:id/withdraw', verifyToken, (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
    if (!loan) return res.status(404).json({ msg:'未找到' });
    if (loan.user_id !== req.user.userId) return res.status(403).json({ msg:'无权限' });
    
  if (loan.status !== '待财务审核') return res.status(400).json({ msg:'仅待财务审核可撤回' });
    db.prepare("UPDATE loans SET status='草稿' WHERE id=?").run(loanId);
    logAction({ userId: req.user.userId, action:'loan_withdraw', detail:`loanId=${loanId}` });
    res.json({ success:true, status_en:'草稿', status_zh:'草稿' });
  } catch (error) {
    console.error('撤回借款失败:', error);
    res.status(500).json({ msg:'撤回失败' });
  }
});

// 员工重新提交借款（draft/rejected -> pending）
router.post('/loans/:id/resubmit', verifyToken, (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
    if (!loan) return res.status(404).json({ msg:'未找到' });
    if (loan.user_id !== req.user.userId) return res.status(403).json({ msg:'无权限' });
    
  if (!['草稿','已驳回'].includes(loan.status)) return res.status(400).json({ msg:'仅草稿或已驳回可重新提交' });
    db.prepare("UPDATE loans SET status='待财务审核' WHERE id=?").run(loanId);
    logAction({ userId: req.user.userId, action:'loan_resubmit', detail:`loanId=${loanId}` });
    res.json({ success:true, status_en:'待财务审核' });
  } catch (error) {
    console.error('重新提交借款失败:', error);
    res.status(500).json({ msg:'提交失败' });
  }
});

// 获取借款基本信息（用于编辑表单）
router.get('/loans/:id/basic', verifyToken, (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const loan = db.prepare('SELECT id, amount, purpose, status, user_id FROM loans WHERE id = ?').get(loanId);

    if (!loan) {
      return res.status(404).json({ msg: '借款不存在' });
    }

    // 权限检查：只有本人或有权限的角色可以查看
    const { hasPermission } = require('../auth/permissions');
    if (!hasPermission(req.user.role, 'loans.read.all') && loan.user_id !== req.user.userId) {
      return res.status(403).json({ msg: '无权限' });
    }

    console.log(`[GET /loans/${loanId}/basic] 返回基本信息:`, loan);
    res.json(loan);
  } catch (error) {
    console.error(`[GET /loans/${req.params.id}/basic] 获取失败:`, error);
    res.status(500).json({ msg: '获取借款信息失败' });
  }
});

// 获取单条借款详情
router.get('/loans/:id', verifyToken, (req, res) => {
  const loanId = req.params.id;
  let sql = `
    SELECT
      l.*,
      u.real_name,
      -- 当列为空时，回填最近一次相关审批/打款的备注
      COALESCE(
        l.finance_comment,
        (
          SELECT la.comment
          FROM loan_approval_logs la
          WHERE la.loan_id = l.id
            AND la.action IN ('approve','finance_pay')
            AND la.to_status IN ('财务已审核','已打款')
          ORDER BY la.created_at DESC
          LIMIT 1
        )
      ) AS finance_comment,
      COALESCE(
        l.manager_comment,
        (
          SELECT la2.comment
          FROM loan_approval_logs la2
          WHERE la2.loan_id = l.id
            AND la2.action = 'approve'
            AND la2.to_status = '总经理已审批'
          ORDER BY la2.created_at DESC
          LIMIT 1
        )
      ) AS manager_comment
    FROM loans l
    LEFT JOIN users u ON l.user_id=u.id
    WHERE l.id = ?`;
  const loan = db.prepare(sql).get(loanId);
  if (!loan) return res.status(404).json({ msg: '未找到' });
  const { hasPermission } = require('../auth/permissions');
  if (!hasPermission(req.user.role,'loans.read.all') && loan.user_id !== req.user.userId) {
    return res.status(403).json({ msg: '无权限' });
  }
  const approvalLogs = db.prepare(`
    SELECT l.*, u.real_name as approver_name
    FROM loan_approval_logs l
    LEFT JOIN users u ON l.approver_id = u.id
    WHERE l.loan_id = ?
    ORDER BY l.created_at ASC
  `).all(loanId);
  res.json({
    ...loan,
    approval_logs: approvalLogs
  });
});

// 还款接口：支持财务或本人操作，支持部分还款
router.post('/loans/:id/repay', verifyToken, (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    let { amount, remark, reimbursement_id } = req.body;
    amount = parseFloat(amount);
    if (!amount || amount <= 0) return res.status(400).json({ msg: '还款金额必须为正数' });
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
    if (!loan) return res.status(404).json({ msg: '未找到借款' });
    if (!['finance','admin'].includes(req.user.role) && req.user.userId !== loan.user_id) {
      return res.status(403).json({ msg: '无权限' });
    }
    if (loan.remaining_amount <= 0) return res.status(400).json({ msg: '该借款已结清' });
    if (amount > loan.remaining_amount) return res.status(400).json({ msg: '还款金额不能大于剩余借款' });
    let repayType = 'cash';
    if (reimbursement_id) {
      // 校验报销单
      const reimb = db.prepare('SELECT * FROM reimbursements WHERE id=?').get(reimbursement_id);
      if (!reimb) return res.status(400).json({ msg: '报销单不存在' });
      repayType = 'reimbursement';
    }
    db.transaction(() => {
      db.prepare('UPDATE loans SET remaining_amount = remaining_amount - ? WHERE id=?').run(amount, loanId);
      const updated = db.prepare('SELECT remaining_amount, amount FROM loans WHERE id=?').get(loanId);
      let newStatus = loan.status;
      if (updated.remaining_amount <= 0) {
        newStatus = '已还清';
      } else if (updated.remaining_amount < updated.amount) {
        newStatus = '部分已还';
      }
      db.prepare('UPDATE loans SET status=? WHERE id=?').run(newStatus, loanId);
      db.prepare('INSERT INTO loan_payment_logs(loan_id, action, amount, operator_id, remark, type, reimbursement_id) VALUES (?,?,?,?,?,?,?)')
        .run(loanId, 'repay', amount, req.user.userId, remark || '', repayType, reimbursement_id || null);
      logAction({ userId: req.user.userId, action: 'repay_loan', detail: `loanId:${loanId}, amount:${amount}, type:${repayType}`, ip: req.ip });
      recordAudit({ userId:req.user.userId, eventType:'loan.repay', entity:'loan', entityId:loanId, detail:`amount=${amount} type=${repayType}`, ip:req.ip });
    })();
    res.json({ msg: '还款成功' });
  } catch (error) {
    console.error('还款失败:', error);
    res.status(500).json({ msg: '还款失败', error: error.message });
  }
});

// 查询用户可用做抵扣的借款列表（财务或本人可查）
router.get('/loans/available-for-offset/:userId', verifyToken, (req, res) => {
  try {
  // 防止英文状态导致列表缺失
  selfHealLoanStatuses();
    const userId = parseInt(req.params.userId);
    if (!['finance','admin'].includes(req.user.role) && req.user.userId !== userId) {
      return res.status(403).json({ msg: '无权限' });
    }
    const loans = db.prepare(`
      SELECT id, amount, purpose, remaining_amount, created_at 
      FROM loans 
      WHERE user_id=? AND status IN ('已打款', '部分已还') AND remaining_amount > 0
      ORDER BY created_at ASC
    `).all(userId);
    res.json(loans);
  } catch (error) {
    console.error('获取可抵扣借款列表失败:', error);
    res.status(500).json({ msg: '获取可抵扣借款列表失败' });
  }
});

// 获取指定用户借款余额
router.get('/loan-balance/:user_id', verifyToken, (req, res) => {
  try {
  // 聚合前先标准化
  selfHealLoanStatuses();
    const userId = parseInt(req.params.user_id);
    if (userId !== req.user.userId && !['finance', 'manager', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ msg: '无权限' });
    }
    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(remaining_amount), 0) as total_loan_balance,
        COUNT(*) as active_loans_count
      FROM loans
      WHERE user_id=? AND remaining_amount > 0 AND status IN ('已打款', '部分已还')
    `).get(userId);
    res.json({ user_id: userId, ...summary });
  } catch (error) {
    console.error('获取借款余额失败:', error);
    res.status(500).json({ msg: '获取借款余额失败' });
  }
});

// 获取所有员工借款余额汇总
router.get('/loan-balances', verifyToken, requirePermission('loans.read.all'), (req, res) => {
  // 聚合前做一次自愈，避免英文状态导致漏算
  selfHealLoanStatuses();
  const rows = db.prepare(`
    SELECT u.id as user_id, u.real_name, u.username, u.role,
      COALESCE(SUM(l.remaining_amount), 0) as total_loan_balance,
      COUNT(l.id) as active_loans_count
    FROM users u
    LEFT JOIN loans l ON l.user_id = u.id AND l.remaining_amount > 0 AND l.status IN ('已打款', '部分已还')
    GROUP BY u.id
    HAVING total_loan_balance > 0
    ORDER BY total_loan_balance DESC
  `).all();
  res.json(rows);
});

// 员工借款明细（分页/搜索/冲抵详情）
router.get('/loans/user/:userId', verifyToken, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 10));
    const search = (req.query.search || '').trim();
    if (userId !== req.user.userId && !['finance','manager','admin'].includes(req.user.role)) {
      return res.status(403).json({ msg: '无权限' });
    }
    let where = 'WHERE l.user_id = ?';
    let params = [userId];
    if (search) {
      where += ' AND (l.purpose LIKE ? OR l.remark LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    const total = db.prepare(`SELECT COUNT(*) as c FROM loans l ${where}`).get(...params).c;
    const rows = db.prepare(`
      SELECT 
        l.*, 
        u.real_name,
        -- 当列为空时，回填最近一次相关审批/打款的备注
        COALESCE(
          l.finance_comment,
          (
            SELECT la.comment 
            FROM loan_approval_logs la 
            WHERE la.loan_id = l.id 
              AND la.action IN ('approve','finance_pay')
              AND la.to_status IN ('财务已审核','已打款')
            ORDER BY la.created_at DESC 
            LIMIT 1
          )
        ) AS finance_comment,
        COALESCE(
          l.manager_comment,
          (
            SELECT la2.comment 
            FROM loan_approval_logs la2 
            WHERE la2.loan_id = l.id 
              AND la2.action = 'approve'
              AND la2.to_status = '总经理已审批'
            ORDER BY la2.created_at DESC 
            LIMIT 1
          )
        ) AS manager_comment
      FROM loans l 
      LEFT JOIN users u ON l.user_id=u.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page-1)*pageSize);
    const loanIds = rows.map(r => r.id);
    let offsetsMap = {};
    if (loanIds.length > 0) {
      try {
        // 获取借款冲抵信息，包括关联的报销单号
        const offsets = db.prepare(`
          SELECT
            rll.loan_id,
            rll.offset_amount,
            rll.created_at as offset_date,
            rf.form_number,
            rf.id as form_id,
            rf.total_amount as form_total_amount
          FROM reimbursement_loan_links rll
          LEFT JOIN reimbursement_forms rf ON rll.form_id = rf.id
          WHERE rll.loan_id IN (${loanIds.map(()=>'?').join(',')})
          ORDER BY rll.created_at DESC
        `).all(...loanIds);
        for (const off of offsets) {
          if (!offsetsMap[off.loan_id]) offsetsMap[off.loan_id] = [];
          offsetsMap[off.loan_id].push({
            offset_amount: off.offset_amount,
            offset_date: off.offset_date,
            form_number: off.form_number,
            form_id: off.form_id,
            form_total_amount: off.form_total_amount
          });
        }
      } catch (e) {
        console.warn('贷款抵扣明细联查失败，将以空列表降级返回:', e.message);
        offsetsMap = {};
      }
    }
    const result = rows.map(row => ({
      ...row,
      offsets: offsetsMap[row.id] || []
    }));
    res.json({ total, loans: result });
  } catch (error) {
    console.error('获取员工借款明细失败:', error);
    res.status(500).json({ msg: '获取员工借款明细失败' });
  }
});

// 借款审批日志查询
router.get('/loans/:id/approval-logs', verifyToken, (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
    if (!loan) return res.status(404).json({ msg: '未找到借款' });
    const { hasPermission } = require('../auth/permissions');
    if (!hasPermission(req.user.role,'loans.read.all') && loan.user_id !== req.user.userId) {
      return res.status(403).json({ msg: '无权限' });
    }
    const logs = db.prepare(`
      SELECT l.*, u.real_name as approver_name
      FROM loan_approval_logs l
      LEFT JOIN users u ON l.approver_id = u.id
      WHERE l.loan_id = ?
      ORDER BY l.created_at ASC
    `).all(loanId);
      const mapped = logs.map(x => ({
        ...x,
        action_zh: x.action === 'approve' ? '通过' : (x.action === 'reject' ? '驳回' : (x.action === 'finance_pay' ? '财务打款' : x.action))
      }));
      res.json(mapped);
  } catch (error) {
    console.error('获取借款审批日志失败:', error);
    res.status(500).json({ msg: '获取借款审批日志失败' });
  }
});

// ============ Admin: 删除借款 ============
router.delete('/loans/:id', verifyToken, requirePermission('loans.delete.any'), (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(loanId);
    if (!loan) return res.status(404).json({ msg: '未找到借款' });

    // 只能删除草稿状态或已驳回的借款，确保财务安全
    const allowedStatuses = ['草稿', '财务已驳回', '总经理已驳回'];
    if (!allowedStatuses.includes(loan.status)) {
      return res.status(400).json({
        success: false,
        message: '无法删除此借款：只能删除草稿状态或已驳回的借款。已审批通过或已打款的借款不能删除，以确保财务记录的完整性。'
      });
    }

    const tx = db.transaction(() => {
      // 删除与报销冲抵的关联与记录
      try { db.prepare('DELETE FROM reimbursement_loan_links WHERE loan_id=?').run(loanId); } catch (_) {}
      try { db.prepare('DELETE FROM reimbursement_loan_offsets WHERE loan_id=?').run(loanId); } catch (_) {}
      // 删除日志
      try { db.prepare('DELETE FROM loan_payment_logs WHERE loan_id=?').run(loanId); } catch (_) {}
      try { db.prepare('DELETE FROM loan_approval_logs WHERE loan_id=?').run(loanId); } catch (_) {}
      // 删除借款本身
      db.prepare('DELETE FROM loans WHERE id=?').run(loanId);
    });
    tx();
    logAction({ userId: req.user.userId, action: 'admin_delete_loan', detail: `loanId=${loanId}`, ip: req.ip });
    res.json({ success: true });
  } catch (error) {
    console.error('Admin 删除借款失败:', error);
    res.status(500).json({ msg: '删除失败', detail: error.message });
  }
});
// ============ Admin 接口结束 ============

module.exports = router;

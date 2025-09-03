const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middlewares/auth');

// 角色限制：财务(finance) 或 总经理(manager) 或 管理员(admin)
function ensureAnalyticsRole(req, res, next) {
  const allowed = ['finance', 'manager', 'admin'];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ msg: '无权限' });
  }
  next();
}

// 参数说明：
// dataset=loans|reimbursements 统计对象
// group_by=month|user|type
// metric=count|amount
// start=YYYY-MM-DD  end=YYYY-MM-DD （可选）
// 返回 { meta:{...}, data:[{ label:..., value:..., count, amount, items:[...] }], totals:{count, amount} }
router.get('/summary', verifyToken, ensureAnalyticsRole, (req, res) => {
  try {
    const dataset = (req.query.dataset || 'reimbursements').toString();
    const groupBy = (req.query.group_by || 'month').toString();
    const metric = (req.query.metric || 'amount').toString();
    const start = req.query.start ? req.query.start.toString() : null;
    const end = req.query.end ? req.query.end.toString() : null;
    // 新增过滤参数（任选其一或组合）：user_id / username / real_name(模糊)
    const userId = req.query.user_id ? parseInt(req.query.user_id.toString(), 10) : null;
    const username = req.query.username ? req.query.username.toString() : null;
    const realName = req.query.real_name ? req.query.real_name.toString() : null;

    if (!['loans','reimbursements'].includes(dataset)) return res.status(400).json({ msg: 'dataset无效' });
    if (!['month','user','type'].includes(groupBy)) return res.status(400).json({ msg: 'group_by无效' });
    if (!['count','amount'].includes(metric)) return res.status(400).json({ msg: 'metric无效' });

    let table = dataset === 'loans' ? 'loans' : 'reimbursements';
    let amountField = 'amount';
    let dateField = 'created_at';

    const where = [];
    const params = [];
    if (start) { where.push(`${dateField} >= ?`); params.push(start + ' 00:00:00'); }
    if (end) { where.push(`${dateField} <= ?`); params.push(end + ' 23:59:59'); }

    // 如果用户过滤存在，需要连接 users 表（除非已经因为 groupBy=user 会连接）
    let needUserJoin = groupBy === 'user' || userId || username || realName;

    if (userId) { where.push('t.user_id = ?'); params.push(userId); }
    if (username) { where.push('u.username = ?'); params.push(username); }
    if (realName) { where.push('u.real_name LIKE ?'); params.push('%' + realName + '%'); }

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    let selectLabel, groupExpr;
    if (groupBy === 'month') {
      groupExpr = `substr(${dateField},1,7)`; // YYYY-MM
      selectLabel = groupExpr + ' AS label';
    } else if (groupBy === 'user') {
      groupExpr = 'user_id';
      selectLabel = "COALESCE(u.real_name,'未知') || '(ID:' || t.user_id || ') ' || COALESCE(u.username,'') AS label";
    } else if (groupBy === 'type') {
      if (dataset === 'loans') {
        groupExpr = "COALESCE(purpose,'未填写')";
      } else {
        groupExpr = "COALESCE(type,'未填写')";
      }
      selectLabel = groupExpr + ' AS label';
    }

    let baseSql = `SELECT ${selectLabel}, ${groupExpr} AS grp, COUNT(*) AS cnt, SUM(${amountField}) AS amt FROM ${table} t`;
    if (needUserJoin) baseSql += ' LEFT JOIN users u ON t.user_id = u.id';
    baseSql += ' ' + whereSql + ' GROUP BY grp ORDER BY amt DESC NULLS LAST';

    const rows = db.prepare(baseSql).all(...params);

    const totalCount = rows.reduce((s,r)=> s + (r.cnt||0), 0);
    const totalAmount = rows.reduce((s,r)=> s + (Number(r.amt)||0), 0);

    const data = rows.map(r => ({
      label: r.label,
      value: metric === 'count' ? r.cnt : Number(r.amt)||0,
      count: r.cnt,
      amount: Number(r.amt)||0,
    }));

    res.json({
      meta: { dataset, group_by: groupBy, metric, start, end, user_id: userId, username, real_name: realName },
      totals: { count: totalCount, amount: totalAmount },
      data
    });
  } catch (e) {
    console.error('统计summary失败:', e);
    res.status(500).json({ msg: '统计失败' });
  }
});

// 时序趋势：按月返回最近 N 个月数据（默认6） dataset 同上，metric 同上
router.get('/trend', verifyToken, ensureAnalyticsRole, (req, res) => {
  try {
    const dataset = (req.query.dataset || 'reimbursements').toString();
    const metric = (req.query.metric || 'amount').toString();
    const months = Math.min(parseInt(req.query.months || '6'), 24);
    if (!['loans','reimbursements'].includes(dataset)) return res.status(400).json({ msg: 'dataset无效' });
    if (!['count','amount'].includes(metric)) return res.status(400).json({ msg: 'metric无效' });
    const table = dataset === 'loans' ? 'loans' : 'reimbursements';
    const amountField = 'amount';

    const sql = `SELECT substr(created_at,1,7) AS ym, COUNT(*) AS cnt, SUM(${amountField}) AS amt
                 FROM ${table}
                 WHERE created_at >= date('now','-${months} months')
                 GROUP BY ym
                 ORDER BY ym ASC`;
    const rows = db.prepare(sql).all();
    const data = rows.map(r => ({ month: r.ym, count: r.cnt, amount: Number(r.amt)||0, value: metric==='count'? r.cnt : Number(r.amt)||0 }));
    res.json({ meta:{ dataset, metric, months }, data });
  } catch (e) {
    console.error('统计trend失败:', e);
    res.status(500).json({ msg: '统计失败' });
  }
});

module.exports = router;

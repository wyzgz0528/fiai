const db = require('../db');
const { logAction } = require('../utils/audit');
const ERR = require('../constants/errorCodes');
const ACTION = require('../constants/actionCodes');
const crypto = require('crypto');
const { BizError } = require('../middlewares/errorHandler');

function ensureApprovalSchema(){
  // 仅做最小幂等，避免路由多处复制
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
    if(!tables.includes('reimbursement_form_approval_logs')){
      db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_form_approval_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INTEGER NOT NULL, approver_id INTEGER NOT NULL, action VARCHAR(20) NOT NULL, approved_record_ids TEXT, rejected_record_ids TEXT, new_form_id INTEGER, comment TEXT, action_fingerprint TEXT, created_at DATETIME DEFAULT (datetime('now', 'localtime')))`).run();
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_form_approval_logs_form_id ON reimbursement_form_approval_logs(form_id)').run(); } catch(_){}}
    else {
      // 补列 action_fingerprint
      const cols = db.pragma('table_info(reimbursement_form_approval_logs)').map(c=>c.name);
      if(!cols.includes('action_fingerprint')){
        try { db.prepare('ALTER TABLE reimbursement_form_approval_logs ADD COLUMN action_fingerprint TEXT').run(); } catch(_){ }
      }
    }
    if(!tables.includes('reimbursement_form_splits')){
      db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_form_splits (id INTEGER PRIMARY KEY AUTOINCREMENT, original_form_id INTEGER NOT NULL, new_form_id INTEGER NOT NULL, split_type VARCHAR(20) NOT NULL, record_ids TEXT NOT NULL, created_by INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_form_splits_original_id ON reimbursement_form_splits(original_form_id)').run(); } catch(_){}}
    // 索引补齐
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_forms_parent ON reimbursement_forms(parent_form_id)').run(); } catch(_){ }
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_forms_status_parent ON reimbursement_forms(status,parent_form_id)').run(); } catch(_){ }
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_form_splits_new_form ON reimbursement_form_splits(new_form_id)').run(); } catch(_){ }

    // 动态列补齐（防止历史库缺少）
    const formCols = db.pragma('table_info(reimbursement_forms)').map(c=>c.name);
    const addFormCol = (col,def) => { try { if(!formCols.includes(col)) db.prepare(`ALTER TABLE reimbursement_forms ADD COLUMN ${col} ${def}`).run(); } catch(_){} };
    addFormCol('parent_form_id','INTEGER');
    addFormCol('is_split_from_parent','BOOLEAN DEFAULT 0');
    addFormCol('split_reason','TEXT');
    addFormCol('approved_record_count','INTEGER DEFAULT 0');
    addFormCol('rejected_record_count','INTEGER DEFAULT 0');
    addFormCol('version','INTEGER DEFAULT 0');

    const reimbCols = db.pragma('table_info(reimbursements)').map(c=>c.name);
    const addReimbCol = (col,def)=>{ try { if(!reimbCols.includes(col)) db.prepare(`ALTER TABLE reimbursements ADD COLUMN ${col} ${def}`).run(); } catch(_){} };
    addReimbCol('approval_status',"VARCHAR(20) DEFAULT 'pending'");
    addReimbCol('reject_reason','TEXT');
    addReimbCol('approver_id','INTEGER');
    addReimbCol('approved_at','DATETIME');
  } catch(_) {}
}

function validatePermission(role,status){
  // 更新权限验证：使用新的状态名称
  const permissions = {
    finance: ['草稿','draft','待财务审核','submitted'],
    manager: ['财务已审核','财务已通过','finance_approved']
  };
  const allowed = permissions[role] || [];
  return allowed.includes(status);
}

function nextRecordStatus(role){
  return role==='finance' ? 'finance_approved' : role==='manager' ? 'manager_approved' : 'pending';
}
function nextFormStatus(role,kind){
  // 更新状态转换逻辑：区分财务驳回和总经理驳回
  if(kind===ACTION.ALL_REJECTED || kind==='rejected') {
    return role==='finance' ? '财务已驳回' : role==='manager' ? '总经理已驳回' : '财务已驳回';
  }
  const map={
    finance:{[ACTION.ALL_APPROVED]:'财务已通过',approved:'财务已通过'},
    manager:{[ACTION.ALL_APPROVED]:'总经理已通过',approved:'总经理已通过'}
  };
  return (map[role]&&map[role][kind]) || '待财务审核';
}
function genSplitNumber(originalNumber){
  const ts=new Date().toISOString().replace(/[-:T.]/g,'').slice(0,14);
  return `${originalNumber}-SP${ts}`;
}

function buildFingerprint(approvedIds,rejectedIds, comment='', version=0){
  const a=[...approvedIds].sort((x,y)=>x-y);
  const r=[...rejectedIds].sort((x,y)=>x-y);
  // 🔧 将版本号纳入指纹计算，确保重新提交后的审批不会被误判为重复操作
  const raw=JSON.stringify({a,r,c:comment||'',v:version});
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function approveForm(formId, actor, payload){
  ensureApprovalSchema();
  const { action, approved_record_ids=[], rejected_record_ids=[], comment='', expected_version } = payload||{};
  const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
  if(!form) throw new BizError(ERR.FORM_NOT_FOUND);
  // 🔧 修复幂等指纹检查：将报销单版本号纳入指纹计算，避免重新提交后的审批被误判为重复操作
  const currentVersion = form.version || 0;
  const fingerprint = buildFingerprint(approved_record_ids,rejected_record_ids, comment, currentVersion);

  const lastLog = db.prepare('SELECT * FROM reimbursement_form_approval_logs WHERE form_id=? AND approver_id=? AND action_fingerprint=? ORDER BY id DESC LIMIT 1').get(formId, actor.userId, fingerprint);
  if(lastLog){
    return { reused:true, code:ERR.IDEMPOTENT_REPLAY, original_form_id: formId, original_form_status: form?.status, new_form_id: lastLog.new_form_id || null, approved_count: approved_record_ids.length, rejected_count: rejected_record_ids.length };
  }
  if(!['finance','manager'].includes(actor.role)) throw new BizError(ERR.FORBIDDEN);
  if(!validatePermission(actor.role, form.status)) throw new BizError(ERR.FORBIDDEN, '无审批权限');
  // 早期版本冲突检测（策略 a）
  if(expected_version != null && Number(expected_version) !== Number(form.version||0)){
    throw new BizError(ERR.CONFLICT, '版本不匹配');
  }
  const records = db.prepare('SELECT * FROM reimbursements WHERE form_id=?').all(formId);
  if(records.length===0) throw new BizError(ERR.NO_RECORDS);
  const idsAll = records.map(r=>r.id);
  const invalidApproved = approved_record_ids.filter(id=>!idsAll.includes(id));
  const invalidRejected = rejected_record_ids.filter(id=>!idsAll.includes(id));
  if(invalidApproved.length || invalidRejected.length){
    throw new BizError(ERR.INVALID_RECORD_IDS,'包含无效记录ID',{invalidApproved, invalidRejected});
  }
  const processed=[...approved_record_ids,...rejected_record_ids];
  const unprocessed = idsAll.filter(id=>!processed.includes(id));
  if(unprocessed.length) throw new BizError(ERR.UNPROCESSED_RECORDS,'存在未指定审批状态的记录',{unprocessed});
  const fingerprint2 = fingerprint; // 继续复用
  const approvalTime = new Date().toISOString();
  const recordNext = nextRecordStatus(actor.role);
  let newFormId=null; let originalFormStatus='';
  let branchAction='unknown';
  const tx = db.transaction(()=>{
    // 全部通过
    if(approved_record_ids.length===records.length && rejected_record_ids.length===0){
      const up = db.prepare('UPDATE reimbursements SET approval_status=?, approver_id=?, approved_at=? WHERE id=?');
      approved_record_ids.forEach(rid=> up.run(recordNext, actor.userId, approvalTime, rid));
      const newStatus = nextFormStatus(actor.role,ACTION.ALL_APPROVED);
      const formRes = db.prepare('UPDATE reimbursement_forms SET status=?, approved_record_count=?, rejected_record_count=0, version=version+1 WHERE id=? AND version=?')
        .run(newStatus, approved_record_ids.length, formId, currentVersion);
      if(formRes.changes===0) throw new BizError(ERR.CONFLICT,'版本冲突');
      originalFormStatus=newStatus;
      branchAction=ACTION.ALL_APPROVED;
    }
    // 全部驳回
    else if(rejected_record_ids.length===records.length && approved_record_ids.length===0){
      const rejectedStatus = actor.role==='finance' ? 'finance_rejected' : 'manager_rejected';
      const up = db.prepare("UPDATE reimbursements SET approval_status=?, approver_id=?, approved_at=?, reject_reason=? WHERE id=?");
      rejected_record_ids.forEach(rid=> up.run(rejectedStatus, actor.userId, approvalTime, comment, rid));
      const newFormStatus = nextFormStatus(actor.role, ACTION.ALL_REJECTED);
      const formRes = db.prepare("UPDATE reimbursement_forms SET status=?, approved_record_count=0, rejected_record_count=?, version=version+1 WHERE id=? AND version=?")
        .run(newFormStatus, rejected_record_ids.length, formId, currentVersion);
      if(formRes.changes===0) throw new BizError(ERR.CONFLICT,'版本冲突');

      // 🔒 自动锁定被驳回的报销单
      try {
        const { lockForm } = require('./formService');
        lockForm(formId, `报销单已被${actor.role === 'finance' ? '财务' : '总经理'}驳回，不可修改。如需重新申请，请创建新的报销单。`);
      } catch (e) {
        console.warn('自动锁定报销单失败:', e.message);
      }

      originalFormStatus=newFormStatus;
      branchAction=ACTION.ALL_REJECTED;
    }
    // 部分通过
    else {
      const rejectedStatus = actor.role==='finance' ? 'finance_rejected' : 'manager_rejected';
      const upRej = db.prepare("UPDATE reimbursements SET approval_status=?, approver_id=?, approved_at=?, reject_reason=? WHERE id=?");
      rejected_record_ids.forEach(rid=> upRej.run(rejectedStatus, actor.userId, approvalTime, comment, rid));
      const approvedRecords = records.filter(r=> approved_record_ids.includes(r.id));
      const totalApproved = approvedRecords.reduce((s,r)=> s + Number(r.amount||0),0);
      const newNumber = genSplitNumber(form.form_number);
      const newInfo = db.prepare(`INSERT INTO reimbursement_forms (user_id, form_number, total_amount, status, parent_form_id, is_split_from_parent, split_reason, approved_record_count, rejected_record_count, version, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,datetime('now', 'localtime'))`)
        .run(form.user_id, newNumber, totalApproved, nextFormStatus(actor.role,'approved'), formId, 1, `从报销单${form.form_number}拆分 - 部分审批通过`, approved_record_ids.length, 0);
      newFormId = newInfo.lastInsertRowid;
      const upApp = db.prepare('UPDATE reimbursements SET form_id=?, approval_status=?, approver_id=?, approved_at=? WHERE id=?');
      approved_record_ids.forEach(rid=> upApp.run(newFormId, recordNext, actor.userId, approvalTime, rid));

      // 🔧 处理凭证重新分配
      handleVoucherReallocation(formId, newFormId, approved_record_ids, rejected_record_ids);

      const rejectedAmount = records.filter(r=> rejected_record_ids.includes(r.id)).reduce((s,r)=> s + Number(r.amount||0),0);
      const rejectedFormStatus = actor.role==='finance' ? '财务已驳回' : '总经理已驳回';
      const formRes = db.prepare("UPDATE reimbursement_forms SET status=?, total_amount=?, approved_record_count=0, rejected_record_count=?, version=version+1 WHERE id=? AND version=?")
        .run(rejectedFormStatus, rejectedAmount, rejected_record_ids.length, formId, currentVersion);
      if(formRes.changes===0) throw new BizError(ERR.CONFLICT,'版本冲突');
      db.prepare('INSERT INTO reimbursement_form_splits (original_form_id,new_form_id,split_type,record_ids,created_by) VALUES (?,?,?,?,?)')
        .run(formId, newFormId, 'approved', JSON.stringify(approved_record_ids), actor.userId);

      // 🔒 自动锁定包含被驳回明细的原报销单
      try {
        const { lockForm } = require('./formService');
        lockForm(formId, `报销单部分明细被${actor.role === 'finance' ? '财务' : '总经理'}驳回，原单已锁定。通过的明细已生成新报销单 ${newNumber}。`);
      } catch (e) {
        console.warn('自动锁定报销单失败:', e.message);
      }

      originalFormStatus=rejectedFormStatus;
      branchAction=ACTION.PARTIAL;
    }
    // 审批日志
    let finalAction = branchAction && branchAction!=='unknown' ? branchAction : deriveFinalAction(approved_record_ids.length, rejected_record_ids.length, records.length);
    db.prepare('INSERT INTO reimbursement_form_approval_logs (form_id, approver_id, action, approved_record_ids, rejected_record_ids, new_form_id, comment, action_fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?,datetime(\'now\', \'localtime\'))')
      .run(formId, actor.userId, finalAction, JSON.stringify(approved_record_ids), JSON.stringify(rejected_record_ids), newFormId, comment, fingerprint2);
  });
  tx();
  logAction({ userId: actor.userId, action:'form_approval', detail:`form=${formId};approved=${approved_record_ids.length};rejected=${rejected_record_ids.length}` });
  return { original_form_id: formId, original_form_status: originalFormStatus, new_form_id: newFormId, approved_count: approved_record_ids.length, rejected_count: rejected_record_ids.length, final_action: branchAction, version_after: (form.version||0)+1 };
}

function deriveFinalAction(approvedCount, rejectedCount, total){
  if(total===0) return 'unknown';
  if(approvedCount===total && rejectedCount===0) return ACTION.ALL_APPROVED;
  if(rejectedCount===total && approvedCount===0) return ACTION.ALL_REJECTED;
  if(approvedCount>0 && rejectedCount>0) return ACTION.PARTIAL;
  return ACTION.UNKNOWN;
}

function getApprovalHistory(formId, includeAncestors){
  ensureApprovalSchema();
  const { canonicalizeAction } = ACTION; // ACTION 现在是对象本身
  const canonicalize = (a)=> canonicalizeAction ? canonicalizeAction(a) : a;
  if(!includeAncestors){
    const rows = db.prepare(`SELECT rfal.*, u.real_name as approver_name, u.role as approver_role FROM reimbursement_form_approval_logs rfal LEFT JOIN users u ON rfal.approver_id = u.id WHERE rfal.form_id=? ORDER BY rfal.created_at DESC`).all(formId);
    return rows.map(r=>({...r, action: canonicalize(r.action), approved_record_ids: JSON.parse(r.approved_record_ids||'[]'), rejected_record_ids: JSON.parse(r.rejected_record_ids||'[]')}));
  }
  const ids=[]; let current=formId; const seen=new Set();
  while(current && !seen.has(current)){
    seen.add(current); ids.push(current);
    const parent = db.prepare('SELECT parent_form_id FROM reimbursement_forms WHERE id=?').get(current);
    current = parent?.parent_form_id || null;
  }
  const ph = ids.map(()=>'?').join(',');
  const rowsRaw = db.prepare(`SELECT rfal.*, u.real_name as approver_name, u.role as approver_role, rf.form_number FROM reimbursement_form_approval_logs rfal LEFT JOIN users u ON rfal.approver_id = u.id LEFT JOIN reimbursement_forms rf ON rf.id = rfal.form_id WHERE rfal.form_id IN (${ph}) ORDER BY rfal.created_at ASC`).all(...ids);
  return { form_id: formId, merged:true, count: rowsRaw.length, logs: rowsRaw.map(r=>({...r, action: canonicalize(r.action), approved_record_ids: JSON.parse(r.approved_record_ids||'[]'), rejected_record_ids: JSON.parse(r.rejected_record_ids||'[]'), source_form_id:r.form_id, source_form_number:r.form_number, source_level: ids.indexOf(r.form_id) })) };
}

/**
 * 处理报销单拆分时的凭证重新分配
 * @param {number} originalFormId - 原报销单ID
 * @param {number} newFormId - 新报销单ID
 * @param {number[]} approvedRecordIds - 通过的报销记录ID列表
 * @param {number[]} rejectedRecordIds - 驳回的报销记录ID列表
 */
function handleVoucherReallocation(originalFormId, newFormId, approvedRecordIds, rejectedRecordIds) {
  console.log('=== 开始处理凭证重新分配 ===');
  console.log('原报销单ID:', originalFormId);
  console.log('新报销单ID:', newFormId);
  console.log('通过的记录ID:', approvedRecordIds);
  console.log('驳回的记录ID:', rejectedRecordIds);

  try {
    // 确保关联表存在
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reimbursement_record_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER NOT NULL,
        voucher_id INTEGER NOT NULL,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(record_id, voucher_id)
      )
    `).run();

    // 获取通过记录关联的凭证
    const approvedVouchers = db.prepare(`
      SELECT DISTINCT v.id as voucher_id, v.original_name, v.file_path
      FROM vouchers v
      INNER JOIN reimbursement_record_vouchers rrv ON v.id = rrv.voucher_id
      WHERE rrv.record_id IN (${approvedRecordIds.map(() => '?').join(',')})
      AND v.reimbursement_form_id = ?
    `).all(...approvedRecordIds, originalFormId);

    console.log('需要迁移的凭证:', approvedVouchers);

    if (approvedVouchers.length > 0) {
      // 复制凭证到新报销单
      const fs = require('fs');
      const path = require('path');

      // 辅助函数：构建凭证路径
      function buildVoucherPath(formId, originalName) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const ext = path.extname(originalName);
        const fileName = `${timestamp}_${randomStr}${ext}`;
        const relativePath = `vouchers/${year}/${month}/form_${formId}/${fileName}`;
        const absolutePath = path.join(__dirname, '../../uploads', relativePath);
        return { rel: relativePath, abs: absolutePath, fileName };
      }

      // 辅助函数：确保目录存在
      function ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }

      for (const voucher of approvedVouchers) {
        // 复制物理文件
        const originalPath = path.join(__dirname, '../../uploads', voucher.file_path);
        const { rel: newRel, abs: newAbs, fileName: newFileName } = buildVoucherPath(newFormId, voucher.original_name);

        if (fs.existsSync(originalPath)) {
          ensureDir(path.dirname(newAbs));
          fs.copyFileSync(originalPath, newAbs);
          console.log('复制凭证文件:', voucher.original_name, '->', newRel);

          // 获取原凭证信息
          const originalVoucherInfo = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(voucher.voucher_id);

          // 在新报销单中创建凭证记录
          const newVoucherInfo = db.prepare(`
            INSERT INTO vouchers (reimbursement_form_id, original_name, file_name, file_path, file_size, file_type, uploaded_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(
            newFormId,
            originalVoucherInfo.original_name,
            newFileName,
            newRel,
            originalVoucherInfo.file_size,
            originalVoucherInfo.file_type,
            originalVoucherInfo.uploaded_by
          );

          const newVoucherId = newVoucherInfo.lastInsertRowid;
          console.log('创建新凭证记录:', newVoucherId);

          // 更新通过记录的凭证关联到新凭证
          for (const recordId of approvedRecordIds) {
            const existingLink = db.prepare('SELECT * FROM reimbursement_record_vouchers WHERE record_id = ? AND voucher_id = ?').get(recordId, voucher.voucher_id);
            if (existingLink) {
              // 删除旧关联
              db.prepare('DELETE FROM reimbursement_record_vouchers WHERE record_id = ? AND voucher_id = ?').run(recordId, voucher.voucher_id);
              // 创建新关联
              db.prepare('INSERT OR IGNORE INTO reimbursement_record_vouchers (record_id, voucher_id, created_by) VALUES (?, ?, ?)').run(recordId, newVoucherId, existingLink.created_by);
              console.log('更新记录凭证关联:', recordId, '->', newVoucherId);
            }
          }
        }
      }

      // 清理原报销单中已迁移的凭证（只删除已经复制到新报销单的凭证）
      console.log('清理原报销单中已迁移的凭证...');
      const migratedVoucherIds = vouchersToMigrate.map(v => v.voucher_id);

      for (const voucherId of migratedVoucherIds) {
        const voucherInfo = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(voucherId);
        if (voucherInfo) {
          // 删除物理文件
          const voucherPath = path.join(__dirname, '../../uploads', voucherInfo.file_path);
          if (fs.existsSync(voucherPath)) {
            try {
              fs.unlinkSync(voucherPath);
              console.log('删除已迁移凭证文件:', voucherInfo.original_name);
            } catch (error) {
              console.warn('删除已迁移凭证文件失败:', error);
            }
          }

          // 删除数据库记录
          db.prepare('DELETE FROM vouchers WHERE id = ?').run(voucherId);
          console.log('删除已迁移凭证记录:', voucherInfo.original_name, '(ID:', voucherId, ')');
        }
      }
    }

    console.log('=== 凭证重新分配完成 ===');
  } catch (error) {
    console.error('凭证重新分配失败:', error);
    // 不抛出错误，避免影响主流程
  }
}

function getSplitInfo(formId){
  ensureApprovalSchema();
  const splits = db.prepare(`SELECT rfs.*, rf_new.form_number as new_form_number, rf_new.status as new_form_status, u.real_name as created_by_name FROM reimbursement_form_splits rfs LEFT JOIN reimbursement_forms rf_new ON rfs.new_form_id = rf_new.id LEFT JOIN users u ON rfs.created_by = u.id WHERE rfs.original_form_id=? ORDER BY rfs.created_at DESC`).all(formId);
  const derivedForms = db.prepare('SELECT * FROM reimbursement_forms WHERE parent_form_id=? ORDER BY created_at DESC').all(formId);
  return { splits: splits.map(s=>({...s, record_ids: JSON.parse(s.record_ids||'[]')})), derived_forms: derivedForms };
}

module.exports = { approveForm, getApprovalHistory, getSplitInfo, ensureApprovalSchema, deriveFinalAction };

const db = require('../db');
const { logAction } = require('../utils/audit');
const { normalizeFormStatus, formStatusToZh } = require('../utils/status_maps');
const { ensureApprovalSchema } = require('./approvalService');
const { checkInvoiceNumberAvailability, batchCheckInvoiceNumbers } = require('./invoiceValidationService');
const { round2 } = require('../utils/math');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * 处理发票号，只保留后面的8位数字或字母
 * @param {string} invoiceNumber - 原始发票号
 * @returns {string} 处理后的发票号（后8位数字或字母）
 */
function processInvoiceNumber(invoiceNumber) {
  if (!invoiceNumber || typeof invoiceNumber !== 'string') {
    return '';
  }

  // 提取所有数字和字母（移除特殊字符、空格等）
  const alphanumeric = invoiceNumber.replace(/[^a-zA-Z0-9]/g, '');

  // 如果没有数字或字母，返回空字符串
  if (!alphanumeric) {
    return '';
  }

  // 如果字符少于8位，返回所有字符
  if (alphanumeric.length <= 8) {
    return alphanumeric;
  }

  // 返回后8位字符
  return alphanumeric.slice(-8);
}

// 共用：构建凭证路径（复制自原路由，便于后续统一抽象）
function ensureDir(p){ try { fs.mkdirSync(p,{recursive:true}); } catch(_){} }
const UPLOAD_DIR = path.join(__dirname,'..','..','uploads');
function safeBaseName(name){ return String(name||'').replace(/[\\/:*?"<>|\s]+/g,'_').slice(0,120) || 'file'; }
function buildVoucherPath(formId, originalName){
  const dt=new Date(); const y=dt.getFullYear(); const m=String(dt.getMonth()+1).padStart(2,'0');
  const ext=path.extname(originalName||'').toLowerCase(); const rand=crypto.randomBytes(6).toString('hex');
  const base=safeBaseName(path.basename(originalName,ext));
  const relDir=path.join('vouchers',String(y),m,`form_${formId}`);
  const rel=path.join(relDir,`${Date.now()}_${rand}_${base}${ext}`);
  const abs=path.join(UPLOAD_DIR,rel); ensureDir(path.dirname(abs));
  return { rel: rel.replace(/\\/g,'/'), abs };
}

function generateFormNumber(){
  const now=new Date();
  const y=now.getFullYear(), m=String(now.getMonth()+1).padStart(2,'0'), d=String(now.getDate()).padStart(2,'0');
  const today=`${y}${m}${d}`;

  // 使用事务和重试机制来避免并发冲突
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      const row=db.prepare('SELECT COUNT(*) as c FROM reimbursement_forms WHERE form_number LIKE ?').get(`RB${today}%`);
      const seq=(row.c||0)+1;
      const formNumber = `RB${today}${String(seq).padStart(4,'0')}`;

      // 检查是否已存在（双重检查）
      const existing = db.prepare('SELECT id FROM reimbursement_forms WHERE form_number = ?').get(formNumber);
      if (!existing) {
        return formNumber;
      }

      // 如果存在冲突，增加序号重试
      attempts++;
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw error;
      }
    }
  }

  // 如果重试失败，使用时间戳作为后缀
  const timestamp = Date.now().toString().slice(-6);
  return `RB${today}${timestamp}`;
}

// 确保 reimbursement_loan_links 表具备 original_remaining_amount 列，并为缺失数据回填一个安全近似值
function ensureLoanLinkSchema() {
  try {
    const cols = db.prepare("PRAGMA table_info(reimbursement_loan_links)").all().map(c => c.name);
    if (!cols.includes('original_remaining_amount')) {
      try { db.prepare('ALTER TABLE reimbursement_loan_links ADD COLUMN original_remaining_amount REAL').run(); } catch(_) {}
    }
    // 尝试为缺失值回填：使用 min(loan.amount, loan.remaining_amount + link.offset_amount)
    try {
      db.prepare(`
        UPDATE reimbursement_loan_links
        SET original_remaining_amount = (
          SELECT CASE WHEN l.amount < (l.remaining_amount + reimbursement_loan_links.offset_amount)
                      THEN l.amount
                      ELSE (l.remaining_amount + reimbursement_loan_links.offset_amount)
                 END
          FROM loans l WHERE l.id = reimbursement_loan_links.loan_id
        )
        WHERE original_remaining_amount IS NULL OR original_remaining_amount = 0
      `).run();
    } catch(_) { /* ignore if schema differs */ }
  } catch (e) {
    try { console.warn('[ensureLoanLinkSchema] failed:', e.message); } catch(_){ }
  }
}
// 模块加载即确保一次
try { ensureLoanLinkSchema(); } catch(_) {}

function createFormAutoGenerate(user, items, statusFlag, excludeFormId = null){
  // 处理发票号，只保留后8位数字
  const processedItems = items.map(item => ({
    ...item,
    invoice_number: item.invoice_number ? processInvoiceNumber(item.invoice_number) : null
  }));

  // 验证发票号查重（使用处理后的发票号）
  const invoiceNumbers = processedItems
    .map(item => item.invoice_number)
    .filter(num => num && num.trim() !== '');

  if (invoiceNumbers.length > 0) {
    const duplicateCheck = batchCheckInvoiceNumbers(invoiceNumbers, excludeFormId);
    if (duplicateCheck.hasConflicts) {
      const firstConflict = duplicateCheck.conflicts[0];
      // 创建业务错误对象，而不是普通错误
      const businessError = new Error(`发票号"${firstConflict.invoiceNumber}"已提交报销，报销单号：${firstConflict.formNumber}，状态：${firstConflict.formStatus}`);
      businessError.code = 'INVOICE_DUPLICATE';
      businessError.statusCode = 400;
      throw businessError;
    }
  }

  const formNumber=generateFormNumber();
  const totalAmount=processedItems.reduce((s,i)=> s + Number(i.amount||0),0);
  const status = statusFlag === '提交申请' ? '待财务审核' : '草稿';
  const run = db.transaction(()=>{
  const info = db.prepare(`INSERT INTO reimbursement_forms (user_id, form_number, total_amount, status, created_at) VALUES (?,?,?,?,datetime('now', 'localtime'))`)
      .run(user.userId, formNumber, totalAmount, status);
    const formId = info.lastInsertRowid;
  const stmt = db.prepare("INSERT INTO reimbursements (user_id, amount, purpose, type, remark, invoice_number, status, created_at, form_status, form_id) VALUES (?,?,?,?,?,?,'已归集到报销单',datetime('now', 'localtime'),'已绑定',?)");
  const voucherStmt = db.prepare('INSERT INTO vouchers (reimbursement_form_id, original_name, file_name, file_path, file_size, file_type, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\', \'localtime\'))');
    const recordVoucherStmt = db.prepare('INSERT OR IGNORE INTO reimbursement_record_vouchers (record_id, voucher_id, created_by) VALUES (?,?,?)');
    const recIds=[];
    for(const item of processedItems){
      if(!item.amount || !item.purpose) continue;
      const recInfo = stmt.run(user.userId, item.amount, item.purpose, item.type || '', item.remark || '', item.invoice_number || null, formId);
      const recId = recInfo.lastInsertRowid; recIds.push(recId);
      if (Array.isArray(item.attachments)) {
        for(const att of item.attachments){
          if(att.temp_id){
            const t = db.prepare('SELECT * FROM temp_attachments WHERE id=?').get(att.temp_id);
            if(!t) continue;
            const { rel, abs } = buildVoucherPath(formId, t.file_path);
            const src = path.join(UPLOAD_DIR, t.file_path);
            if (fs.existsSync(src)) {
              console.log(`📁 复制文件: ${src} -> ${abs}`);
              ensureDir(path.dirname(abs));
              try {
                fs.copyFileSync(src, abs);
                console.log(`✅ 文件复制成功: ${path.basename(abs)}`);
                try {
                  fs.unlinkSync(src);
                  console.log(`🗑️  临时文件已删除: ${path.basename(src)}`);
                } catch(e) {
                  console.log(`⚠️  临时文件删除失败: ${e.message}`);
                }
              } catch(copyError) {
                console.error(`❌ 文件复制失败: ${copyError.message}`);
                console.error(`   源文件: ${src}`);
                console.error(`   目标文件: ${abs}`);
                console.error(`   错误代码: ${copyError.code}`);
              }
            } else {
              console.log(`❌ 源文件不存在: ${src}`);
            }
            const vInfo = voucherStmt.run(formId, att.name || path.basename(t.file_path), path.basename(rel), rel, t.file_size, t.file_type, user.userId);
            recordVoucherStmt.run(recId, vInfo.lastInsertRowid, user.userId);
            db.prepare('DELETE FROM temp_attachments WHERE id=?').run(t.id);
          }
        }
      }
    }
    logAction({ userId: user.userId, action: 'form_create_auto', detail: `form=${formNumber};records=${recIds.join(',')}` });
    return { formId, formNumber, totalAmount, reimbursementIds: recIds };
  });
  return run();
}

function getFormDetail(formId, user){
  const form = db.prepare(`
    SELECT rf.*, u.username, u.real_name
    FROM reimbursement_forms rf
    LEFT JOIN users u ON rf.user_id = u.id
    WHERE rf.id = ?
  `).get(formId);
  if(!form) return null;
  if(user.role==='employee' && form.user_id !== user.userId) throw new Error('FORBIDDEN');
  const records = db.prepare('SELECT * FROM reimbursements WHERE form_id=? ORDER BY created_at ASC').all(formId);
  // 运行期再次兜底，避免进程启动顺序导致列缺失（模块加载时表可能尚未创建）
  try { ensureLoanLinkSchema(); } catch(_) {}
  // 使用保存于链接时的原始剩余；若旧数据缺失则用安全回退：不超过借款总额
  const loanLinks = db.prepare(`
    SELECT 
      rl.id as link_id,
      rl.offset_amount,
      rl.created_at as linked_at,
      l.id as loan_id,
      l.amount as loan_amount,
      COALESCE(
        rl.original_remaining_amount,
        CASE WHEN (l.remaining_amount + rl.offset_amount) > l.amount THEN l.amount ELSE (l.remaining_amount + rl.offset_amount) END
      ) AS original_remaining_amount,
      l.purpose as loan_purpose,
      l.status as loan_status
    FROM reimbursement_loan_links rl 
    JOIN loans l ON rl.loan_id = l.id 
    WHERE rl.form_id = ? 
    ORDER BY rl.created_at DESC
  `).all(formId);
  return { form, records, loanLinks };
}

function updateForm(formId, user, items, statusFlag){
  const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
  if(!form) throw new Error('NOT_FOUND');
  if(form.user_id !== user.userId) throw new Error('FORBIDDEN');

  // 🔒 检查报销单是否被锁定
  if(form.is_locked) {
    throw new Error('FORM_LOCKED');
  }

  const norm = normalizeFormStatus(form.status);
  if(!['draft','rejected','finance_rejected','manager_rejected'].includes(norm)) throw new Error('INVALID_STATE');

  // 处理发票号，只保留后8位数字
  const processedItems = items.map(item => ({
    ...item,
    invoice_number: item.invoice_number ? processInvoiceNumber(item.invoice_number) : null
  }));

  // 验证发票号查重（排除当前报销单，使用处理后的发票号）
  const invoiceNumbers = processedItems
    .map(item => item.invoice_number)
    .filter(num => num && num.trim() !== '');

  if (invoiceNumbers.length > 0) {
    const duplicateCheck = batchCheckInvoiceNumbers(invoiceNumbers, formId);
    if (duplicateCheck.hasConflicts) {
      const firstConflict = duplicateCheck.conflicts[0];
      throw new Error(`发票号"${firstConflict.invoiceNumber}"已被使用，报销单号：${firstConflict.formNumber}，状态：${firstConflict.formStatus}`);
    }
  }

  const tx = db.transaction(()=>{
    const existing = db.prepare('SELECT id FROM reimbursements WHERE form_id=?').all(formId).map(r=>r.id);
    const keep=new Set();
  const insertStmt = db.prepare("INSERT INTO reimbursements (user_id, amount, purpose, type, remark, invoice_number, status, created_at, form_status, form_id) VALUES (?,?,?,?,?,?,'已归集到报销单',CURRENT_TIMESTAMP,'已绑定',?)");
    const updateStmt = db.prepare('UPDATE reimbursements SET amount=?, purpose=?, type=?, remark=?, invoice_number=? WHERE id=? AND form_id=?');
  const voucherStmt = db.prepare('INSERT INTO vouchers (reimbursement_form_id, original_name, file_name, file_path, file_size, file_type, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)');
    const recordVoucherStmt = db.prepare('INSERT OR IGNORE INTO reimbursement_record_vouchers (record_id, voucher_id, created_by) VALUES (?,?,?)');
    for(const it of processedItems){
      const amount = Number(it.amount);
      if(!(amount>0) || !it.purpose || !it.type) throw new Error('INVALID_ITEM');
      if(it.id){
        updateStmt.run(amount, it.purpose, it.type, it.remark || '', it.invoice_number || null, it.id, formId);
        keep.add(Number(it.id));

        // 处理现有记录的新增凭证
        if(Array.isArray(it.attachments)){
          for(const att of it.attachments){
            if(att.temp_id){
              const t = db.prepare('SELECT * FROM temp_attachments WHERE id=?').get(att.temp_id);
              if(!t) continue;
              const { rel, abs } = buildVoucherPath(formId, t.file_path);
              const src = path.join(UPLOAD_DIR, t.file_path);
              if(fs.existsSync(src)){
                ensureDir(path.dirname(abs));
                fs.copyFileSync(src, abs);
                console.log('📁 复制文件:', src, '->', abs);
                console.log('✅ 文件复制成功:', path.basename(abs));
                try { fs.unlinkSync(src); console.log('🗑️  临时文件已删除:', path.basename(src)); } catch(_){}
              }
              const vInfo = voucherStmt.run(formId, att.name || path.basename(t.file_path), path.basename(abs), rel, t.file_size, t.file_type, user.userId);
              recordVoucherStmt.run(it.id, vInfo.lastInsertRowid, user.userId);
              db.prepare('DELETE FROM temp_attachments WHERE id=?').run(t.id);
            }
          }
        }
      } else {
        const info = insertStmt.run(user.userId, amount, it.purpose, it.type, it.remark || '', it.invoice_number || null, formId);
        const newId = info.lastInsertRowid;
        if(Array.isArray(it.attachments)){
          for(const att of it.attachments){
            if(att.temp_id){
              const t = db.prepare('SELECT * FROM temp_attachments WHERE id=?').get(att.temp_id);
              if(!t) continue;
              const { rel, abs } = buildVoucherPath(formId, t.file_path); const src = path.join(UPLOAD_DIR, t.file_path);
              if(fs.existsSync(src)){
                console.log(`📁 复制文件: ${src} -> ${abs}`);
                ensureDir(path.dirname(abs));
                try {
                  fs.copyFileSync(src, abs);
                  console.log(`✅ 文件复制成功: ${path.basename(abs)}`);
                  try {
                    fs.unlinkSync(src);
                    console.log(`🗑️  临时文件已删除: ${path.basename(src)}`);
                  } catch(e) {
                    console.log(`⚠️  临时文件删除失败: ${e.message}`);
                  }
                } catch(copyError) {
                  console.error(`❌ 文件复制失败: ${copyError.message}`);
                  console.error(`   源文件: ${src}`);
                  console.error(`   目标文件: ${abs}`);
                  console.error(`   错误代码: ${copyError.code}`);
                }
              } else {
                console.log(`❌ 源文件不存在: ${src}`);
              }
              const vInfo = voucherStmt.run(formId, att.name || path.basename(t.file_path), path.basename(rel), rel, t.file_size, t.file_type, user.userId);
              recordVoucherStmt.run(newId, vInfo.lastInsertRowid, user.userId);
              db.prepare('DELETE FROM temp_attachments WHERE id=?').run(t.id);
            }
          }
        }
      }
    }
    const toDelete = existing.filter(id=>!keep.has(id));
    if(toDelete.length){
      const delLink = db.prepare('DELETE FROM reimbursement_record_vouchers WHERE record_id=?');
      const delRec = db.prepare('DELETE FROM reimbursements WHERE id=?');
      for(const rid of toDelete){ try { delLink.run(rid);} catch(_){} try{delRec.run(rid);}catch(_){} }
    }
    const sumRow = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM reimbursements WHERE form_id=?').get(formId);
    let newStatus=form.status;
    // 兼容前端传递的状态值和旧的statusFlag参数
    if(statusFlag==='提交申请' || statusFlag==='待财务审核') {
      newStatus='待财务审核';
    } else if(statusFlag==='草稿') {
      newStatus='草稿';
    }
    // 如果没有明确的statusFlag，保持原状态不变
    db.prepare('UPDATE reimbursement_forms SET total_amount=?, status=? WHERE id=?').run(sumRow.total, newStatus, formId);
    // 若从已驳回转为再次提交，则重置明细的审批状态为待审核，清理上一轮的审批痕迹
    if (['rejected','finance_rejected','manager_rejected'].includes(norm) && newStatus === '待财务审核') {
      try {
        // 确保列存在
        try { ensureApprovalSchema(); } catch(_) {}
        db.prepare("UPDATE reimbursements SET approval_status = 'pending', approver_id = NULL, approved_at = NULL, reject_reason = NULL WHERE form_id = ?")
          .run(formId);
        // 恢复记录状态到通用值，避免前端从旧字段读取出“已驳回”；同步恢复 form_status
        try {
          db.prepare("UPDATE reimbursements SET status = '已归集到报销单', form_status = '已绑定' WHERE form_id = ?")
            .run(formId);
        } catch(_) {}
        // 同步清零表单上的统计字段，便于列表视图直观
        try {
          db.prepare('UPDATE reimbursement_forms SET approved_record_count = 0, rejected_record_count = 0 WHERE id = ?')
            .run(formId);
        } catch(_) {}
        // 🔧 关键修复：清理审批历史记录，避免总经理审核时看到冲突状态
        try {
          db.prepare('DELETE FROM reimbursement_form_approval_logs WHERE form_id = ?')
            .run(formId);
          console.log(`清理报销单 ${formId} 的审批历史记录，避免重新提交后的状态冲突`);
        } catch(error) {
          console.warn('清理审批历史记录失败:', error);
        }
      } catch(_) {}
    }
    logAction({ userId: user.userId, action: 'form_update', detail: `form=${formId};status=${newStatus};total=${sumRow.total}` });
    return { total_amount: sumRow.total, status: newStatus };
  });
  return tx();
}

function submitForm(formId, user){
  const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
  if(!form) throw new Error('NOT_FOUND');
  if(form.user_id !== user.userId) throw new Error('FORBIDDEN');

  // 🔒 检查报销单是否被锁定
  if(form.is_locked) {
    throw new Error('FORM_LOCKED');
  }

  const norm = normalizeFormStatus(form.status);
  if(!['draft','rejected','finance_rejected','manager_rejected'].includes(norm)){
    // Idempotent: if already submitted or further approved, return success w/o changes
    if(['submitted','finance_approved','manager_approved'].includes(norm)){
      return { formId, status: form.status };
    }
    throw new Error('INVALID_STATE');
  }
  db.prepare('UPDATE reimbursement_forms SET status=? WHERE id=?').run('待财务审核', formId);
  // 若是从已驳回状态重新提交，重置所有明细的审批状态为待审核，清除上一轮审批字段
  if (['rejected','finance_rejected','manager_rejected'].includes(norm)) {
    try {
      try { ensureApprovalSchema(); } catch(_) {}
      db.prepare("UPDATE reimbursements SET approval_status = 'pending', approver_id = NULL, approved_at = NULL, reject_reason = NULL WHERE form_id = ?")
        .run(formId);
      // 恢复记录状态到通用值，避免前端从旧字段读取出“已驳回”；同步恢复 form_status
      try {
        db.prepare("UPDATE reimbursements SET status = '已归集到报销单', form_status = '已绑定' WHERE form_id = ?")
          .run(formId);
      } catch(_) {}
      // 同步清零表单上的统计字段，便于列表视图直观
      try {
        db.prepare('UPDATE reimbursement_forms SET approved_record_count = 0, rejected_record_count = 0 WHERE id = ?')
          .run(formId);
      } catch(_) {}
      // 🔧 关键修复：清理审批历史记录，避免总经理审核时看到冲突状态
      try {
        db.prepare('DELETE FROM reimbursement_form_approval_logs WHERE form_id = ?')
          .run(formId);
        console.log(`清理报销单 ${formId} 的审批历史记录，避免重新提交后的状态冲突`);
      } catch(error) {
        console.warn('清理审批历史记录失败:', error);
      }
    } catch(_) {}
  }
  logAction({ userId: user.userId, action:'form_submit', detail:`form=${formId}` });
  if (['rejected','finance_rejected','manager_rejected'].includes(norm)) {
    try { logAction({ userId: user.userId, action:'form_resubmit_reset_records', detail:`form=${formId}` }); } catch(_){}
  }
  return { formId, status:'待财务审核' };
}

function withdrawForm(formId, user){
  const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
  if(!form) throw new Error('NOT_FOUND');
  if(form.user_id !== user.userId) throw new Error('FORBIDDEN');
  const norm = normalizeFormStatus(form.status);
  if(norm !== 'submitted') throw new Error('INVALID_STATE');
  // 回退为草稿
  db.prepare("UPDATE reimbursement_forms SET status='草稿' WHERE id=?").run(formId);
  // 清理本轮审批痕迹：重置所有明细审批状态，恢复记录通用状态，清零统计
  try {
    try { ensureApprovalSchema(); } catch(_) {}
    db.prepare("UPDATE reimbursements SET approval_status = 'pending', approver_id = NULL, approved_at = NULL, reject_reason = NULL WHERE form_id = ?")
      .run(formId);
    try {
      db.prepare("UPDATE reimbursements SET status = '已归集到报销单', form_status = '已绑定' WHERE form_id = ?")
        .run(formId);
    } catch(_) {}
    try {
      db.prepare('UPDATE reimbursement_forms SET approved_record_count = 0, rejected_record_count = 0 WHERE id = ?')
        .run(formId);
    } catch(_) {}
  } catch(_) {}
  logAction({ userId: user.userId, action:'form_withdraw', detail:`form=${formId}` });
  return { formId, status: '草稿' };
}

function deleteForm(formId, user){
  const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
  if(!form) throw new Error('NOT_FOUND');
  if(user.role!=='admin' && form.user_id !== user.userId) throw new Error('FORBIDDEN');

  // 所有用户（包括管理员）都不能删除已打款的报销单，确保财务安全
  const norm = normalizeFormStatus(form.status);
  if(!['draft','rejected'].includes(norm)) throw new Error('INVALID_STATE');

  const tx = db.transaction(()=>{
    // 删除相关的审批历史记录
    try {
      db.prepare('DELETE FROM reimbursement_form_approval_logs WHERE form_id=?').run(formId);
    } catch (e) {
      console.warn('删除审批历史记录失败:', e.message);
    }

    // 删除拆分记录
    try {
      db.prepare('DELETE FROM reimbursement_form_splits WHERE original_form_id=? OR new_form_id=?').run(formId, formId);
    } catch (e) {
      console.warn('删除拆分记录失败:', e.message);
    }

    // 删除报销单关联记录
    try {
      db.prepare('DELETE FROM reimbursement_form_relations WHERE rejected_form_id=? OR new_form_id=?').run(formId, formId);
    } catch (e) {
      console.warn('删除报销单关联记录失败:', e.message);
    }

    // 删除凭证复用记录
    try {
      db.prepare('DELETE FROM voucher_reuse_records WHERE original_form_id=? OR new_form_id=?').run(formId, formId);
    } catch (e) {
      console.warn('删除凭证复用记录失败:', e.message);
    }

    // 删除主要记录
    db.prepare('DELETE FROM reimbursement_forms WHERE id=?').run(formId);
    db.prepare('DELETE FROM reimbursements WHERE form_id=?').run(formId);
    db.prepare('DELETE FROM reimbursement_loan_links WHERE form_id=?').run(formId);
  });
  tx();
  logAction({ userId: user.userId, action:'form_delete', detail:`form=${formId};status=${form.status}` });
  return { success:true };
}

function linkLoans(formId, loanLinks, actor){
  const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
  if(!form) throw new Error('NOT_FOUND');
  if(!['finance','admin'].includes(actor.role)) throw new Error('FORBIDDEN');
  const norm = normalizeFormStatus(form.status);
  if(!['submitted','finance_approved','manager_approved'].includes(norm) || norm==='paid') throw new Error('INVALID_STATE');
  const run = db.transaction(()=>{
    db.prepare('DELETE FROM reimbursement_loan_links WHERE form_id=?').run(formId);
    try { ensureLoanLinkSchema(); } catch(_) {}
    const insert = db.prepare('INSERT INTO reimbursement_loan_links (form_id, loan_id, offset_amount, created_by, original_remaining_amount) VALUES (?,?,?,?,?)');
    let total=0;
    for(const l of loanLinks){
      const loan = db.prepare('SELECT id,user_id,remaining_amount,status FROM loans WHERE id=?').get(l.loan_id);
      if(!loan) throw new Error('LOAN_NOT_FOUND');
      if(loan.user_id !== form.user_id) throw new Error('USER_MISMATCH');
      const ok = new Set(['paid','已打款','partial_repaid','部分已还']);
      if(!ok.has(String(loan.status))) throw new Error('LOAN_INVALID_STATUS');
      const reqAmt = round2(l.offset_amount);
      if(!(reqAmt>0)) throw new Error('OFFSET_INVALID');
      if(reqAmt > loan.remaining_amount) throw new Error('LOAN_INSUFFICIENT');
      insert.run(formId, l.loan_id, reqAmt, actor.userId, loan.remaining_amount);
      total += reqAmt;
    }
    db.prepare('UPDATE reimbursement_forms SET loan_offset_amount=?, net_payment_amount = MAX(0, total_amount - ?) WHERE id=?').run(total, total, formId);
    logAction({ userId: actor.userId, action:'form_link_loans', detail:`form=${formId};offset=${total}` });
    return { total_offset_amount: total };
  });
  return run();
}

function confirmPayment(formId, payload, actor){
  if(actor.role!=='finance') throw new Error('FORBIDDEN');
  const { payment_note='', loan_links=[] } = payload || {};
  const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
  if(!form) throw new Error('NOT_FOUND');
  if(normalizeFormStatus(form.status) !== 'manager_approved') throw new Error('INVALID_STATE');
  const tx = db.transaction(()=>{
    // 若本次请求携带 loan_links，则先刷新关联（不变更贷款余额），以该表单当前关联为准
    if(Array.isArray(loan_links) && loan_links.length){
      // 复用已有校验逻辑
      linkLoans(formId, loan_links, actor);
    }
    // 对该表单已关联的所有借款，按 offset_amount 一次性扣减贷款余额
    const links = db.prepare('SELECT loan_id, offset_amount FROM reimbursement_loan_links WHERE form_id=?').all(formId);
    let totalOffset = 0;
    for(const lnk of links){
      const loan = db.prepare('SELECT id, remaining_amount, amount, status FROM loans WHERE id=?').get(lnk.loan_id);
      if(!loan) throw new Error('LOAN_NOT_FOUND');
      let dec = round2(Number(lnk.offset_amount)||0);
      if(!(dec>0)) continue;
      // 上限保护：不超过当前剩余
      if(dec > loan.remaining_amount) dec = round2(loan.remaining_amount);
      if(dec>0){
        db.prepare('UPDATE loans SET remaining_amount = MAX(0, remaining_amount - ?) WHERE id=?').run(dec, loan.id);
        const upd = db.prepare('SELECT remaining_amount, amount FROM loans WHERE id=?').get(loan.id);
        if((upd.remaining_amount||0) <= 0.009) db.prepare("UPDATE loans SET status='repaid' WHERE id=?").run(loan.id);
        else if (upd.remaining_amount < upd.amount) db.prepare("UPDATE loans SET status='partial_repaid' WHERE id=?").run(loan.id);
        totalOffset += dec;
      }
    }
    // 以表单现有关联的合计作为 loan_offset_amount，净打款不为负
    const sumRow = db.prepare('SELECT COALESCE(SUM(offset_amount),0) as s FROM reimbursement_loan_links WHERE form_id=?').get(formId);
    const assocSum = round2(sumRow.s || 0);
    db.prepare('UPDATE reimbursement_forms SET loan_offset_amount=?, net_payment_amount = MAX(0, total_amount - ?), status=?, payment_note=?, paid_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(assocSum, assocSum, '已打款', payment_note, formId);
    db.prepare("UPDATE reimbursements SET status = '已打款' WHERE form_id=?").run(formId);
  });
  try {
    tx();
  } catch(e) {
    try { console.error('[confirmPayment.tx] error:', e && e.message ? e.message : e, '\nstack:', e && e.stack); } catch(_){ }
    throw e;
  }
  logAction({ userId: actor.userId, action:'form_confirm_payment', detail:`form=${formId}` });
  return { success:true };
}

/**
 * 基于被驳回的报销单创建新的报销单
 * @param {number} rejectedFormId - 被驳回的报销单ID
 * @param {object} user - 用户信息
 * @param {array} items - 新的报销明细（可选，如果不提供则复制原明细）
 * @param {string} statusFlag - 状态标志
 * @returns {object} 新报销单信息
 */
async function createFormFromRejected(rejectedFormId, user, items = null, statusFlag = '草稿') {
  const rejectedForm = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(rejectedFormId);
  if (!rejectedForm) throw new Error('REJECTED_FORM_NOT_FOUND');

  // 权限检查：只有报销单的创建者可以基于其创建新单
  if (parseInt(rejectedForm.user_id) !== parseInt(user.userId)) throw new Error('FORBIDDEN');

  // 检查是否为被驳回的报销单
  const norm = normalizeFormStatus(rejectedForm.status);
  if (!['finance_rejected', 'manager_rejected'].includes(norm)) {
    throw new Error('FORM_NOT_REJECTED');
  }

  // 检查是否允许基于此单创建新单
  if (rejectedForm.can_create_new_from_rejected === false) {
    throw new Error('CANNOT_CREATE_FROM_REJECTED');
  }

  // 如果没有提供新明细，则复制原明细（包括所有发票字段和附件）
  let newItems = items;
  if (!newItems) {
    const originalRecords = db.prepare('SELECT * FROM reimbursements WHERE form_id=?').all(rejectedFormId);

    newItems = await Promise.all(originalRecords.map(async (record) => {
      // 获取该记录关联的凭证
      const vouchers = db.prepare(`
        SELECT v.* FROM vouchers v
        JOIN reimbursement_record_vouchers rrv ON v.id = rrv.voucher_id
        WHERE rrv.record_id = ?
      `).all(record.id);

      // 复制凭证文件到临时目录，以便后续处理
      const attachments = [];
      for (const voucher of vouchers) {
        try {
          const originalPath = path.join(UPLOAD_DIR, 'vouchers', voucher.file_path);
          if (fs.existsSync(originalPath)) {
            // 创建临时文件记录
            const tempInfo = db.prepare(`
              INSERT INTO temp_attachments (user_id, file_path, file_type, file_size, uploaded_at)
              VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
            `).run(user.userId, voucher.file_name, voucher.file_type, voucher.file_size);

            // 复制文件到临时目录
            const tempPath = path.join(UPLOAD_DIR, voucher.file_name);
            fs.copyFileSync(originalPath, tempPath);

            attachments.push({
              temp_id: tempInfo.lastInsertRowid,
              name: voucher.original_name,
              size: voucher.file_size,
              type: voucher.file_type
            });
          }
        } catch (error) {
          console.warn(`复制凭证文件失败: ${voucher.original_name}`, error.message);
        }
      }

      return {
        amount: record.amount,
        purpose: record.purpose,
        type: record.type,
        remark: `重新申请：${record.remark || ''}`,
        invoice_number: record.invoice_number,
        // 复制所有发票扩展字段
        invoice_date: record.invoice_date,
        buyer_name: record.buyer_name,
        service_name: record.service_name,
        // 包含附件信息
        attachments: attachments
      };
    }));
  }

  // 创建新报销单（排除被驳回的原报销单，允许复用其发票号）
  const newFormResult = createFormAutoGenerate(user, newItems, statusFlag, rejectedFormId);

  // 记录关联关系
  try {
    db.prepare(`
      INSERT INTO reimbursement_form_relations
      (rejected_form_id, new_form_id, relation_type, created_by, created_at)
      VALUES (?, ?, 'created_from_rejected', ?, datetime('now', 'localtime'))
    `).run(rejectedFormId, newFormResult.formId, user.userId);

    logAction({
      userId: user.userId,
      action: 'form_create_from_rejected',
      detail: `rejected_form=${rejectedFormId};new_form=${newFormResult.formId}`
    });
  } catch (e) {
    console.warn('记录报销单关联关系失败:', e.message);
  }

  return {
    ...newFormResult,
    source_form_id: rejectedFormId,
    source_form_number: rejectedForm.form_number
  };
}

/**
 * 锁定报销单（当被驳回时自动调用）
 * @param {number} formId - 报销单ID
 * @param {string} reason - 锁定原因
 */
function lockForm(formId, reason = '报销单已被驳回，不可修改') {
  try {
    db.prepare(`
      UPDATE reimbursement_forms
      SET
        is_locked = TRUE,
        lock_reason = ?,
        locked_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(reason, formId);

    console.log(`报销单 ${formId} 已锁定: ${reason}`);
  } catch (e) {
    console.error(`锁定报销单 ${formId} 失败:`, e.message);
  }
}

module.exports = {
  createFormAutoGenerate,
  getFormDetail,
  updateForm,
  submitForm,
  withdrawForm,
  deleteForm,
  linkLoans,
  confirmPayment,
  createFormFromRejected,
  lockForm
};

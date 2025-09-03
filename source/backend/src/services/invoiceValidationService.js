const db = require('../db');
const { REIMBURSEMENT_FORM_STATUS } = require('../constants/status');

/**
 * 发票号查重验证服务
 * 业务规则：
 * 1. 同一发票号不能重复使用（除非处于特定状态）
 * 2. 处于"草稿"或"已驳回"状态的报销单中的发票号可以被重新使用
 * 3. 其他状态（待审核、已审核、已打款等）的发票号不能重复
 */

/**
 * 检查发票号是否可用
 * @param {string} invoiceNumber - 发票号
 * @param {number} excludeFormId - 排除的报销单ID（用于编辑时排除自己）
 * @param {number} excludeRecordId - 排除的报销记录ID（用于编辑时排除自己）
 * @returns {Object} { isAvailable: boolean, conflictInfo?: Object }
 */
function checkInvoiceNumberAvailability(invoiceNumber, excludeFormId = null, excludeRecordId = null) {
  if (!invoiceNumber || typeof invoiceNumber !== 'string' || invoiceNumber.trim() === '') {
    return { isAvailable: true }; // 空发票号不需要验证
  }

  const trimmedInvoiceNumber = invoiceNumber.trim();

  // 查询所有使用该发票号的报销记录及其报销单状态
  let sql = `
    SELECT 
      r.id as record_id,
      r.invoice_number,
      r.user_id,
      r.form_id,
      r.amount,
      r.purpose,
      r.created_at as record_created_at,
      f.form_number,
      f.status as form_status,
      f.created_at as form_created_at,
      u.username,
      u.real_name
    FROM reimbursements r
    LEFT JOIN reimbursement_forms f ON r.form_id = f.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE UPPER(TRIM(r.invoice_number)) = UPPER(?)
  `;
  
  const params = [trimmedInvoiceNumber];

  // 排除指定的报销单或记录
  if (excludeFormId) {
    sql += ' AND (r.form_id IS NULL OR r.form_id != ?)';
    params.push(excludeFormId);
  }
  
  if (excludeRecordId) {
    sql += ' AND r.id != ?';
    params.push(excludeRecordId);
  }

  sql += ' ORDER BY f.created_at DESC, r.created_at DESC';

  const conflicts = db.prepare(sql).all(...params);

  if (conflicts.length === 0) {
    return { isAvailable: true };
  }

  // 检查冲突记录的状态
  const blockedConflicts = conflicts.filter(conflict => {
    const formStatus = conflict.form_status;

    // 允许的状态：草稿、已驳回（这些状态的发票号可以被重新使用）
    const allowedStatuses = ['草稿', 'draft', '已驳回', 'rejected', '财务已驳回', 'finance_rejected', '总经理已驳回', 'manager_rejected'];

    return !allowedStatuses.includes(formStatus);
  });

  if (blockedConflicts.length === 0) {
    return { isAvailable: true };
  }

  // 返回冲突信息
  const firstConflict = blockedConflicts[0];
  return {
    isAvailable: false,
    conflictInfo: {
      recordId: firstConflict.record_id,
      formId: firstConflict.form_id,
      formNumber: firstConflict.form_number,
      formStatus: firstConflict.form_status,
      userName: firstConflict.real_name || firstConflict.username,
      amount: firstConflict.amount,
      purpose: firstConflict.purpose,
      createdAt: firstConflict.form_created_at || firstConflict.record_created_at,
      allConflicts: blockedConflicts.map(c => ({
        recordId: c.record_id,
        formId: c.form_id,
        formNumber: c.form_number,
        formStatus: c.form_status,
        userName: c.real_name || c.username,
        amount: c.amount,
        purpose: c.purpose,
        createdAt: c.form_created_at || c.record_created_at
      }))
    }
  };
}

/**
 * 批量检查发票号
 * @param {Array} invoiceNumbers - 发票号数组
 * @param {number} excludeFormId - 排除的报销单ID
 * @returns {Object} { conflicts: Object[], hasConflicts: boolean }
 */
function batchCheckInvoiceNumbers(invoiceNumbers, excludeFormId = null) {
  const conflicts = [];

  for (const invoiceNumber of invoiceNumbers) {
    if (!invoiceNumber || invoiceNumber.trim() === '') continue;

    const result = checkInvoiceNumberAvailability(invoiceNumber, excludeFormId);
    if (!result.isAvailable) {
      conflicts.push({
        invoiceNumber: invoiceNumber,
        ...result.conflictInfo
      });
    }
  }

  return {
    conflicts,
    hasConflicts: conflicts.length > 0
  };
}

/**
 * 获取用户的发票号使用历史（用于前端提示）
 * @param {number} userId - 用户ID
 * @param {number} limit - 限制返回数量，默认10
 * @returns {Array} 发票号历史记录
 */
function getUserInvoiceHistory(userId, limit = 10) {
  const sql = `
    SELECT DISTINCT 
      r.invoice_number,
      MAX(r.created_at) as last_used_at,
      COUNT(*) as usage_count
    FROM reimbursements r
    WHERE r.user_id = ? 
      AND r.invoice_number IS NOT NULL 
      AND TRIM(r.invoice_number) != ''
    GROUP BY UPPER(TRIM(r.invoice_number))
    ORDER BY last_used_at DESC
    LIMIT ?
  `;
  
  return db.prepare(sql).all(userId, limit);
}

module.exports = {
  checkInvoiceNumberAvailability,
  batchCheckInvoiceNumbers,
  getUserInvoiceHistory
};

// 系统状态常量定义
// 此文件由状态重构脚本自动生成，请勿手动修改

// 借款状态 - 重构为更明确的状态
export const LOAN_STATUS = {
  DRAFT: '草稿',
  PENDING_FINANCE: '待财务审核',
  FINANCE_APPROVED: '财务已通过',
  FINANCE_REJECTED: '财务已驳回',
  MANAGER_APPROVED: '总经理已通过',
  MANAGER_REJECTED: '总经理已驳回',
  PAID: '已打款',
  PARTIAL_REPAID: '部分已还',
  FULLY_REPAID: '已还清'
};

// 报销单状态 - 重构为更明确的状态
export const REIMBURSEMENT_FORM_STATUS = {
  DRAFT: '草稿',
  PENDING_FINANCE: '待财务审核',
  FINANCE_APPROVED: '财务已通过',
  FINANCE_REJECTED: '财务已驳回',
  MANAGER_APPROVED: '总经理已通过',
  MANAGER_REJECTED: '总经理已驳回',
  PAID: '已打款'
};

// 报销记录状态 - 重构为更明确的状态
export const REIMBURSEMENT_RECORD_STATUS = {
  DRAFT: '草稿',
  PENDING: '待财务审核',
  FINANCE_APPROVED: '财务已通过',
  FINANCE_REJECTED: '财务已驳回',
  MANAGER_APPROVED: '总经理已通过',
  MANAGER_REJECTED: '总经理已驳回',
  PAID: '已打款'
};

// 状态组合查询
export const STATUS_GROUPS = {
  // 可冲抵借款状态
  AVAILABLE_LOANS: [LOAN_STATUS.PAID, LOAN_STATUS.PARTIAL_REPAID],

  // 已审核通过的报销单状态
  APPROVED_REIMBURSEMENTS: [
    REIMBURSEMENT_FORM_STATUS.FINANCE_APPROVED,
    REIMBURSEMENT_FORM_STATUS.MANAGER_APPROVED
  ],

  // 待审核状态
  PENDING_APPROVALS: [
    REIMBURSEMENT_FORM_STATUS.PENDING_FINANCE,
    REIMBURSEMENT_FORM_STATUS.FINANCE_APPROVED
  ],

  // 被驳回的状态
  REJECTED_STATUSES: [
    REIMBURSEMENT_FORM_STATUS.FINANCE_REJECTED,
    REIMBURSEMENT_FORM_STATUS.MANAGER_REJECTED
  ]
};

// Node.js 兼容导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LOAN_STATUS,
    REIMBURSEMENT_FORM_STATUS, 
    REIMBURSEMENT_RECORD_STATUS,
    STATUS_GROUPS
  };
}

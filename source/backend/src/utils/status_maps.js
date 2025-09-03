// 统一的状态与角色映射，便于前后端共享

// 报销单整体状态（表单）规范化与中/英映射 - 重构状态
const FORM_STATUS_EN = [
  'draft',
  'submitted',
  'finance_approved',
  'finance_rejected',
  'manager_approved',
  'manager_rejected',
  'paid'
];

const FORM_STATUS_ZH_MAP = new Map([
  ['draft', '草稿'],
  ['submitted', '待财务审核'],
  ['finance_approved', '财务已通过'],
  ['finance_rejected', '财务已驳回'],
  ['manager_approved', '总经理已通过'],
  ['manager_rejected', '总经理已驳回'],
  ['paid', '已打款']
]);

function normalizeFormStatus(s) {
  if (!s) return '';
  const map = new Map([
    ['草稿', 'draft'],
    ['draft', 'draft'],
    ['submitted', 'submitted'],
    ['待财务审核', 'submitted'],
    ['财务已审核', 'finance_approved'], // 兼容旧状态
    ['财务已通过', 'finance_approved'],
    ['finance_approved', 'finance_approved'],
    ['财务已驳回', 'finance_rejected'],
    ['finance_rejected', 'finance_rejected'],
    ['总经理已审批', 'manager_approved'], // 兼容旧状态
    ['总经理已通过', 'manager_approved'],
    ['manager_approved', 'manager_approved'],
    ['总经理已驳回', 'manager_rejected'],
    ['manager_rejected', 'manager_rejected'],
    ['approved', 'manager_approved'], // 兼容旧状态
    ['已打款', 'paid'],
    ['paid', 'paid'],
    ['已驳回', 'rejected'], // 兼容旧状态，映射到财务驳回
    ['rejected', 'finance_rejected']
  ]);
  return map.get(String(s)) || String(s);
}

function formStatusToZh(s) {
  const norm = normalizeFormStatus(s);
  return FORM_STATUS_ZH_MAP.get(norm) || String(s);
}

// 报销“单条记录”的审批状态
const RECORD_APPROVAL_STATUS_EN = ['pending', 'finance_approved', 'finance_rejected', 'manager_approved', 'manager_rejected', 'paid'];
const RECORD_APPROVAL_STATUS_ZH_MAP = new Map([
  ['pending', '待财务审核'], // pending 明确为待财务审核
  ['finance_approved', '财务已通过'],
  ['finance_rejected', '财务已驳回'],
  ['manager_approved', '总经理已通过'],
  ['manager_rejected', '总经理已驳回'],
  ['paid', '已打款']
]);

function normalizeApprovalStatus(s) {
  if (!s) return 'pending';
  const m = new Map([
    ['pending', 'pending'],
    ['待财务审核', 'pending'],
    ['财务已审核', 'finance_approved'], // 兼容旧状态
    ['财务已通过', 'finance_approved'],
    ['finance_approved', 'finance_approved'],
    ['财务已驳回', 'finance_rejected'],
    ['finance_rejected', 'finance_rejected'],
    ['总经理已审批', 'manager_approved'], // 兼容旧状态
    ['总经理已通过', 'manager_approved'],
    ['manager_approved', 'manager_approved'],
    ['总经理已驳回', 'manager_rejected'],
    ['manager_rejected', 'manager_rejected'],
    ['已驳回', 'finance_rejected'], // 兼容旧状态，默认映射到财务驳回
    ['rejected', 'finance_rejected'],
    ['已打款', 'paid'],
    ['paid', 'paid']
  ]);
  return m.get(String(s)) || 'pending';
}

function approvalStatusToZh(s) {
  const norm = normalizeApprovalStatus(s);
  return RECORD_APPROVAL_STATUS_ZH_MAP.get(norm) || String(s);
}

// 贷款状态 - 重构状态
const LOAN_STATUS_EN = ['pending', 'finance_approved', 'finance_rejected', 'manager_approved', 'manager_rejected', 'paid', 'partial_repaid', 'repaid'];
const LOAN_STATUS_ZH_MAP = new Map([
  ['pending', '待财务审核'],
  ['finance_approved', '财务已通过'],
  ['finance_rejected', '财务已驳回'],
  ['manager_approved', '总经理已通过'],
  ['manager_rejected', '总经理已驳回'],
  ['paid', '已打款'],
  ['partial_repaid', '部分已还'],
  ['repaid', '已还清']
]);

function normalizeLoanStatus(s) {
  if (!s) return '';
  const map = new Map([
    ['pending', 'pending'],
    ['已提交', 'pending'],
    ['finance_approved', 'finance_approved'],
    ['财务已审核', 'finance_approved'], // 兼容旧状态
    ['财务已通过', 'finance_approved'],
    ['财务已驳回', 'finance_rejected'],
    ['finance_rejected', 'finance_rejected'],
    ['manager_approved', 'manager_approved'],
    ['总经理已审批', 'manager_approved'], // 兼容旧状态
    ['总经理已通过', 'manager_approved'],
    ['总经理已驳回', 'manager_rejected'],
    ['manager_rejected', 'manager_rejected'],
    ['paid', 'paid'],
    ['已打款', 'paid'],
    ['partial_repaid', 'partial_repaid'],
    ['部分已还', 'partial_repaid'],
    ['repaid', 'repaid'],
    ['已还清', 'repaid'],
    ['rejected', 'finance_rejected'], // 兼容旧状态，默认映射到财务驳回
    ['已驳回', 'finance_rejected']
  ]);
  return map.get(String(s)) || String(s);
}

function loanStatusToZh(s) {
  const norm = normalizeLoanStatus(s);
  return LOAN_STATUS_ZH_MAP.get(norm) || String(s);
}

// 角色列表
const ROLES = ['employee', 'finance', 'manager', 'admin'];

module.exports = {
  // 常量
  FORM_STATUS_EN,
  RECORD_APPROVAL_STATUS_EN,
  LOAN_STATUS_EN,
  ROLES,
  // 映射函数
  normalizeFormStatus,
  formStatusToZh,
  normalizeApprovalStatus,
  approvalStatusToZh,
  normalizeLoanStatus,
  loanStatusToZh
};

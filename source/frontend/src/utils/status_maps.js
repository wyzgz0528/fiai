// 前端状态映射工具函数

// 报销单整体状态规范化
export function normalizeFormStatus(s) {
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

// 状态转中文
export function formStatusToZh(s) {
  const FORM_STATUS_ZH_MAP = new Map([
    ['draft', '草稿'],
    ['submitted', '待财务审核'],
    ['finance_approved', '财务已通过'],
    ['finance_rejected', '财务已驳回'],
    ['manager_approved', '总经理已通过'],
    ['manager_rejected', '总经理已驳回'],
    ['paid', '已打款']
  ]);
  
  const norm = normalizeFormStatus(s);
  return FORM_STATUS_ZH_MAP.get(norm) || String(s);
}

// 记录审批状态规范化
export function normalizeApprovalStatus(s) {
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

// 审批状态转中文
export function approvalStatusToZh(s) {
  const RECORD_APPROVAL_STATUS_ZH_MAP = new Map([
    ['pending', '待财务审核'],
    ['finance_approved', '财务已通过'],
    ['finance_rejected', '财务已驳回'],
    ['manager_approved', '总经理已通过'],
    ['manager_rejected', '总经理已驳回'],
    ['paid', '已打款']
  ]);
  
  const norm = normalizeApprovalStatus(s);
  return RECORD_APPROVAL_STATUS_ZH_MAP.get(norm) || String(s);
}

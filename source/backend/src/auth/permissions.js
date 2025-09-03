// Centralized role -> permissions mapping (phase2 extended)
// Naming convention: domain.action.scope
// forms.*  报销单相关; loans.* 借款相关; audit.* 审计; system.* 系统级
const PERMISSIONS = {
  admin: [
    // forms
  'forms.read.all','forms.update.all','forms.delete.any','forms.approve.finance','forms.approve.manager','forms.export.pdf','forms.pay.finance','forms.loans.link',
    'forms.types.manage', // 报销类型管理
    // loans
    'loans.read.all','loans.update.all','loans.approve.finance','loans.approve.manager','loans.pay.finance','loans.delete.any','loans.repay.any',
    // users & system
    'users.read.all','users.manage','system.stats.read','system.backup','system.restore',
    // audit
    'audit.read.all'
  ],
  finance: [
  'forms.read.department','forms.approve.finance','forms.export.pdf','forms.pay.finance','forms.loans.link',
    'loans.read.all','loans.update.all','loans.approve.finance','loans.pay.finance','loans.repay.any','system.stats.read'
  ],
  manager: [
    'forms.read.department','forms.approve.manager','forms.export.pdf',
    'loans.read.all','loans.update.all','loans.approve.manager','system.stats.read'
  ],
  employee: [
    'forms.read.own','forms.create','forms.update.own','forms.export.pdf'
    // loan 创建目前限制为财务/经理，如需员工申请借款可未来新增 'loans.create.own'
  ]
};
function hasPermission(role, perm){
  const list = PERMISSIONS[role] || []; return list.includes(perm);
}
module.exports = { PERMISSIONS, hasPermission };

// 测试环境设置
process.env.NODE_ENV = 'test';

// 模拟日志函数
global.logAction = () => {};

// 模拟normalizeFormStatus函数
global.normalizeFormStatus = (status) => {
  const statusMap = {
    '草稿': 'draft',
    '已驳回': 'rejected',
    '待财务审核': 'submitted',
    '财务已审核': 'finance_approved',
    '经理已审核': 'manager_approved'
  };
  return statusMap[status] || 'unknown';
};

// 模拟ensureApprovalSchema函数
global.ensureApprovalSchema = () => {};

console.log('测试环境初始化完成');

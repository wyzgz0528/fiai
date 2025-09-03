const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');

// 重定向路由 - 将所有核心功能交给专门的路由文件处理

// 报销单列表 - 统一交给 forms.js 处理，避免重复实现
router.get('/reimbursement-forms', verifyToken, (req, res, next) => {
  // 将处理权交给 forms.js 中的规范实现，避免重复与不一致
  return next();
});

// 自动生成报销申请 - 统一交给 forms_detail.js 处理，避免重复实现
router.post('/reimbursement-forms/auto-generate', verifyToken, (req, res, next) => {
  // 将处理权交给 forms_detail.js 中的规范实现，避免重复与不一致
  return next();
});

// 报销单详情 - 统一交给 forms_detail.js 处理，避免重复实现
router.get('/reimbursement-forms/:id', verifyToken, (req, res, next) => {
  // 将处理权交给 forms_detail.js 中的规范实现，避免重复与不一致
  return next();
});

// 借款关联接口 - 统一交给 forms_detail.js 处理，避免重复实现
router.post('/reimbursement-forms/:id/link-loans', verifyToken, (req, res, next) => {
  // 将处理权交给 forms_detail.js 中的规范实现，避免重复与不一致
  return next();
});

// 确认打款接口 - 统一交给 forms_detail.js 处理，避免重复实现
router.post('/reimbursement-forms/:id/confirm-payment', verifyToken, (req, res, next) => {
  // 将处理权交给 forms_detail.js 中的规范实现，避免重复与不一致
  return next();
});

// 删除报销单 - 统一交给 forms_detail.js 处理，避免重复实现
router.delete('/reimbursement-forms/:id', verifyToken, (req, res, next) => {
  // 将处理权交给 forms_detail.js 中的规范实现，避免重复与不一致
  return next();
});

// PDF下载接口 - 统一交给 forms_detail.js 处理，避免重复实现
router.get('/reimbursement-forms/:id/pdf', verifyToken, (req, res, next) => {
  // 将处理权交给 forms_detail.js 中的规范实现，避免重复与不一致
  return next();
});

// 批量下载接口 - 统一交给 forms_detail.js 处理，避免重复实现
router.post('/admin/batch-download', verifyToken, (req, res, next) => {
  // 将处理权交给 forms_detail.js 中的规范实现，避免重复与不一致
  return next();
});

module.exports = router;

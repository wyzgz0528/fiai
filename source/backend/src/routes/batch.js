const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middlewares/auth');
const router = express.Router();


// 创建报销批次
router.post('/reimbursement-batch/create', verifyToken, (req, res) => {
  // ...existing code from server.js...
});

// 查询批次列表
router.get('/reimbursement-batch/list', verifyToken, (req, res) => {
  // ...existing code from server.js...
});

// 查询批次详情
router.get('/reimbursement-batch/:id', verifyToken, (req, res) => {
  // ...existing code from server.js...
});

// 批次支付
router.post('/reimbursement-batch/:id/pay', verifyToken, (req, res) => {
  // ...existing code from server.js...
});

// 批次抵扣记录历史查询
router.get('/reimbursement-batch/:id/offsets', verifyToken, (req, res) => {
  // ...existing code from server.js...
});

// 删除一个未支付批次的抵扣记录
router.delete('/reimbursement-batch/:batchId/offset/:offsetId', verifyToken, (req, res) => {
  // ...existing code from server.js...
});

// 批次审批
router.post('/reimbursement-batch/:id/approve', verifyToken, (req, res) => {
  // ...existing code from server.js...
});

// 批次Excel导出
router.get('/reimbursement-batch/:id/excel', verifyToken, async (req, res) => {
  // ...existing code from server.js...
});

module.exports = router;

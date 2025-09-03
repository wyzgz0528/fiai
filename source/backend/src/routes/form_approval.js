const express = require('express');
const { verifyToken } = require('../middlewares/auth');
const { approveForm, getApprovalHistory, getSplitInfo } = require('../services/approvalService');
const { BizError } = require('../middlewares/errorHandler');
const ERR = require('../constants/errorCodes');

const router = express.Router();

// 兼容端点：财务/经理审批，统一委派到主审批逻辑
router.post('/reimbursement-forms/:id/finance-approve', verifyToken, (req, res, next) => {
  try {
    const formId = parseInt(req.params.id);
    const body = { ...req.body, action: req.body?.action || 'approve' };
    const result = approveForm(formId, req.user, body);
    if (result.reused) {
      return res.json({ success: true, reused: true, code: ERR.IDEMPOTENT_REPLAY, result });
    }
    return res.json({ success: true, result });
  } catch (e) {
    return next(e);
  }
});

router.post('/reimbursement-forms/:id/manager-approve', verifyToken, (req, res, next) => {
  try {
    const formId = parseInt(req.params.id);
    const body = { ...req.body, action: req.body?.action || 'approve' };
    const result = approveForm(formId, req.user, body);
    if (result.reused) {
      return res.json({ success: true, reused: true, code: ERR.IDEMPOTENT_REPLAY, result });
    }
    return res.json({ success: true, result });
  } catch (e) {
    return next(e);
  }
});

// POST 审批
router.post('/reimbursement-forms/:id/approve', verifyToken, (req,res,next)=>{
  try {
    const formId = parseInt(req.params.id);
    const body = req.body || {};
    const result = approveForm(formId, req.user, body);
    if(result.reused){
      return res.json({ success:true, reused:true, code:ERR.IDEMPOTENT_REPLAY, result });
    }
    return res.json({ success:true, result });
  } catch (e) {
    return next(e); // 交由全局 errorHandler & errorMeta
  }
});

// GET 审批历史（?includeAncestors=1 聚合父链）
router.get('/reimbursement-forms/:id/approval-history', verifyToken, (req,res)=>{
  try { const data = getApprovalHistory(parseInt(req.params.id), String(req.query.includeAncestors||'0')==='1'); return res.json(data);} catch(e){ return res.status(500).json({ success:false, message:'获取审批历史失败' }); }
});

// GET 拆分信息
router.get('/reimbursement-forms/:id/split-info', verifyToken, (req,res)=>{ try { return res.json(getSplitInfo(parseInt(req.params.id))); } catch(e){ return res.status(500).json({ success:false, message:'获取拆分信息失败' }); } });

module.exports = router;

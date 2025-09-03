const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');

const {
  FORM_STATUS_EN,
  RECORD_APPROVAL_STATUS_EN,
  LOAN_STATUS_EN,
  ROLES,
  formStatusToZh,
  approvalStatusToZh,
  loanStatusToZh
} = require('../utils/status_maps');

// 统一状态/角色字典
router.get('/dict', verifyToken, (req, res) => {
  res.json({
    roles: ROLES,
    form_status: FORM_STATUS_EN.map(k => ({ en: k, zh: formStatusToZh(k) })),
    record_approval_status: RECORD_APPROVAL_STATUS_EN.map(k => ({ en: k, zh: approvalStatusToZh(k) })),
    loan_status: LOAN_STATUS_EN.map(k => ({ en: k, zh: loanStatusToZh(k) }))
  });
});

module.exports = router;

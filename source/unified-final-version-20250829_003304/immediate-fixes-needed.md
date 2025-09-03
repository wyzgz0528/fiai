# 立即需要的修复

## 1. 路由异步调用修复

**文件**: `backend/src/routes/forms_detail.js`

**问题**: 路由处理器没有正确调用异步版本的createFormFromRejected函数

**修复方案**:
```javascript
// 当前版本（错误）
router.post('/reimbursement-forms/:id/create-from-rejected', verifyToken, (req, res) => {
  // ...
  const result = createFormFromRejected(rejectedFormId, req.user, items, statusFlag);
  // ...
});

// 正确版本
router.post('/reimbursement-forms/:id/create-from-rejected', verifyToken, async (req, res) => {
  // ...
  const result = await createFormFromRejected(rejectedFormId, req.user, items, statusFlag);
  // ...
});
```

## 2. 验证测试

修复后需要验证：
1. 创建基于被驳回报销单的新单
2. 检查发票字段是否正确复制
3. 检查附件是否正确复制
4. 检查前端显示是否正确


# 统一最终版本需求清单

## 版本冲突分析总结

基于详细的版本对比分析，发现以下关键问题：

### 1. 当前状态 ✅ 已修复
- createFormFromRejected函数：✅ 异步函数
- 发票字段复制：✅ 包含完整的5个发票字段
- 附件复制逻辑：✅ 包含完整的附件处理
- INSERT语句：✅ 包含所有发票字段
- 前端发票字段：✅ 包含发票金额字段

### 2. 仍需修复 ❌
- 路由异步调用：❌ 需要修复路由中的async/await调用

## 最终版本应包含的特征

### 后端 (backend/src/services/formService.js)
1. ✅ createFormFromRejected函数为async
2. ✅ 包含完整的发票字段复制逻辑
3. ✅ 包含正确的附件复制逻辑（基于d229abf的路径修复）
4. ✅ createFormAutoGenerate和updateForm包含所有5个发票字段
5. ✅ 正确的参数传递和数据库操作

### 后端路由 (backend/src/routes/forms_detail.js)
1. ❌ 需要修复：路由处理器为async，正确调用await createFormFromRejected

### 前端 (frontend/src/pages/ReimbursementForm.jsx)
1. ✅ 包含发票金额输入字段
2. ✅ 提交时包含所有5个发票字段
3. ✅ 正确的字段处理逻辑

## 修复计划

### 立即需要修复的问题
1. 修复路由异步调用问题

### 验证清单
- [ ] 基于被驳回报销单创建新单功能完整
- [ ] 发票字段完整复制
- [ ] 附件正确复制
- [ ] 前端显示正确
- [ ] 数据库操作正确


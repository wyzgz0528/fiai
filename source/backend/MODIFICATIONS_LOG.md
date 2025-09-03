# 代码修改记录

## 2025-08-27 修复被驳回报销单无法编辑问题

### 问题描述
- 被财务驳回的报销单无法编辑、保存草稿或重新提交
- 前端报错：PUT /api/reimbursement/reimbursement-forms/20 400 (Bad Request)
- 后端错误：Error: INVALID_STATE

### 根本原因
`formService.js` 中的状态验证逻辑只允许 `draft` 和 `rejected` 状态，但：
- `财务已驳回` 被标准化为 `finance_rejected`
- `总经理已驳回` 被标准化为 `manager_rejected`

### 修改文件
- `backend/src/services/formService.js`

### 具体修改
1. **第208行** - updateForm函数状态验证：
   ```javascript
   // 修改前
   if(!['draft','rejected'].includes(norm)) throw new Error('INVALID_STATE');
   
   // 修改后
   if(!['draft','rejected','finance_rejected','manager_rejected'].includes(norm)) throw new Error('INVALID_STATE');
   ```

2. **第356行** - submitForm函数状态验证：
   ```javascript
   // 修改前
   if(!['draft','rejected'].includes(norm)){
   
   // 修改后
   if(!['draft','rejected','finance_rejected','manager_rejected'].includes(norm)){
   ```

3. **第319行** - updateForm重置逻辑：
   ```javascript
   // 修改前
   if (norm === 'rejected' && newStatus === '待财务审核') {
   
   // 修改后
   if (['rejected','finance_rejected','manager_rejected'].includes(norm) && newStatus === '待财务审核') {
   ```

4. **第365行** - submitForm重置逻辑：
   ```javascript
   // 修改前
   if (norm === 'rejected') {
   
   // 修改后
   if (['rejected','finance_rejected','manager_rejected'].includes(norm)) {
   ```

5. **第391行** - 日志记录逻辑：
   ```javascript
   // 修改前
   if (norm === 'rejected') {
   
   // 修改后
   if (['rejected','finance_rejected','manager_rejected'].includes(norm)) {
   ```

### 验证结果
- ✅ 被财务驳回的报销单可以编辑
- ✅ 可以保存草稿
- ✅ 可以重新提交申请
- ✅ 状态正确重置为"待财务审核"

### 修改时间
2025-08-27 23:50

### 修改者
AI Assistant (Augment Agent)

---

## 注意事项
如果此问题再次出现，请检查：
1. 文件是否被意外覆盖
2. PM2服务是否正确重启
3. 磁盘空间是否充足
4. 文件权限是否正确

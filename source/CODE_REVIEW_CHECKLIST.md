# 代码审查检查清单 - 防止功能丢失

## 🔍 审查重点

### 1. 文件变更分析
```bash
# 检查修改统计
git diff --stat HEAD~1

# 重点关注：
# - 删除行数 > 添加行数的文件
# - 核心组件文件的大幅修改
# - 删除超过100行的文件
```

### 2. 功能完整性检查

#### 报销申请表单 (ReimbursementForm.jsx)
- [ ] 预览功能是否完整？
  ```bash
  grep -n "handlePreviewFile\|预览\|preview" frontend/src/pages/ReimbursementForm.jsx
  ```
- [ ] 删除功能是否保留？
  ```bash
  grep -n "handleDelete\|删除" frontend/src/pages/ReimbursementForm.jsx
  ```
- [ ] OCR功能是否正常？
  ```bash
  grep -n "OCR\|handleOCR" frontend/src/pages/ReimbursementForm.jsx
  ```
- [ ] 状态管理是否完整？
  ```bash
  grep -n "useState\|previewVisible\|previewFile" frontend/src/pages/ReimbursementForm.jsx
  ```

#### 关键API端点检查
- [ ] 凭证预览API：`/api/reimbursement/reimbursement-forms/:id/vouchers/:voucherId/preview`
- [ ] 凭证删除API：`/api/reimbursement/reimbursement-forms/:id/vouchers/:voucherId`
- [ ] 临时文件API：`/api/upload/temp-attachments/:id`

### 3. 用户体验功能
- [ ] 拖拽功能是否保留？
- [ ] 加载状态是否正常？
- [ ] 错误提示是否完整？
- [ ] 响应式布局是否正常？

## 🧪 测试验证流程

### 1. 功能回归测试
```bash
# 1. 构建项目
cd frontend && npm run build

# 2. 重启服务
cd ../backend && pm2 restart caiwu-backend

# 3. 运行功能测试
./scripts/test-core-features.sh
```

### 2. 手动测试清单

#### 报销申请流程
1. **创建新申请**
   - [ ] 能否正常创建报销申请？
   - [ ] 发票字段是否正常显示？
   - [ ] 金额计算是否正确？

2. **凭证管理**
   - [ ] 能否上传凭证文件？
   - [ ] **预览功能是否正常？**
   - [ ] OCR识别是否工作？
   - [ ] 删除功能是否正常？

3. **保存和提交**
   - [ ] 草稿保存是否正常？
   - [ ] 提交申请是否成功？
   - [ ] 数据是否完整保存？

4. **编辑和撤回**
   - [ ] 编辑草稿是否正常？
   - [ ] 撤回功能是否正常？
   - [ ] 数据是否完整保留？

### 3. 性能测试
- [ ] 页面加载速度是否正常？
- [ ] 文件上传是否流畅？
- [ ] 预览功能是否快速响应？

## 🚨 危险信号

### 代码层面
- 大量删除行（>100行）
- 移除useState声明
- 删除事件处理函数
- 移除Modal组件
- 删除API调用

### 功能层面
- 按钮点击无响应
- 弹窗无法显示
- 文件无法预览
- 操作无反馈提示

## 📋 审查报告模板

```markdown
## 代码审查报告

**审查者**: [姓名]
**审查时间**: [日期]
**提交ID**: [commit hash]
**修改描述**: [简要描述]

### 文件变更统计
- 修改文件数: X
- 新增行数: +X
- 删除行数: -X

### 功能完整性检查
- [ ] 预览功能: ✅正常 / ❌异常 / ⚠️需要关注
- [ ] 删除功能: ✅正常 / ❌异常 / ⚠️需要关注
- [ ] OCR功能: ✅正常 / ❌异常 / ⚠️需要关注
- [ ] 保存功能: ✅正常 / ❌异常 / ⚠️需要关注

### 测试结果
- [ ] 构建测试: ✅通过 / ❌失败
- [ ] 功能测试: ✅通过 / ❌失败
- [ ] 回归测试: ✅通过 / ❌失败

### 风险评估
- 风险等级: 🟢低 / 🟡中 / 🔴高
- 主要风险: [描述]
- 建议措施: [建议]

### 审查结论
- [ ] ✅ 批准合并
- [ ] ⚠️ 有条件批准（需要修改）
- [ ] ❌ 拒绝合并

**备注**: [其他说明]
```

## 🛠️ 自动化检查脚本

### 功能检查脚本
```bash
#!/bin/bash
# scripts/check-core-features.sh

echo "🔍 检查核心功能..."

ERRORS=0

# 检查预览功能
if ! grep -q "handlePreviewFile\|预览" frontend/src/pages/ReimbursementForm.jsx; then
    echo "❌ 预览功能缺失"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ 预览功能存在"
fi

# 检查删除功能
if ! grep -q "handleDeleteExistingVoucher" frontend/src/pages/ReimbursementForm.jsx; then
    echo "❌ 删除功能缺失"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ 删除功能存在"
fi

# 检查OCR功能
if ! grep -q "handleOCRRecognition" frontend/src/pages/ReimbursementForm.jsx; then
    echo "❌ OCR功能缺失"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ OCR功能存在"
fi

if [ $ERRORS -gt 0 ]; then
    echo "❌ 发现 $ERRORS 个功能缺失问题"
    exit 1
else
    echo "✅ 所有核心功能检查通过"
fi
```

---

**重要提醒**: 每次代码审查都要运行这个检查清单，确保没有功能丢失！

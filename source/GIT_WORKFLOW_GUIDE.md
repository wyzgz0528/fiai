# Git工作流程规范 - 避免功能丢失

## 🚨 核心原则

**永远不要直接在主分支上进行大规模修改！**

## 📋 标准工作流程

### 1. 修改前准备
```bash
# 1. 确保在最新版本
git pull origin main

# 2. 创建功能分支
git checkout -b feature/fix-invoice-fields

# 3. 备份当前状态
git tag backup-$(date +%Y%m%d-%H%M%S)
```

### 2. 开发过程
```bash
# 小步提交，频繁保存
git add .
git commit -m "WIP: 添加发票金额字段"

# 定期推送到远程分支
git push origin feature/fix-invoice-fields
```

### 3. 测试验证
```bash
# 构建前端
cd frontend && npm run build

# 重启服务
cd ../backend && pm2 restart caiwu-backend

# 功能测试 - 参考 FEATURE_CHECKLIST.md
```

### 4. 合并前检查
```bash
# 检查文件变化
git diff main..feature/fix-invoice-fields --name-only

# 检查代码行数变化（警惕大量删除）
git diff main..feature/fix-invoice-fields --stat

# 如果删除行数过多，需要仔细检查
```

### 5. 安全合并
```bash
# 切换到主分支
git checkout main

# 合并功能分支
git merge feature/fix-invoice-fields

# 立即测试关键功能
# 如果有问题，立即回滚：
# git reset --hard backup-20250828-143000
```

## 🔍 危险信号识别

### 文件变化警告
```bash
# 如果看到这些，需要特别小心：
- frontend/src/pages/ReimbursementForm.jsx    | 500 +++++++++++---------
- frontend/src/pages/ReimbursementForm.jsx    | 200 ---------, 50 +++++++

# 大量删除行数通常意味着功能丢失
```

### 提交信息警告
- "重构代码" - 需要详细检查
- "清理代码" - 可能删除有用功能
- "简化逻辑" - 可能移除复杂但必要的功能

## 🛡️ 保护措施

### 1. 自动备份脚本
```bash
#!/bin/bash
# backup-before-change.sh
DATE=$(date +%Y%m%d-%H%M%S)
git tag "auto-backup-$DATE"
echo "已创建备份标签: auto-backup-$DATE"
```

### 2. 功能检查脚本
```bash
#!/bin/bash
# check-features.sh
echo "检查关键功能..."

# 检查预览功能
if grep -q "handlePreviewFile\|预览" frontend/src/pages/ReimbursementForm.jsx; then
    echo "✅ 预览功能存在"
else
    echo "❌ 预览功能缺失！"
    exit 1
fi

# 检查删除功能
if grep -q "handleDeleteExistingVoucher\|删除" frontend/src/pages/ReimbursementForm.jsx; then
    echo "✅ 删除功能存在"
else
    echo "❌ 删除功能缺失！"
    exit 1
fi
```

### 3. 部署前验证
```bash
#!/bin/bash
# pre-deploy-check.sh
echo "部署前功能验证..."

# 运行功能检查
./check-features.sh

# 检查构建
cd frontend && npm run build
if [ $? -ne 0 ]; then
    echo "❌ 前端构建失败！"
    exit 1
fi

echo "✅ 所有检查通过，可以部署"
```

## 📚 最佳实践

### DO ✅
- 使用功能分支开发
- 小步提交，频繁推送
- 详细的提交信息
- 修改前后都要测试
- 保持功能清单更新

### DON'T ❌
- 直接在main分支大改
- 一次性提交大量变更
- 忽略测试步骤
- 删除不理解的代码
- 跳过代码审查

## 🚨 紧急恢复

如果发现功能丢失：
```bash
# 1. 立即停止操作
git status

# 2. 查看最近的备份标签
git tag -l | grep backup | tail -5

# 3. 恢复到备份点
git checkout backup-20250828-143000

# 4. 创建修复分支
git checkout -b hotfix/restore-preview-function

# 5. 恢复丢失的功能
# 6. 测试验证
# 7. 谨慎合并
```

---

**记住：预防胜于治疗！严格遵循工作流程可以避免99%的功能丢失问题。**

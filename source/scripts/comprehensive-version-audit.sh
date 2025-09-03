#!/bin/bash

# 全面系统的版本冲突检查和整理脚本
echo "🔍 开始全面系统的版本冲突检查..."
echo "========================================"

# 创建审计报告目录
AUDIT_DIR="version-audit-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$AUDIT_DIR"

echo "📁 审计报告将保存在: $AUDIT_DIR"

# 1. 检查Git历史完整性
echo "1. 检查Git历史完整性..."
git log --oneline --graph -20 > "$AUDIT_DIR/git-history.txt"
git branch -a > "$AUDIT_DIR/branches.txt"
git status > "$AUDIT_DIR/git-status.txt"

# 2. 提取所有关键提交的修改内容
echo "2. 提取关键提交的修改内容..."
COMMITS=(
    "c90a191:撤回报销申请时保留发票字段"
    "3b45d81:统一发票字段处理，添加发票金额字段"
    "9f1c195:前端提交时包含完整发票字段"
    "79420db:报销记录创建和更新时包含发票扩展字段"
    "5f33113:基于被驳回报销单重新创建时，完整复制发票字段和附件"
    "d229abf:附件复制路径问题"
    "21100c3:删除凭证时的字段名错误"
)

for commit_info in "${COMMITS[@]}"; do
    commit_hash=$(echo "$commit_info" | cut -d: -f1)
    commit_desc=$(echo "$commit_info" | cut -d: -f2)
    echo "  检查提交: $commit_hash - $commit_desc"
    
    # 提取每个提交的详细信息
    git show --name-only "$commit_hash" > "$AUDIT_DIR/commit-$commit_hash.txt"
    
    # 提取关键文件的内容
    git show "$commit_hash:backend/src/services/formService.js" > "$AUDIT_DIR/formService-$commit_hash.js" 2>/dev/null || echo "文件不存在" > "$AUDIT_DIR/formService-$commit_hash.js"
    git show "$commit_hash:frontend/src/pages/ReimbursementForm.jsx" > "$AUDIT_DIR/ReimbursementForm-$commit_hash.jsx" 2>/dev/null || echo "文件不存在" > "$AUDIT_DIR/ReimbursementForm-$commit_hash.jsx"
    git show "$commit_hash:backend/src/routes/forms_detail.js" > "$AUDIT_DIR/forms_detail-$commit_hash.js" 2>/dev/null || echo "文件不存在" > "$AUDIT_DIR/forms_detail-$commit_hash.js"
done

# 3. 检查当前工作目录状态
echo "3. 检查当前工作目录状态..."
cp backend/src/services/formService.js "$AUDIT_DIR/formService-current.js"
cp frontend/src/pages/ReimbursementForm.jsx "$AUDIT_DIR/ReimbursementForm-current.jsx"
cp backend/src/routes/forms_detail.js "$AUDIT_DIR/forms_detail-current.js"

# 4. 功能完整性检查
echo "4. 功能完整性检查..."
cat > "$AUDIT_DIR/function-check-results.txt" << EOF
=== 功能完整性检查结果 ===

EOF

# 检查createFormFromRejected函数
echo "检查 createFormFromRejected 函数..." >> "$AUDIT_DIR/function-check-results.txt"
if grep -q "async function createFormFromRejected" backend/src/services/formService.js; then
    echo "✅ createFormFromRejected 是异步函数" >> "$AUDIT_DIR/function-check-results.txt"
else
    echo "❌ createFormFromRejected 不是异步函数" >> "$AUDIT_DIR/function-check-results.txt"
fi

# 检查发票字段处理
echo "检查发票字段处理..." >> "$AUDIT_DIR/function-check-results.txt"
if grep -q "invoice_date.*buyer_name.*service_name.*invoice_amount" backend/src/services/formService.js; then
    echo "✅ 后端包含完整发票字段处理" >> "$AUDIT_DIR/function-check-results.txt"
else
    echo "❌ 后端发票字段处理不完整" >> "$AUDIT_DIR/function-check-results.txt"
fi

# 检查前端发票字段
echo "检查前端发票字段..." >> "$AUDIT_DIR/function-check-results.txt"
if grep -q "invoice_amount" frontend/src/pages/ReimbursementForm.jsx; then
    echo "✅ 前端包含发票金额字段" >> "$AUDIT_DIR/function-check-results.txt"
else
    echo "❌ 前端缺少发票金额字段" >> "$AUDIT_DIR/function-check-results.txt"
fi

# 检查路由异步调用
echo "检查路由异步调用..." >> "$AUDIT_DIR/function-check-results.txt"
if grep -q "async.*await createFormFromRejected" backend/src/routes/forms_detail.js; then
    echo "✅ 路由正确调用异步函数" >> "$AUDIT_DIR/function-check-results.txt"
else
    echo "❌ 路由未正确调用异步函数" >> "$AUDIT_DIR/function-check-results.txt"
fi

# 5. 生成冲突分析报告
echo "5. 生成冲突分析报告..."
cat > "$AUDIT_DIR/conflict-analysis.md" << EOF
# 版本冲突分析报告

## 检查时间
$(date)

## Git状态
- 当前分支: $(git branch --show-current)
- 最新提交: $(git log -1 --oneline)
- 未提交修改: $(git status --porcelain | wc -l) 个文件

## 关键发现

### 1. 发票字段处理
- Git历史显示多次修复发票字段问题
- 需要确认最终版本包含所有5个发票字段

### 2. 异步函数处理
- createFormFromRejected函数的异步/同步状态需要确认
- 路由调用方式需要与函数定义保持一致

### 3. 附件处理
- 多次修复附件复制路径问题
- 需要确认最终版本包含正确的文件处理逻辑

## 建议
1. 创建统一的最终版本
2. 包含所有历史修复的功能
3. 确保前后端一致性
4. 添加完整的测试验证

EOF

echo "✅ 审计完成！报告保存在: $AUDIT_DIR"
echo "请查看以下文件："
echo "  - $AUDIT_DIR/function-check-results.txt (功能检查结果)"
echo "  - $AUDIT_DIR/conflict-analysis.md (冲突分析报告)"
echo "  - $AUDIT_DIR/git-history.txt (Git历史)"

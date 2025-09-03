#!/bin/bash

# 详细版本对比分析脚本
echo "🔍 开始详细版本对比分析..."
echo "========================================"

AUDIT_DIR="version-audit-20250829_002757"
COMPARISON_DIR="$AUDIT_DIR/detailed-comparison"
mkdir -p "$COMPARISON_DIR"

# 1. 对比createFormFromRejected函数在不同版本中的实现
echo "1. 对比 createFormFromRejected 函数实现..."

# 提取各版本中的createFormFromRejected函数
for commit in c90a191 3b45d81 5f33113 d229abf; do
    echo "  提取 $commit 版本的 createFormFromRejected 函数..."
    git show "$commit:backend/src/services/formService.js" | \
    sed -n '/function createFormFromRejected/,/^}/p' > "$COMPARISON_DIR/createFormFromRejected-$commit.js" 2>/dev/null || \
    git show "$commit:backend/src/services/formService.js" | \
    sed -n '/async function createFormFromRejected/,/^}/p' > "$COMPARISON_DIR/createFormFromRejected-$commit.js" 2>/dev/null || \
    echo "函数未找到" > "$COMPARISON_DIR/createFormFromRejected-$commit.js"
done

# 提取当前版本
sed -n '/async function createFormFromRejected/,/^}/p' backend/src/services/formService.js > "$COMPARISON_DIR/createFormFromRejected-current.js"

# 2. 对比INSERT语句在不同版本中的实现
echo "2. 对比 INSERT 语句实现..."

for commit in c90a191 3b45d81 79420db; do
    echo "  提取 $commit 版本的 INSERT 语句..."
    git show "$commit:backend/src/services/formService.js" | \
    grep -A 5 -B 5 "INSERT INTO reimbursements" > "$COMPARISON_DIR/insert-statements-$commit.txt" 2>/dev/null || \
    echo "INSERT语句未找到" > "$COMPARISON_DIR/insert-statements-$commit.txt"
done

# 提取当前版本的INSERT语句
grep -A 5 -B 5 "INSERT INTO reimbursements" backend/src/services/formService.js > "$COMPARISON_DIR/insert-statements-current.txt"

# 3. 对比前端发票字段处理
echo "3. 对比前端发票字段处理..."

for commit in c90a191 3b45d81 9f1c195; do
    echo "  提取 $commit 版本的前端发票字段..."
    git show "$commit:frontend/src/pages/ReimbursementForm.jsx" | \
    grep -A 10 -B 10 "invoice_" > "$COMPARISON_DIR/frontend-invoice-$commit.txt" 2>/dev/null || \
    echo "前端发票字段未找到" > "$COMPARISON_DIR/frontend-invoice-$commit.txt"
done

# 提取当前版本
grep -A 10 -B 10 "invoice_" frontend/src/pages/ReimbursementForm.jsx > "$COMPARISON_DIR/frontend-invoice-current.txt"

# 4. 生成详细对比报告
echo "4. 生成详细对比报告..."

cat > "$COMPARISON_DIR/detailed-analysis.md" << 'EOF'
# 详细版本对比分析报告

## 1. createFormFromRejected函数演变

### 关键版本对比：
- **5f33113**: 首次修复，添加异步支持和附件复制
- **d229abf**: 修复附件复制路径问题
- **当前版本**: 需要确认是否包含所有修复

### 检查要点：
- [ ] 函数是否为async
- [ ] 是否包含发票字段复制
- [ ] 是否包含附件复制逻辑
- [ ] 路径处理是否正确

## 2. 数据库INSERT语句演变

### 关键版本对比：
- **79420db**: 添加发票扩展字段到INSERT语句
- **3b45d81**: 统一发票字段处理，添加invoice_amount
- **当前版本**: 需要确认字段完整性

### 检查要点：
- [ ] createFormAutoGenerate中的INSERT语句
- [ ] updateForm中的INSERT和UPDATE语句
- [ ] 是否包含所有5个发票字段

## 3. 前端发票字段演变

### 关键版本对比：
- **9f1c195**: 前端提交时包含完整发票字段
- **3b45d81**: 添加发票金额输入字段
- **当前版本**: 需要确认UI和提交逻辑

### 检查要点：
- [ ] 是否有发票金额输入字段
- [ ] 提交时是否包含所有发票字段
- [ ] 字段验证是否正确

EOF

# 5. 执行具体的冲突检查
echo "5. 执行具体的冲突检查..."

# 检查createFormFromRejected函数的一致性
echo "检查 createFormFromRejected 函数一致性..." >> "$COMPARISON_DIR/detailed-analysis.md"
echo "" >> "$COMPARISON_DIR/detailed-analysis.md"

if grep -q "async function createFormFromRejected" "$COMPARISON_DIR/createFormFromRejected-current.js"; then
    echo "✅ 当前版本是异步函数" >> "$COMPARISON_DIR/detailed-analysis.md"
else
    echo "❌ 当前版本不是异步函数" >> "$COMPARISON_DIR/detailed-analysis.md"
fi

if grep -q "invoice_date.*buyer_name.*service_name" "$COMPARISON_DIR/createFormFromRejected-current.js"; then
    echo "✅ 当前版本包含发票字段复制" >> "$COMPARISON_DIR/detailed-analysis.md"
else
    echo "❌ 当前版本缺少发票字段复制" >> "$COMPARISON_DIR/detailed-analysis.md"
fi

if grep -q "vouchers.*attachments" "$COMPARISON_DIR/createFormFromRejected-current.js"; then
    echo "✅ 当前版本包含附件复制逻辑" >> "$COMPARISON_DIR/detailed-analysis.md"
else
    echo "❌ 当前版本缺少附件复制逻辑" >> "$COMPARISON_DIR/detailed-analysis.md"
fi

echo "" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "## 推荐的最终版本特征" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "基于分析，最终版本应该包含：" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "1. 异步的createFormFromRejected函数（来自5f33113+修复）" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "2. 完整的5个发票字段处理（来自3b45d81）" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "3. 正确的附件复制逻辑（来自d229abf）" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "4. 前端发票金额字段（来自3b45d81）" >> "$COMPARISON_DIR/detailed-analysis.md"
echo "5. 正确的路由异步调用（需要修复）" >> "$COMPARISON_DIR/detailed-analysis.md"

echo "✅ 详细对比分析完成！"
echo "查看报告: $COMPARISON_DIR/detailed-analysis.md"

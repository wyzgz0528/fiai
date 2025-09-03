#!/bin/bash

# 回归防护系统 - 确保修复不引入新问题
echo "🛡️ 初始化回归防护系统..."
echo "========================================"

# 1. 创建当前状态快照
create_baseline_snapshot() {
    echo "📸 创建当前状态基线快照..."
    
    SNAPSHOT_DIR="baseline-snapshot-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$SNAPSHOT_DIR"
    
    # 保存关键文件的当前状态
    cp backend/src/services/formService.js "$SNAPSHOT_DIR/"
    cp backend/src/routes/forms_detail.js "$SNAPSHOT_DIR/"
    cp frontend/src/pages/ReimbursementForm.jsx "$SNAPSHOT_DIR/"
    cp frontend/src/pages/ReimbursementFormDetail.jsx "$SNAPSHOT_DIR/"
    
    # 记录当前Git状态
    git rev-parse HEAD > "$SNAPSHOT_DIR/git-commit.txt"
    git status --porcelain > "$SNAPSHOT_DIR/git-status.txt"
    
    echo "✅ 基线快照已保存到: $SNAPSHOT_DIR"
    echo "$SNAPSHOT_DIR" > .current-baseline
}

# 2. 创建功能验证清单
create_function_checklist() {
    echo "📋 创建功能验证清单..."
    
    cat > REGRESSION_TEST_CHECKLIST.md << 'EOF'
# 回归测试清单

## 核心功能验证 (必须全部通过)

### 1. 基于被驳回报销单创建新单
- [ ] 函数是异步的 (async function createFormFromRejected)
- [ ] 路由正确调用异步函数 (async (req, res) => { await createFormFromRejected })
- [ ] 发票字段完整复制 (5个字段)
- [ ] 附件正确复制
- [ ] 新单创建成功
- [ ] 跳转到详情页面正常

### 2. 发票字段处理
- [ ] createFormAutoGenerate包含5个发票字段
- [ ] updateForm包含5个发票字段
- [ ] 前端提交包含5个发票字段
- [ ] 前端显示发票金额输入框
- [ ] 数据库正确保存发票字段

### 3. 附件处理
- [ ] 附件上传正常
- [ ] 附件预览正常
- [ ] 附件复制路径正确
- [ ] 临时文件处理正常
- [ ] 附件删除权限正确

### 4. 权限和安全
- [ ] 删除凭证使用正确字段名 (form_id)
- [ ] 用户权限验证正常
- [ ] 创建人权限检查正常
- [ ] 状态检查正常

### 5. 前端界面
- [ ] 报销单列表显示正常
- [ ] 报销单详情显示正常
- [ ] 报销单编辑功能正常
- [ ] 按钮显示逻辑正确
- [ ] 状态显示正确

## 测试步骤

### 完整流程测试
1. 创建报销单 (包含发票字段和附件)
2. 提交报销单
3. 财务驳回报销单
4. 使用"基于此单创建新报销申请"
5. 验证新单包含完整信息
6. 编辑新单并保存
7. 提交新单

### 边界情况测试
1. 无附件的报销单复制
2. 多个附件的报销单复制
3. 大文件附件处理
4. 特殊字符发票号处理
5. 权限边界测试

EOF
    
    echo "✅ 功能验证清单已创建: REGRESSION_TEST_CHECKLIST.md"
}

# 3. 创建自动化检查脚本
create_automated_checks() {
    echo "🤖 创建自动化检查脚本..."
    
    cat > scripts/automated-regression-check.sh << 'EOF'
#!/bin/bash

# 自动化回归检查脚本
echo "🔍 执行自动化回归检查..."

FAILED_CHECKS=0
TOTAL_CHECKS=0

check_function() {
    local description="$1"
    local command="$2"
    local expected="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    echo -n "检查: $description ... "
    
    if eval "$command" | grep -q "$expected"; then
        echo "✅ 通过"
    else
        echo "❌ 失败"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
}

# 执行所有检查
check_function "createFormFromRejected是异步函数" \
    "grep 'async function createFormFromRejected' backend/src/services/formService.js" \
    "async function createFormFromRejected"

check_function "路由正确调用异步函数" \
    "grep -A 3 'create-from-rejected.*async' backend/src/routes/forms_detail.js" \
    "await createFormFromRejected"

check_function "INSERT语句包含发票字段" \
    "grep 'INSERT INTO reimbursements.*invoice_date.*buyer_name.*service_name.*invoice_amount' backend/src/services/formService.js" \
    "invoice_amount"

check_function "UPDATE语句包含发票字段" \
    "grep 'UPDATE reimbursements SET.*invoice_date.*buyer_name.*service_name.*invoice_amount' backend/src/services/formService.js" \
    "invoice_amount"

check_function "前端包含发票金额字段" \
    "grep 'invoice_amount.*InputNumber' frontend/src/pages/ReimbursementForm.jsx" \
    "invoice_amount"

check_function "前端提交包含发票字段" \
    "grep -A 10 'invoice_amount: item.invoice_amount' frontend/src/pages/ReimbursementForm.jsx" \
    "invoice_amount"

check_function "删除凭证使用正确字段名" \
    "grep 'record\.form_id' backend/src/routes/forms_detail.js" \
    "form_id"

# 输出结果
echo "========================================"
echo "📊 检查结果:"
echo "  总检查项: $TOTAL_CHECKS"
echo "  通过项: $((TOTAL_CHECKS - FAILED_CHECKS))"
echo "  失败项: $FAILED_CHECKS"

if [ $FAILED_CHECKS -eq 0 ]; then
    echo "🎉 所有自动化检查通过！"
    exit 0
else
    echo "⚠️  有 $FAILED_CHECKS 项检查失败，需要修复！"
    exit 1
fi
EOF
    
    chmod +x scripts/automated-regression-check.sh
    echo "✅ 自动化检查脚本已创建: scripts/automated-regression-check.sh"
}

# 4. 创建修复前后对比机制
create_comparison_mechanism() {
    echo "🔄 创建修复前后对比机制..."
    
    cat > scripts/before-after-comparison.sh << 'EOF'
#!/bin/bash

# 修复前后对比脚本
BASELINE_DIR=$(cat .current-baseline 2>/dev/null || echo "baseline-snapshot-latest")

if [ ! -d "$BASELINE_DIR" ]; then
    echo "❌ 基线快照不存在，请先运行回归防护系统"
    exit 1
fi

echo "🔄 对比修复前后的变化..."
echo "基线快照: $BASELINE_DIR"
echo "========================================"

# 对比关键文件
compare_file() {
    local file="$1"
    local description="$2"
    
    echo "对比 $description:"
    if [ -f "$BASELINE_DIR/$file" ] && [ -f "$file" ]; then
        if diff -q "$BASELINE_DIR/$file" "$file" > /dev/null; then
            echo "  ✅ 无变化"
        else
            echo "  🔄 有变化，显示差异:"
            diff -u "$BASELINE_DIR/$file" "$file" | head -20
            echo "  ..."
        fi
    else
        echo "  ⚠️  文件不存在"
    fi
    echo ""
}

compare_file "formService.js" "后端服务逻辑"
compare_file "forms_detail.js" "后端路由"
compare_file "ReimbursementForm.jsx" "前端表单"
compare_file "ReimbursementFormDetail.jsx" "前端详情"

echo "========================================"
echo "🏁 对比完成"
EOF
    
    chmod +x scripts/before-after-comparison.sh
    echo "✅ 对比机制已创建: scripts/before-after-comparison.sh"
}

# 5. 创建安全修复流程
create_safe_fix_workflow() {
    echo "🔒 创建安全修复流程..."
    
    cat > SAFE_FIX_WORKFLOW.md << 'EOF'
# 安全修复流程

## 修复前准备 (必须执行)

1. **创建基线快照**
   ```bash
   ./scripts/regression-protection-system.sh
   ```

2. **执行自动化检查**
   ```bash
   ./scripts/automated-regression-check.sh
   ```

3. **记录当前问题**
   - 详细描述要修复的问题
   - 记录预期的修复效果
   - 确认修复范围

## 修复过程 (严格遵循)

1. **小步骤修复**
   - 每次只修复一个具体问题
   - 避免大范围修改
   - 保持修改的原子性

2. **每步验证**
   ```bash
   # 每次修改后立即检查
   ./scripts/automated-regression-check.sh
   
   # 对比变化
   ./scripts/before-after-comparison.sh
   ```

3. **功能测试**
   - 测试修复的具体功能
   - 测试相关的核心功能
   - 执行完整流程测试

## 修复后确认 (必须通过)

1. **自动化检查全部通过**
2. **手动功能测试通过**
3. **回归测试清单全部勾选**
4. **创建新的基线快照**

## 回滚机制

如果发现问题：
```bash
# 立即回滚到基线快照
git checkout $(cat baseline-snapshot-*/git-commit.txt)

# 或者使用git reset (谨慎使用)
git reset --hard $(cat baseline-snapshot-*/git-commit.txt)
```

EOF
    
    echo "✅ 安全修复流程已创建: SAFE_FIX_WORKFLOW.md"
}

# 执行所有初始化步骤
main() {
    create_baseline_snapshot
    create_function_checklist
    create_automated_checks
    create_comparison_mechanism
    create_safe_fix_workflow
    
    echo "========================================"
    echo "🛡️ 回归防护系统初始化完成！"
    echo ""
    echo "📋 使用方法："
    echo "1. 修复前: 已创建基线快照"
    echo "2. 修复中: ./scripts/automated-regression-check.sh"
    echo "3. 修复后: ./scripts/before-after-comparison.sh"
    echo "4. 参考: SAFE_FIX_WORKFLOW.md"
    echo ""
    echo "🔒 现在可以安全地进行修复，系统会防止回归！"
}

main

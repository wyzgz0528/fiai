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
    "grep 'await createFormFromRejected' backend/src/routes/forms_detail.js" \
    "await createFormFromRejected"

check_function "INSERT语句包含发票字段" \
    "grep 'INSERT INTO reimbursements.*invoice_date.*buyer_name.*service_name.*invoice_amount' backend/src/services/formService.js" \
    "invoice_amount"

check_function "UPDATE语句包含发票字段保护" \
    "grep 'invoice_date=COALESCE' backend/src/services/formService.js" \
    "COALESCE"

check_function "前端提交使用报销金额作为发票金额" \
    "grep 'invoice_amount: item.amount' frontend/src/pages/ReimbursementForm.jsx" \
    "invoice_amount: item.amount"

check_function "前端包含发票日期字段" \
    "grep 'value={item.invoice_date}' frontend/src/pages/ReimbursementForm.jsx" \
    "invoice_date"

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

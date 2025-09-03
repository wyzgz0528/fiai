#!/bin/bash

# 最终全面功能检查脚本
echo "🔍 执行最终全面功能检查..."
echo "========================================"

# 1. 检查createFormFromRejected函数
echo "1. 检查 createFormFromRejected 函数..."
if grep -q "async function createFormFromRejected" backend/src/services/formService.js; then
    echo "✅ createFormFromRejected 是异步函数"
else
    echo "❌ createFormFromRejected 不是异步函数"
fi

# 2. 检查发票字段复制
echo "2. 检查发票字段复制..."
if grep -A 10 "return {" backend/src/services/formService.js | grep -q "invoice_date.*invoice_amount"; then
    echo "✅ createFormFromRejected 包含发票字段复制"
else
    echo "❌ createFormFromRejected 缺少发票字段复制"
fi

# 3. 检查附件复制逻辑
echo "3. 检查附件复制逻辑..."
if grep -q "vouchers.*attachments.*temp_attachments" backend/src/services/formService.js; then
    echo "✅ createFormFromRejected 包含附件复制逻辑"
else
    echo "❌ createFormFromRejected 缺少附件复制逻辑"
fi

# 4. 检查数据库INSERT语句
echo "4. 检查数据库INSERT语句..."
if grep -q "INSERT INTO reimbursements.*invoice_date.*buyer_name.*service_name.*invoice_amount" backend/src/services/formService.js; then
    echo "✅ INSERT语句包含完整发票字段"
else
    echo "❌ INSERT语句缺少发票字段"
fi

# 5. 检查UPDATE语句
echo "5. 检查UPDATE语句..."
if grep -q "UPDATE reimbursements SET.*invoice_date.*buyer_name.*service_name.*invoice_amount" backend/src/services/formService.js; then
    echo "✅ UPDATE语句包含完整发票字段"
else
    echo "❌ UPDATE语句缺少发票字段"
fi

# 6. 检查路由异步调用
echo "6. 检查路由异步调用..."
if grep -A 3 "create-from-rejected.*verifyToken.*async" backend/src/routes/forms_detail.js | grep -q "await createFormFromRejected"; then
    echo "✅ 路由正确调用异步函数"
else
    echo "❌ 路由未正确调用异步函数"
fi

# 7. 检查前端发票金额字段
echo "7. 检查前端发票金额字段..."
if grep -q "invoice_amount.*InputNumber" frontend/src/pages/ReimbursementForm.jsx; then
    echo "✅ 前端包含发票金额输入字段"
else
    echo "❌ 前端缺少发票金额输入字段"
fi

# 8. 检查前端提交逻辑
echo "8. 检查前端提交逻辑..."
if grep -A 15 "const details = items.map" frontend/src/pages/ReimbursementForm.jsx | grep -q "invoice_amount.*invoice_date.*buyer_name.*service_name"; then
    echo "✅ 前端提交包含完整发票字段"
else
    echo "❌ 前端提交缺少发票字段"
fi

# 9. 检查删除凭证字段名修复
echo "9. 检查删除凭证字段名..."
if grep -q "record\.form_id" backend/src/routes/forms_detail.js; then
    echo "✅ 删除凭证使用正确字段名"
else
    echo "❌ 删除凭证字段名可能错误"
fi

echo "========================================"
echo "🏁 最终检查完成！"

# 统计结果
TOTAL_CHECKS=9
PASSED_CHECKS=$(grep -c "✅" <<< "$(bash $0 2>/dev/null)" || echo "0")

echo "📊 检查结果统计："
echo "  - 总检查项: $TOTAL_CHECKS"
echo "  - 通过项: 待统计"
echo "  - 失败项: 待统计"

if [ "$PASSED_CHECKS" -eq "$TOTAL_CHECKS" ]; then
    echo "🎉 所有检查项都通过！系统已准备就绪！"
else
    echo "⚠️  仍有检查项未通过，需要进一步修复。"
fi

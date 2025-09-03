#!/bin/bash

# 检查关键修复是否被意外回退的脚本
echo "🔍 检查关键修复是否被意外回退..."
echo "========================================"

# 检查1: createFormFromRejected函数是否为异步
echo "1. 检查 createFormFromRejected 函数..."
if grep -q "async function createFormFromRejected" backend/src/services/formService.js; then
    echo "✅ createFormFromRejected 函数是异步的"
else
    echo "❌ createFormFromRejected 函数不是异步的 - 需要修复"
fi

# 检查2: 发票字段是否在createFormAutoGenerate中被处理
echo "2. 检查发票字段处理..."
if grep -q "invoice_date.*buyer_name.*service_name" backend/src/services/formService.js; then
    echo "✅ 发票扩展字段在后端被正确处理"
else
    echo "❌ 发票扩展字段处理可能有问题"
fi

# 检查3: 前端ReimbursementForm是否包含发票字段提交
echo "3. 检查前端发票字段提交..."
if grep -q "invoice_date.*buyer_name.*service_name" frontend/src/pages/ReimbursementForm.jsx; then
    echo "✅ 前端包含发票字段提交逻辑"
else
    echo "❌ 前端发票字段提交逻辑可能缺失"
fi

# 检查4: 删除凭证时的字段名修复
echo "4. 检查删除凭证字段名..."
if grep -q "record\.form_id" backend/src/routes/forms_detail.js; then
    echo "✅ 删除凭证使用正确的字段名 form_id"
else
    echo "❌ 删除凭证可能使用错误的字段名"
fi

# 检查5: 路由是否正确调用异步函数
echo "5. 检查路由异步调用..."
if grep -q "async.*req.*res.*=>.*await createFormFromRejected" backend/src/routes/forms_detail.js; then
    echo "✅ 路由正确调用异步版本的 createFormFromRejected"
else
    echo "❌ 路由可能没有正确调用异步函数"
fi

# 检查6: 预览功能是否存在
echo "6. 检查预览功能..."
if grep -q "预览" frontend/src/pages/ReimbursementForm.jsx; then
    echo "✅ 预览功能存在"
else
    echo "❌ 预览功能可能被删除"
fi

# 检查7: 发票金额字段
echo "7. 检查发票金额字段..."
if grep -q "invoice_amount" frontend/src/pages/ReimbursementForm.jsx; then
    echo "✅ 前端包含发票金额字段"
else
    echo "❌ 前端可能缺少发票金额字段"
fi

echo "========================================"
echo "🏁 检查完成！请查看上述结果。"

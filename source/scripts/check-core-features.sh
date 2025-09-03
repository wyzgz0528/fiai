#!/bin/bash
# 核心功能检查脚本 - 防止功能丢失

echo "🔍 检查核心功能完整性..."

ERRORS=0
WARNINGS=0

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_function() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅ $description${NC}"
        return 0
    else
        echo -e "${RED}❌ $description 缺失${NC}"
        return 1
    fi
}

check_warning() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if ! grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  $description 可能有问题${NC}"
        return 1
    else
        echo -e "${GREEN}✅ $description${NC}"
        return 0
    fi
}

echo "📋 检查报销申请表单 (ReimbursementForm.jsx)..."

# 核心功能检查
if ! check_function "frontend/src/pages/ReimbursementForm.jsx" "handlePreviewFile\|预览" "凭证预览功能"; then
    ERRORS=$((ERRORS + 1))
fi

if ! check_function "frontend/src/pages/ReimbursementForm.jsx" "handleDeleteExistingVoucher" "凭证删除功能"; then
    ERRORS=$((ERRORS + 1))
fi

if ! check_function "frontend/src/pages/ReimbursementForm.jsx" "handleOCRRecognition" "OCR识别功能"; then
    ERRORS=$((ERRORS + 1))
fi

if ! check_function "frontend/src/pages/ReimbursementForm.jsx" "previewVisible.*useState\|useState.*previewVisible" "预览状态管理"; then
    ERRORS=$((ERRORS + 1))
fi

if ! check_function "frontend/src/pages/ReimbursementForm.jsx" "📎 预览文件\|previewVisible.*Modal" "预览弹窗组件"; then
    ERRORS=$((ERRORS + 1))
fi

# 警告级别检查
if ! check_warning "frontend/src/pages/ReimbursementForm.jsx" "onMouseDown.*拖拽\|拖拽.*onMouseDown" "拖拽移动功能"; then
    WARNINGS=$((WARNINGS + 1))
fi

if ! check_warning "frontend/src/pages/ReimbursementForm.jsx" "handleClosePreview" "预览关闭功能"; then
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "📋 检查报销单列表 (ReimbursementFormList.jsx)..."

if ! check_function "frontend/src/pages/ReimbursementFormList.jsx" "handleDeleteForm" "报销单删除功能"; then
    ERRORS=$((ERRORS + 1))
fi

if ! check_function "frontend/src/pages/ReimbursementFormList.jsx" "DeleteOutlined" "删除图标导入"; then
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "📋 检查后端API路由..."

if ! check_function "backend/src/routes/forms_detail.js" "vouchers.*preview" "凭证预览API"; then
    ERRORS=$((ERRORS + 1))
fi

if ! check_function "backend/src/routes/forms_detail.js" "DELETE.*vouchers" "凭证删除API"; then
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "📊 检查结果汇总:"
echo "=================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}🎉 所有功能检查通过！${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  发现 $WARNINGS 个警告，但核心功能完整${NC}"
    exit 0
else
    echo -e "${RED}❌ 发现 $ERRORS 个严重问题和 $WARNINGS 个警告${NC}"
    echo ""
    echo "🚨 建议操作："
    echo "1. 检查最近的代码修改"
    echo "2. 对比功能清单 (FEATURE_CHECKLIST.md)"
    echo "3. 考虑回滚到上一个稳定版本"
    echo "4. 重新实现缺失的功能"
    exit 1
fi

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

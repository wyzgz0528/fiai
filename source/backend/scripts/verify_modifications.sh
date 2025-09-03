#!/bin/bash

# 验证关键修改是否仍然存在
# 用法: ./verify_modifications.sh

echo "🔍 验证关键代码修改..."

# 检查formService.js中的关键修改
FORM_SERVICE_FILE="backend/src/services/formService.js"

if [ ! -f "$FORM_SERVICE_FILE" ]; then
    echo "❌ 文件不存在: $FORM_SERVICE_FILE"
    exit 1
fi

echo "📁 检查文件: $FORM_SERVICE_FILE"

# 检查关键修改点
MODIFICATIONS=(
    "finance_rejected.*manager_rejected"
    "rejected.*finance_rejected.*manager_rejected.*includes.*norm"
    "logAction.*form_resubmit_reset_records"
)

ALL_GOOD=true

for i in "${!MODIFICATIONS[@]}"; do
    PATTERN="${MODIFICATIONS[$i]}"
    if grep -q "$PATTERN" "$FORM_SERVICE_FILE"; then
        echo "✅ 修改点 $((i+1)): 存在"
    else
        echo "❌ 修改点 $((i+1)): 缺失"
        ALL_GOOD=false
    fi
done

# 检查文件修改时间
LAST_MODIFIED=$(stat -c %Y "$FORM_SERVICE_FILE")
CURRENT_TIME=$(date +%s)
TIME_DIFF=$((CURRENT_TIME - LAST_MODIFIED))

echo "📅 文件最后修改: $(date -d @$LAST_MODIFIED '+%Y-%m-%d %H:%M:%S')"
echo "⏰ 距离现在: $((TIME_DIFF / 3600)) 小时 $(((TIME_DIFF % 3600) / 60)) 分钟"

if [ "$ALL_GOOD" = true ]; then
    echo "🎉 所有关键修改都存在！"
    exit 0
else
    echo "⚠️  发现缺失的修改，可能需要重新应用修复！"
    exit 1
fi

#!/bin/bash

# 数据库备份脚本
# 用法: ./backup-db.sh

set -e

# 配置
DB_PATH="backend/src/db.sqlite"
BACKUP_DIR="backend/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.sqlite"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 检查数据库文件是否存在
if [ ! -f "$DB_PATH" ]; then
    echo "❌ 数据库文件不存在: $DB_PATH"
    exit 1
fi

# 检查数据库文件大小
DB_SIZE=$(stat -c%s "$DB_PATH")
if [ "$DB_SIZE" -eq 0 ]; then
    echo "⚠️  数据库文件为空，跳过备份"
    exit 0
fi

# 执行备份
echo "📦 开始备份数据库..."
echo "   源文件: $DB_PATH"
echo "   目标文件: $BACKUP_FILE"

cp "$DB_PATH" "$BACKUP_FILE"

# 验证备份
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE")
    echo "✅ 备份完成！"
    echo "   原文件大小: ${DB_SIZE} 字节"
    echo "   备份文件大小: ${BACKUP_SIZE} 字节"
    
    # 保留最近10个备份文件
    cd "$BACKUP_DIR"
    ls -t db_backup_*.sqlite | tail -n +11 | xargs -r rm
    echo "🧹 清理完成，保留最近10个备份文件"
else
    echo "❌ 备份失败！"
    exit 1
fi

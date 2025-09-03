#!/bin/bash

# 财务系统部署脚本
# 确保所有修改在生产环境中永久生效
# 服务器: bao.intellnet.site

set -e  # 遇到错误立即退出

echo "🚀 开始部署财务系统..."
echo "📅 部署时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "🏷️  当前版本: $(git describe --tags --always)"

# 1. 检查Git状态
echo "📋 检查Git状态..."
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  警告: 有未提交的更改"
    git status --short
    read -p "是否继续部署? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 部署已取消"
        exit 1
    fi
fi

# 2. 拉取最新代码（如果需要）
echo "📥 检查远程更新..."
git fetch origin master 2>/dev/null || echo "⚠️  无法连接到远程仓库，使用本地代码"

# 3. 构建前端
echo "🔨 构建前端..."
cd frontend
npm run build
echo "✅ 前端构建完成"
cd ..

# 4. 备份当前版本
echo "💾 备份当前版本..."
BACKUP_DIR="backups/$(date '+%Y%m%d_%H%M%S')"
mkdir -p "$BACKUP_DIR"
cp -r backend/src/db.sqlite "$BACKUP_DIR/" 2>/dev/null || echo "⚠️  数据库备份跳过"
echo "✅ 备份完成: $BACKUP_DIR"

# 5. 重启服务
echo "🔄 重启服务..."
pm2 restart all
sleep 3

# 6. 健康检查
echo "🏥 健康检查..."
for i in {1..5}; do
    if curl -s http://localhost:3001/api/health > /dev/null; then
        echo "✅ 服务健康检查通过"
        break
    else
        echo "⏳ 等待服务启动... ($i/5)"
        sleep 2
    fi
    if [ $i -eq 5 ]; then
        echo "❌ 服务健康检查失败"
        exit 1
    fi
done

# 7. 保存PM2配置
echo "💾 保存PM2配置..."
pm2 save

# 8. 显示服务状态
echo "📊 服务状态:"
pm2 status

# 9. 显示最新提交
echo "📝 最新提交:"
git log --oneline -3

echo ""
echo "🎉 部署完成!"
echo "🌐 访问地址: https://bao.intellnet.site"
echo "👥 测试账号: user/admin/finance/gm (密码: 123456)"
echo "📋 当前版本: $(git describe --tags --always)"
echo "⏰ 完成时间: $(date '+%Y-%m-%d %H:%M:%S')"

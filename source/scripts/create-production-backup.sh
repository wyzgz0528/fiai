#!/bin/bash

# 财务系统生产版本备份脚本
# 版本: v2.1.11 正式版
# 创建时间: $(date '+%Y-%m-%d %H:%M:%S')

set -e

# 配置
BACKUP_DATE=$(date '+%Y%m%d_%H%M%S')
BACKUP_NAME="caiwu-production-v2.1.11-${BACKUP_DATE}"
BACKUP_DIR="/tmp/${BACKUP_NAME}"
ARCHIVE_PATH="/tmp/${BACKUP_NAME}.tar.gz"

echo "🎉 开始创建财务系统生产版本备份..."
echo "📦 备份名称: ${BACKUP_NAME}"
echo "📁 备份目录: ${BACKUP_DIR}"

# 创建备份目录
mkdir -p "${BACKUP_DIR}"

echo "📋 正在收集系统信息..."

# 1. 创建版本信息文件
cat > "${BACKUP_DIR}/VERSION_INFO.md" << EOF
# 财务系统生产版本信息

## 版本详情
- **版本号**: v2.1.11
- **备份时间**: $(date '+%Y-%m-%d %H:%M:%S')
- **备份类型**: 生产正式版
- **系统状态**: 稳定运行

## 最新功能
1. 修复PDF报销单显示问题
   - 添加报销单审批状态显示
   - 修复审批历史表格样式
2. 修复确认打款按钮空白tooltip问题
3. 修复报销单详情页显示问题
   - 操作列状态中文化
   - 借款关联时间北京时间显示

## 系统架构
- **前端**: React + Vite + Antd
- **后端**: Node.js + Express + SQLite
- **部署**: PM2 进程管理
- **服务器**: bao.intellnet.site

## 用户账户
- user/admin/finance/gm (密码: 123456)

EOF

# 2. 收集Git信息
echo "📝 收集Git版本信息..."
git log --oneline -10 > "${BACKUP_DIR}/git-recent-commits.txt"
git status > "${BACKUP_DIR}/git-status.txt"
git branch -a > "${BACKUP_DIR}/git-branches.txt"
git tag --sort=-version:refname | head -20 > "${BACKUP_DIR}/git-tags.txt"

# 3. 收集系统运行状态
echo "🔍 收集系统运行状态..."
pm2 list > "${BACKUP_DIR}/pm2-status.txt" 2>/dev/null || echo "PM2 not running" > "${BACKUP_DIR}/pm2-status.txt"
ps aux | grep -E "(node|pm2)" > "${BACKUP_DIR}/process-status.txt" || true
df -h > "${BACKUP_DIR}/disk-usage.txt"
free -h > "${BACKUP_DIR}/memory-usage.txt"

# 4. 备份源代码
echo "💾 备份源代码..."
rsync -av --exclude='node_modules' \
          --exclude='.git' \
          --exclude='dist' \
          --exclude='build' \
          --exclude='uploads' \
          --exclude='*.log' \
          --exclude='temp_*' \
          . "${BACKUP_DIR}/source/"

# 5. 备份数据库
echo "🗄️ 备份数据库..."
if [ -f "backend/src/db.sqlite" ]; then
    cp "backend/src/db.sqlite" "${BACKUP_DIR}/database-backup.sqlite"
    echo "✅ 数据库备份完成"
else
    echo "⚠️ 数据库文件未找到"
fi

# 6. 备份上传文件
echo "📎 备份上传文件..."
if [ -d "backend/uploads" ]; then
    cp -r "backend/uploads" "${BACKUP_DIR}/uploads-backup/"
    echo "✅ 上传文件备份完成"
else
    echo "⚠️ 上传文件目录未找到"
fi

# 7. 备份配置文件
echo "⚙️ 备份配置文件..."
mkdir -p "${BACKUP_DIR}/config/"
[ -f "package.json" ] && cp "package.json" "${BACKUP_DIR}/config/"
[ -f "frontend/package.json" ] && cp "frontend/package.json" "${BACKUP_DIR}/config/frontend-package.json"
[ -f "backend/package.json" ] && cp "backend/package.json" "${BACKUP_DIR}/config/backend-package.json"

# 8. 创建部署说明
cat > "${BACKUP_DIR}/DEPLOYMENT_GUIDE.md" << EOF
# 财务系统部署指南

## 快速部署步骤

### 1. 环境准备
\`\`\`bash
# 安装Node.js (建议v18+)
# 安装PM2
npm install -g pm2
\`\`\`

### 2. 部署步骤
\`\`\`bash
# 解压备份文件
tar -xzf ${BACKUP_NAME}.tar.gz
cd ${BACKUP_NAME}/source

# 安装依赖
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# 构建前端
cd frontend && npm run build && cd ..

# 恢复数据库
cp ../database-backup.sqlite backend/src/db.sqlite

# 恢复上传文件
cp -r ../uploads-backup backend/uploads

# 启动服务
cd backend && pm2 start src/server.js --name caiwu-backend
\`\`\`

### 3. 验证部署
- 访问系统检查功能
- 检查PM2状态: \`pm2 status\`
- 查看日志: \`pm2 logs caiwu-backend\`

## 重要提醒
- 确保端口3001可用
- 检查文件权限
- 备份现有数据后再部署
EOF

# 9. 创建压缩包
echo "📦 创建压缩包..."
cd /tmp
tar -czf "${ARCHIVE_PATH}" "${BACKUP_NAME}/"

# 10. 清理临时目录
rm -rf "${BACKUP_DIR}"

echo ""
echo "🎉 备份创建完成！"
echo "📦 备份文件: ${ARCHIVE_PATH}"
echo "📊 文件大小: $(du -h "${ARCHIVE_PATH}" | cut -f1)"
echo ""
echo "📥 下载备份文件的方法："
echo "1. 使用scp: scp ubuntu@bao.intellnet.site:${ARCHIVE_PATH} ./"
echo "2. 使用wget: wget http://bao.intellnet.site:8080/$(basename ${ARCHIVE_PATH})"
echo ""
echo "✅ 备份包含："
echo "   - 完整源代码"
echo "   - 数据库文件"
echo "   - 上传文件"
echo "   - 配置文件"
echo "   - 部署指南"
echo "   - 版本信息"

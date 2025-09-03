# 财务系统部署指南

## 快速部署步骤

### 1. 环境准备
```bash
# 安装Node.js (建议v18+)
# 安装PM2
npm install -g pm2
```

### 2. 部署步骤
```bash
# 解压备份文件
tar -xzf caiwu-production-v2.1.11-20250829_162120.tar.gz
cd caiwu-production-v2.1.11-20250829_162120/source

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
```

### 3. 验证部署
- 访问系统检查功能
- 检查PM2状态: `pm2 status`
- 查看日志: `pm2 logs caiwu-backend`

## 重要提醒
- 确保端口3001可用
- 检查文件权限
- 备份现有数据后再部署

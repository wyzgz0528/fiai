# 生产环境部署和维护指南

## 概述

本文档详细说明了企业财务管理系统在生产环境中的部署、监控和维护方案，旨在避免手动干预和确保系统稳定运行。

## 登录失败问题的根本原因分析

### 可能的原因

1. **数据库初始化问题**
   - 数据库文件损坏或丢失
   - 用户表结构不完整
   - 默认用户数据缺失或密码错误

2. **服务进程问题**
   - PM2进程异常退出
   - 内存泄漏导致进程重启
   - 端口被占用

3. **环境配置问题**
   - 环境变量缺失
   - 文件权限问题
   - 磁盘空间不足

4. **网络和代理问题**
   - 反向代理配置错误
   - 防火墙规则问题
   - SSL证书过期

## 自动化解决方案

### 1. 健壮的数据库初始化机制

系统已实现自动检测和修复数据库问题：

```bash
# 手动执行健康检查
node backend/scripts/health-check.js

# 强制修复数据库
node backend/scripts/health-check.js --repair

# 连续监控模式
node backend/scripts/health-check.js --continuous
```

### 2. 自动监控和恢复

启动系统监控守护进程：

```bash
# 启动监控守护进程
node backend/scripts/monitor.js --daemon

# 查看监控状态
node backend/scripts/monitor.js --once
```

监控功能包括：
- PM2进程状态监控
- 内存使用监控
- 数据库健康检查
- 自动重启异常进程
- 告警通知

### 3. PM2进程管理配置

```javascript
// ecosystem.config.js 已配置
{
  autorestart: true,        // 自动重启
  max_memory_restart: '500M', // 内存限制重启
  max_restarts: 10,         // 最大重启次数
  restart_delay: 4000,      // 重启延迟
  min_uptime: '10s'         // 最小运行时间
}
```

## 部署最佳实践

### 1. 初始部署

```bash
# 1. 克隆代码
git clone <repository>
cd caiwu

# 2. 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 3. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env 文件，设置生产环境配置

# 4. 构建前端
cd frontend && npm run build

# 5. 启动后端服务
cd ../backend
pm2 start ecosystem.config.js

# 6. 启动监控
node scripts/monitor.js --daemon
```

### 2. 系统配置

#### Nginx反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        root /path/to/caiwu/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # API代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 系统服务配置

创建systemd服务文件 `/etc/systemd/system/caiwu-monitor.service`：

```ini
[Unit]
Description=Caiwu System Monitor
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/caiwu/backend
ExecStart=/usr/bin/node scripts/monitor.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：
```bash
sudo systemctl enable caiwu-monitor
sudo systemctl start caiwu-monitor
```

## 监控和告警

### 1. 日志文件位置

- 应用日志: `backend/src/logs/`
- PM2日志: `~/.pm2/logs/`
- 健康检查日志: `backend/src/logs/health-check.log`
- 监控日志: `backend/src/logs/monitor.log`
- 告警日志: `backend/src/logs/alerts.log`

### 2. 关键指标监控

- 服务可用性
- 响应时间
- 内存使用率
- 数据库连接状态
- 用户登录成功率

### 3. 告警机制

系统会在以下情况发送告警：
- 服务进程异常退出
- 内存使用超过阈值
- 数据库健康检查失败
- 连续重启失败

## 故障排查

### 1. 登录失败排查步骤

```bash
# 1. 检查服务状态
pm2 list
pm2 logs caiwu-backend

# 2. 检查数据库健康
node scripts/health-check.js

# 3. 检查网络连接
curl -X POST http://localhost:3001/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}'

# 4. 检查数据库用户
sqlite3 src/db.sqlite "SELECT * FROM users;"
```

### 2. 常见问题解决

#### 问题：数据库文件损坏
```bash
# 备份当前数据库
cp src/db.sqlite src/db.sqlite.backup

# 强制重新初始化
rm src/db.sqlite
node scripts/health-check.js --repair
```

#### 问题：PM2进程无响应
```bash
# 重启进程
pm2 restart caiwu-backend

# 如果无效，删除并重新启动
pm2 delete caiwu-backend
pm2 start ecosystem.config.js
```

#### 问题：内存泄漏
```bash
# 查看内存使用
pm2 monit

# 设置内存限制重启
pm2 restart caiwu-backend --max-memory-restart 500M
```

## 维护计划

### 1. 定期维护任务

- **每日**: 检查日志和告警
- **每周**: 检查磁盘空间和数据库大小
- **每月**: 更新依赖包和安全补丁
- **每季度**: 备份数据库和配置文件

### 2. 备份策略

```bash
# 数据库备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/caiwu"
mkdir -p $BACKUP_DIR

# 备份数据库
cp /home/ubuntu/caiwu/backend/src/db.sqlite $BACKUP_DIR/db_$DATE.sqlite

# 备份配置文件
cp /home/ubuntu/caiwu/backend/.env $BACKUP_DIR/env_$DATE.backup

# 清理30天前的备份
find $BACKUP_DIR -name "*.sqlite" -mtime +30 -delete
find $BACKUP_DIR -name "*.backup" -mtime +30 -delete
```

### 3. 更新部署

```bash
# 1. 备份当前版本
cp -r /home/ubuntu/caiwu /home/ubuntu/caiwu_backup_$(date +%Y%m%d)

# 2. 拉取最新代码
cd /home/ubuntu/caiwu
git pull origin main

# 3. 更新依赖
cd backend && npm install
cd ../frontend && npm install && npm run build

# 4. 重启服务
pm2 restart caiwu-backend

# 5. 验证服务
node scripts/health-check.js
```

## 数据库迁移管理

### 统一迁移系统

项目现在包含统一的数据库迁移管理系统，防止"已修复bug再次出现"的问题：

```bash
# 执行所有待执行的迁移
node backend/scripts/migrate.js

# 查看迁移状态
node backend/scripts/migrate.js --status

# 强制重新执行所有迁移
node backend/scripts/migrate.js --force
```

### 迁移文件规范

- 文件命名：`NNNN_description.js` (如 `0007_add_loan_remark.js`)
- 必须包含 `up()` 函数用于执行迁移
- 可选包含 `down()` 函数用于回滚

### 防止Bug复现

1. **所有数据库结构变更必须通过迁移文件**
2. **服务器启动时自动执行待执行的迁移**
3. **迁移执行记录保存在 `migrations` 表中**

## 版本控制建议

### 🚨 强烈建议立即实施版本控制

当前项目没有使用Git版本控制，这是导致"已修复bug再次出现"的主要原因：

```bash
# 初始化Git仓库
cd /home/ubuntu/caiwu
git init
git add .
git commit -m "Initial commit - production environment"

# 设置远程仓库（推荐）
git remote add origin <your-repository-url>
git push -u origin main
```

### 版本控制最佳实践

1. **所有代码变更都通过Git管理**
2. **生产环境部署使用Git拉取代码**
3. **建立开发、测试、生产环境分支策略**
4. **重要修复打标签记录**

### 部署流程改进

```bash
# 标准部署流程
git pull origin main
npm install
node backend/scripts/migrate.js
pm2 restart caiwu-backend
```

## 默认用户信息

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | 123456 | admin | 系统管理员 |
| user | 123456 | employee | 普通员工 |
| finance | 123456 | finance | 财务人员 |
| gm | 123456 | manager | 总经理 |

## 故障预防检查清单

### 部署前检查
- [ ] 代码已提交到版本控制系统
- [ ] 数据库迁移文件已创建
- [ ] 迁移在测试环境验证通过
- [ ] 备份当前生产数据库

### 部署后验证
- [ ] 迁移执行成功：`node backend/scripts/migrate.js --status`
- [ ] 健康检查通过：`node backend/scripts/health-check.js`
- [ ] 关键功能测试通过
- [ ] 日志无异常错误

## 联系和支持

如遇到无法自动解决的问题，请：

1. 查看告警日志: `tail -f backend/src/logs/alerts.log`
2. 检查迁移状态: `node backend/scripts/migrate.js --status`
3. 运行诊断工具: `node backend/scripts/diagnose.js`
4. 收集相关日志信息
5. 联系技术支持团队

通过以上自动化机制和版本控制，系统能够在大多数情况下自动检测和修复问题，并防止已修复的问题再次出现。

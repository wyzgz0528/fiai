# 环境管理指南

## 环境概述

### 当前推荐：两环境模式

```
开发环境 (本地)          生产环境 (服务器)
├── 本地开发调试         ├── 真实用户使用
├── 快速迭代测试         ├── 稳定性优先
├── 详细错误信息         ├── 性能优化
└── 测试数据            └── 真实数据
```

## 环境配置

### 1. 开发环境配置

**位置**：开发者本地电脑
**用途**：日常开发、功能测试、bug修复

```bash
# 环境变量
NODE_ENV=development

# 启动方式
cd backend && npm start &
cd frontend && npm run dev

# 访问地址
前端: http://localhost:5173
后端: http://localhost:3001
```

**特点**：
- ✅ 热重载，代码变更立即生效
- ✅ 详细的错误堆栈信息
- ✅ 开发工具集成
- ✅ 可以随意重置数据库

### 2. 生产环境配置

**位置**：服务器 (bao.intellnet.site)
**用途**：真实用户使用

```bash
# 环境变量
NODE_ENV=production

# 启动方式
pm2 start ecosystem.config.js
node scripts/monitor.js --daemon

# 访问地址
https://bao.intellnet.site
```

**特点**：
- ✅ PM2进程管理，自动重启
- ✅ 错误日志记录
- ✅ 性能监控
- ✅ 数据备份机制

## 环境差异配置

### 数据库配置

```javascript
// 开发环境
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/home/ubuntu/caiwu/backend/src/db.sqlite'
  : './src/db_dev.sqlite';
```

### 日志配置

```javascript
// 开发环境：控制台输出
// 生产环境：文件记录
const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
```

### 错误处理

```javascript
// 开发环境：详细错误信息
// 生产环境：简化错误信息
const showStackTrace = process.env.NODE_ENV !== 'production';
```

## 部署流程

### 开发到生产的标准流程

```bash
# 1. 本地开发和测试
npm run dev
# 测试功能是否正常

# 2. 构建生产版本
cd frontend
npm run build

# 3. 部署到生产环境
# 方式一：直接复制文件
scp -r dist/ user@server:/path/to/frontend/
scp -r backend/ user@server:/path/to/backend/

# 方式二：使用Git（推荐）
git add .
git commit -m "新功能完成"
git push origin main

# 在服务器上
git pull origin main
npm install
node backend/scripts/migrate.js
pm2 restart caiwu-backend
```

## 何时需要测试环境？

### 当前不需要测试环境的原因：

1. **项目规模小**：功能相对简单
2. **用户数量少**：4个用户，风险可控
3. **开发团队小**：可能只有1-2个开发者
4. **资源有限**：避免额外服务器成本

### 未来需要测试环境的信号：

1. **用户数量增长**：超过20个用户
2. **功能复杂化**：涉及支付、集成等关键功能
3. **团队扩大**：多个开发者协作
4. **数据重要性**：财务数据不能出错
5. **发布频率高**：每周多次发布

## 测试环境搭建（可选）

如果未来需要测试环境，可以这样搭建：

### 方案一：同服务器不同端口

```bash
# 生产环境
https://bao.intellnet.site (端口80/443)

# 测试环境  
https://test.bao.intellnet.site (端口8080)
```

### 方案二：独立服务器

```bash
# 生产环境
https://bao.intellnet.site

# 测试环境
https://staging.bao.intellnet.site
```

### 测试环境配置

```bash
# 环境变量
NODE_ENV=staging

# 数据库
使用生产数据的副本，但定期重置

# 部署
自动化部署，每次代码提交后自动更新
```

## 环境管理最佳实践

### 1. 配置文件管理

```bash
# 不同环境使用不同配置文件
.env.development    # 开发环境
.env.production     # 生产环境
.env.staging        # 测试环境（可选）
```

### 2. 数据库管理

```bash
# 开发环境：可以随意重置
rm backend/src/db_dev.sqlite
node backend/scripts/health-check.js --repair

# 生产环境：谨慎操作，必须备份
cp backend/src/db.sqlite backup/db_$(date +%Y%m%d).sqlite
```

### 3. 部署检查清单

**部署前检查**：
- [ ] 本地功能测试通过
- [ ] 数据库迁移文件已创建
- [ ] 配置文件已更新
- [ ] 依赖包已安装

**部署后验证**：
- [ ] 服务正常启动
- [ ] 健康检查通过
- [ ] 关键功能测试
- [ ] 日志无异常

## 推荐的渐进式策略

### 阶段一：当前状态（推荐）
```
开发环境 → 生产环境
```
- 适合当前项目规模
- 成本低，维护简单
- 风险可控

### 阶段二：项目成长期
```
开发环境 → 测试环境 → 生产环境
```
- 用户数量增长时
- 功能复杂化时
- 团队扩大时

### 阶段三：企业级
```
开发环境 → 测试环境 → 预生产环境 → 生产环境
```
- 大型企业应用
- 关键业务系统
- 严格的质量要求

## 总结

**对于您当前的项目**：
- ✅ **推荐使用两环境模式**（开发 + 生产）
- ✅ **重点关注代码质量和本地测试**
- ✅ **建立良好的部署流程**
- ✅ **监控生产环境状态**

**何时考虑添加测试环境**：
- 用户数量超过20个
- 功能涉及关键业务逻辑
- 团队有多个开发者
- 发布频率较高

记住：**环境的数量不是越多越好，而是要适合项目的实际需求和团队能力**。

# 企业财务管理系统 V2.0版本

一个基于 Node.js + React 的现代化企业财务管理系统，支持借款申请、报销管理、OCR发票识别等功能。

## 🚀 功能特性

### 核心功能
- **借款管理**：借款申请、审批、还款跟踪
- **报销管理**：报销申请、审批、打款流程
- **OCR识别**：Azure Document Intelligence 发票自动识别
- **PDF生成**：自动生成报销单和借款单PDF
- **Excel导出**：支持借款记录和报销记录导出
- **权限管理**：多角色权限控制（员工/财务/总经理/管理员）

### 技术特性
- **前端**：React 18 + Ant Design + Vite
- **后端**：Node.js + Express + SQLite
- **文件处理**：Multer + Sharp + PDF-lib
- **OCR服务**：Azure Document Intelligence
- **认证**：JWT Token

## 📁 项目结构

```
caiwu/                    # 企业财务管理系统V2.0版本
├── install.bat          # Windows安装脚本
├── install.sh           # Linux安装脚本  
├── start.bat            # Windows启动脚本
├── start.sh             # Linux启动脚本
├── README.md            # 项目说明文档
├── backend/             # 后端服务
│   ├── src/            # 核心源代码
│   │   ├── routes/     # API路由
│   │   ├── middlewares/ # 中间件
│   │   ├── utils/      # 工具函数
│   │   └── server.js   # 服务器入口
│   ├── database.db     # SQLite数据库
│   ├── uploads/        # 文件上传目录
│   │   └── vouchers/   # PDF凭证存储
│   └── package.json    # 后端依赖配置
└── frontend/           # 前端应用
    ├── src/           # 核心源代码
    │   ├── pages/     # 页面组件
    │   ├── components/ # 通用组件
    │   └── utils/     # 工具函数
    ├── index.html     # 入口HTML文件
    ├── vite.config.js # 构建配置
    └── package.json   # 前端依赖配置
```

## 🛠️ 快速开始

### Windows用户
1. **安装依赖**：双击 `install.bat`
2. **启动系统**：双击 `start.bat`
3. **访问系统**：http://localhost:5173

### Linux用户
1. **设置权限**：`chmod +x install.sh start.sh`
2. **安装依赖**：`./install.sh`
3. **启动系统**：`./start.sh`
4. **访问系统**：http://localhost:5173

## 👥 默认账户

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | 管理员 | 系统管理员 |
| finance | finance123 | 财务 | 财务人员 |
| manager | manager123 | 总经理 | 审批管理 |
| employee | employee123 | 员工 | 普通员工 |

## 📋 主要功能模块

### 员工功能
- 借款申请和查看
- 报销申请和查看
- OCR发票识别
- 个人信息管理

### 财务功能
- 借款审批和管理
- 报销审核和打款
- 导出借款记录Excel
- 导出报销记录Excel
- 批量下载报销单PDF

### 总经理功能
- 借款最终审批
- 报销最终审批
- 统计分析查看

### 管理员功能
- 用户管理
- 报销类型管理
- 数据备份恢复
- 系统数据清理

## 🔧 手动部署

### 环境要求
- Node.js 16+
- npm 或 yarn

### 1. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 配置环境变量

在 `backend/.env` 文件中配置：

```env
PORT=3001
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Azure Document Intelligence 配置
AZURE_FORM_RECOGNIZER_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_FORM_RECOGNIZER_KEY=your-api-key
AZURE_CUSTOM_MODEL_ID=wangyizhe0825
AZURE_API_VERSION=2024-11-30
AZURE_USE_DOCUMENT_INTELLIGENCE=true

# OCR引擎配置
OCR_PRIMARY_ENGINE=azure
OCR_FALLBACK_ENABLED=false
```

### 3. 启动服务

```bash
# 启动后端服务
cd backend
npm start

# 启动前端服务（新终端）
cd frontend
npm run dev
```

## 🎯 生产部署

### 1. 构建前端

```bash
cd frontend
npm run build
```

### 2. 配置生产环境

- 修改 `.env` 中的 `CORS_ORIGINS` 为生产域名
- 配置反向代理（Nginx）
- 设置进程管理器（PM2）

### 3. 启动生产服务

```bash
# 使用PM2启动后端
pm2 start backend/src/server.js --name "caiwu-backend"

# 配置Nginx服务前端静态文件
```

## 📝 更新日志

### V2.0版本
- ✅ 完善的借款和报销管理流程
- ✅ Azure OCR发票识别集成
- ✅ PDF自动生成和下载
- ✅ Excel数据导出功能
- ✅ 多角色权限管理
- ✅ 响应式界面设计
- ✅ 项目大幅精简优化：
  - 删除了810MB的Python OCR环境
  - 删除了所有测试文件和文档
  - 精简了package.json依赖
  - 项目体积从3.2GB优化到约50MB（不含node_modules）

## 📞 技术支持

如有问题，请检查：
1. Node.js版本是否符合要求
2. 环境变量配置是否正确
3. 数据库文件权限是否正常
4. Azure OCR服务是否可用

---

**企业财务管理系统 V2.0版本** - 让财务管理更简单高效！

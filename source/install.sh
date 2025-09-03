#!/bin/bash

echo "安装企业财务管理系统 V2.0版本"
echo "================================"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js 16+ 版本"
    echo "Ubuntu/Debian: sudo apt install nodejs npm"
    echo "CentOS/RHEL: sudo yum install nodejs npm"
    echo "或访问: https://nodejs.org/"
    exit 1
fi

echo "Node.js 版本:"
node --version

echo ""
echo "1. 安装后端依赖..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "后端依赖安装失败！"
    exit 1
fi

echo ""
echo "2. 安装前端依赖..."
cd ../frontend
npm install
if [ $? -ne 0 ]; then
    echo "前端依赖安装失败！"
    exit 1
fi

cd ..
echo ""
echo "================================"
echo "安装完成！"
echo "================================"
echo ""
echo "使用方法:"
echo "1. 运行 ./start.sh 启动系统"
echo "2. 或者手动启动:"
echo "   - 后端: cd backend && npm start"
echo "   - 前端: cd frontend && npm run dev"
echo ""
echo "访问地址: http://localhost:5173"
echo ""

# 设置启动脚本可执行权限
chmod +x start.sh

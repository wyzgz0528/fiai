#!/bin/bash

echo "启动企业财务管理系统 V2.0版本"
echo "================================"

# 检查是否为生产环境
if [ "$NODE_ENV" = "production" ]; then
    echo "生产环境启动模式"
    echo ""

    echo "1. 执行健康检查..."
    cd backend
    node scripts/health-check.js
    if [ $? -ne 0 ]; then
        echo "❌ 健康检查失败，尝试修复..."
        node scripts/health-check.js --repair
        if [ $? -ne 0 ]; then
            echo "❌ 自动修复失败，请检查系统状态"
            exit 1
        fi
    fi

    echo "2. 启动PM2服务..."
    pm2 start ecosystem.config.js

    echo "3. 启动监控守护进程..."
    node scripts/monitor.js --daemon

    echo ""
    echo "✅ 生产环境启动完成！"
    echo "服务地址: https://bao.intellnet.site"
    echo "后端API: https://bao.intellnet.site/api"
    echo ""
    echo "监控命令:"
    echo "- 查看服务状态: pm2 list"
    echo "- 查看日志: pm2 logs caiwu-backend"
    echo "- 健康检查: node backend/scripts/health-check.js"
    echo "- 监控状态: node backend/scripts/monitor.js --once"

else
    echo "开发环境启动模式"
    echo ""

    echo "1. 启动后端服务..."
    cd backend
    npm start &
    BACKEND_PID=$!

    echo "2. 等待5秒..."
    sleep 5

    echo "3. 启动前端服务..."
    cd ../frontend
    npm run dev &
    FRONTEND_PID=$!

    echo ""
    echo "✅ 开发环境启动完成！"
    echo "前端地址: http://localhost:5173"
    echo "后端API: http://localhost:3001"
    echo ""
    echo "按 Ctrl+C 停止服务"

    # 等待用户中断
    trap "echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
    wait
fi

echo ""
echo "默认登录账户:"
echo "- admin/123456 (系统管理员)"
echo "- user/123456 (普通员工)"
echo "- finance/123456 (财务人员)"
echo "- gm/123456 (总经理)"
echo ""
echo "注意: 生产环境请及时修改默认密码！"

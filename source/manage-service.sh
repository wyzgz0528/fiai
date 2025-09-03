#!/bin/bash

# 财务系统服务管理脚本
# 使用方法: ./manage-service.sh [start|stop|restart|status|logs]

SERVICE_NAME="caiwu-backend"
BACKEND_DIR="/home/ubuntu/caiwu/backend"

case "$1" in
    start)
        echo "🚀 启动财务系统后端服务..."
        cd $BACKEND_DIR
        pm2 start ecosystem.config.js
        echo "✅ 服务启动完成"
        pm2 status
        ;;
    stop)
        echo "🛑 停止财务系统后端服务..."
        pm2 stop $SERVICE_NAME
        echo "✅ 服务已停止"
        ;;
    restart)
        echo "🔄 重启财务系统后端服务..."
        pm2 restart $SERVICE_NAME
        echo "✅ 服务重启完成"
        pm2 status
        ;;
    status)
        echo "📊 财务系统服务状态:"
        pm2 status
        echo ""
        echo "🌐 服务健康检查:"
        curl -s http://localhost:3001/api/health > /dev/null
        if [ $? -eq 0 ]; then
            echo "✅ 后端服务正常 (http://localhost:3001)"
        else
            echo "❌ 后端服务异常"
        fi
        ;;
    logs)
        echo "📋 查看服务日志 (按 Ctrl+C 退出):"
        pm2 logs $SERVICE_NAME
        ;;
    test-login)
        echo "🔐 测试登录功能:"
        response=$(curl -s -X POST http://localhost:3001/api/user/login \
            -H "Content-Type: application/json" \
            -d '{"username":"admin","password":"123456"}')
        
        if echo "$response" | grep -q '"success":true'; then
            echo "✅ 登录测试成功"
        else
            echo "❌ 登录测试失败"
            echo "响应: $response"
        fi
        ;;
    *)
        echo "财务系统服务管理脚本"
        echo ""
        echo "使用方法: $0 {start|stop|restart|status|logs|test-login}"
        echo ""
        echo "命令说明:"
        echo "  start      - 启动服务"
        echo "  stop       - 停止服务"
        echo "  restart    - 重启服务"
        echo "  status     - 查看服务状态"
        echo "  logs       - 查看服务日志"
        echo "  test-login - 测试登录功能"
        echo ""
        exit 1
        ;;
esac

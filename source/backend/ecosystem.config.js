module.exports = {
  apps: [{
    name: 'caiwu-backend',
    script: 'src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    exp_backoff_restart_delay: 100,
    error_file: '/home/ubuntu/.pm2/logs/caiwu-backend-error.log',
    out_file: '/home/ubuntu/.pm2/logs/caiwu-backend-out.log',
    log_file: '/home/ubuntu/.pm2/logs/caiwu-backend-combined.log',
    time: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // 健康检查
    health_check_grace_period: 3000,
    // 优雅关闭
    kill_timeout: 5000,
    listen_timeout: 3000,
    // 自动重启条件
    ignore_watch: ['node_modules', 'logs', 'uploads'],
    // 内存和CPU监控
    monitoring: true
  }]
};

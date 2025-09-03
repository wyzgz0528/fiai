#!/usr/bin/env node

/**
 * 生产环境监控和自动恢复脚本
 * 监控服务状态、数据库健康、内存使用等，并在发现问题时自动恢复
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 设置正确的工作目录
process.chdir(path.join(__dirname, '..'));

const { performHealthCheck, repairDatabase } = require('./health-check');

// 配置
const CONFIG = {
  checkInterval: 30000, // 30秒检查一次
  maxRestartAttempts: 3, // 最大重启尝试次数
  restartCooldown: 60000, // 重启冷却时间
  memoryThreshold: 500 * 1024 * 1024, // 500MB内存阈值
  logRetentionDays: 7 // 日志保留天数
};

let restartAttempts = 0;
let lastRestartTime = 0;

// 日志函数
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;
  
  console.log(logMessage, data);
  
  // 写入日志文件
  try {
    const logDir = path.join(__dirname, '../src/logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'monitor.log');
    fs.appendFileSync(logFile, `${logMessage} ${JSON.stringify(data)}\n`);
  } catch (e) {
    console.error('写入日志失败:', e.message);
  }
}

// 检查PM2进程状态
async function checkPM2Status() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);
    
    const caiwuProcess = processes.find(p => p.name === 'caiwu-backend');
    
    if (!caiwuProcess) {
      log('error', 'PM2进程不存在');
      return { exists: false, status: null, memory: 0, cpu: 0 };
    }
    
    const status = caiwuProcess.pm2_env.status;
    const memory = caiwuProcess.monit.memory;
    const cpu = caiwuProcess.monit.cpu;
    
    log('info', 'PM2进程状态', { 
      status, 
      memory: `${Math.round(memory / 1024 / 1024)}MB`, 
      cpu: `${cpu}%` 
    });
    
    return { exists: true, status, memory, cpu };
  } catch (e) {
    log('error', '检查PM2状态失败', { error: e.message });
    return { exists: false, status: null, memory: 0, cpu: 0 };
  }
}

// 启动PM2进程
async function startPM2Process() {
  try {
    log('info', '启动PM2进程');
    await execAsync('pm2 start ecosystem.config.js');
    
    // 等待进程启动
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const status = await checkPM2Status();
    if (status.exists && status.status === 'online') {
      log('info', 'PM2进程启动成功');
      return true;
    } else {
      log('error', 'PM2进程启动失败');
      return false;
    }
  } catch (e) {
    log('error', 'PM2启动异常', { error: e.message });
    return false;
  }
}

// 重启PM2进程
async function restartPM2Process() {
  const now = Date.now();
  
  // 检查冷却时间
  if (now - lastRestartTime < CONFIG.restartCooldown) {
    log('warn', '重启冷却中，跳过重启');
    return false;
  }
  
  // 检查重启次数
  if (restartAttempts >= CONFIG.maxRestartAttempts) {
    log('error', '达到最大重启次数，停止自动重启');
    return false;
  }
  
  try {
    log('info', '重启PM2进程', { attempt: restartAttempts + 1 });
    
    await execAsync('pm2 restart caiwu-backend');
    
    // 等待重启完成
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const status = await checkPM2Status();
    if (status.exists && status.status === 'online') {
      log('info', 'PM2进程重启成功');
      restartAttempts = 0; // 重置重启计数
      lastRestartTime = now;
      return true;
    } else {
      log('error', 'PM2进程重启失败');
      restartAttempts++;
      lastRestartTime = now;
      return false;
    }
  } catch (e) {
    log('error', 'PM2重启异常', { error: e.message });
    restartAttempts++;
    lastRestartTime = now;
    return false;
  }
}

// 清理旧日志
function cleanupOldLogs() {
  try {
    const logDir = path.join(__dirname, '../src/logs');
    if (!fs.existsSync(logDir)) return;
    
    const files = fs.readdirSync(logDir);
    const cutoffTime = Date.now() - (CONFIG.logRetentionDays * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime.getTime() < cutoffTime) {
        fs.unlinkSync(filePath);
        log('info', '清理旧日志文件', { file });
      }
    });
  } catch (e) {
    log('error', '清理日志失败', { error: e.message });
  }
}

// 发送告警通知（可扩展为邮件、短信等）
function sendAlert(message, data = {}) {
  log('alert', message, data);
  
  // 这里可以集成告警系统，如邮件、短信、钉钉等
  // 示例：写入告警文件
  try {
    const alertFile = path.join(__dirname, '../src/logs/alerts.log');
    const alertMessage = `${new Date().toISOString()} ALERT: ${message} ${JSON.stringify(data)}\n`;
    fs.appendFileSync(alertFile, alertMessage);
  } catch (e) {
    console.error('写入告警失败:', e.message);
  }
}

// 主监控循环
async function monitorLoop() {
  log('info', '开始监控循环');
  
  while (true) {
    try {
      // 1. 检查PM2进程状态
      const pm2Status = await checkPM2Status();
      
      if (!pm2Status.exists) {
        sendAlert('PM2进程不存在，尝试启动');
        const started = await startPM2Process();
        if (!started) {
          sendAlert('PM2进程启动失败，需要人工干预');
        }
      } else if (pm2Status.status !== 'online') {
        sendAlert('PM2进程状态异常', { status: pm2Status.status });
        const restarted = await restartPM2Process();
        if (!restarted) {
          sendAlert('PM2进程重启失败，需要人工干预');
        }
      } else if (pm2Status.memory > CONFIG.memoryThreshold) {
        sendAlert('内存使用过高', { 
          memory: `${Math.round(pm2Status.memory / 1024 / 1024)}MB`,
          threshold: `${Math.round(CONFIG.memoryThreshold / 1024 / 1024)}MB`
        });
        const restarted = await restartPM2Process();
        if (!restarted) {
          sendAlert('内存过高重启失败，需要人工干预');
        }
      }
      
      // 2. 执行健康检查
      const healthResult = await performHealthCheck();
      if (!healthResult.healthy) {
        sendAlert('健康检查失败', healthResult);
        
        // 尝试自动修复数据库问题
        if (healthResult.issues.includes('database_health') || 
            healthResult.issues.includes('database_file')) {
          log('info', '尝试自动修复数据库问题');
          const repaired = await repairDatabase();
          if (!repaired) {
            sendAlert('数据库自动修复失败，需要人工干预');
          }
        }
      }
      
      // 3. 清理旧日志（每小时执行一次）
      if (Date.now() % (60 * 60 * 1000) < CONFIG.checkInterval) {
        cleanupOldLogs();
      }
      
    } catch (e) {
      log('error', '监控循环异常', { error: e.message });
      sendAlert('监控系统异常', { error: e.message });
    }
    
    // 等待下次检查
    await new Promise(resolve => setTimeout(resolve, CONFIG.checkInterval));
  }
}

// 命令行参数处理
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--once')) {
    log('info', '执行单次监控检查');
    
    const pm2Status = await checkPM2Status();
    const healthResult = await performHealthCheck();
    
    console.log('\n=== 监控报告 ===');
    console.log('PM2状态:', pm2Status);
    console.log('健康检查:', healthResult);
    
    process.exit(0);
  }
  
  if (args.includes('--daemon')) {
    log('info', '启动守护进程模式');
    
    // 分离进程
    const { spawn } = require('child_process');
    const child = spawn(process.argv[0], [__filename], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    
    console.log('监控守护进程已启动，PID:', child.pid);
    process.exit(0);
  }
  
  // 默认启动监控循环
  await monitorLoop();
}

// 错误处理
process.on('uncaughtException', (error) => {
  log('error', '未捕获的异常', { error: error.message, stack: error.stack });
  sendAlert('监控进程异常退出', { error: error.message });
});

process.on('unhandledRejection', (reason) => {
  log('error', '未处理的Promise拒绝', { reason: reason?.message || String(reason) });
  sendAlert('监控进程Promise异常', { reason: reason?.message || String(reason) });
});

// 优雅退出
process.on('SIGTERM', () => {
  log('info', '收到SIGTERM信号，正在退出监控');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', '收到SIGINT信号，正在退出监控');
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    log('error', '监控脚本执行失败', { error: error.message });
    process.exit(1);
  });
}

module.exports = { monitorLoop, checkPM2Status, startPM2Process, restartPM2Process };

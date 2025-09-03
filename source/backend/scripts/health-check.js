#!/usr/bin/env node

/**
 * 生产环境健康检查和自动恢复脚本
 * 用于监控数据库状态、用户数据完整性，并在发现问题时自动修复
 */

const path = require('path');
const fs = require('fs');

// 设置正确的工作目录
process.chdir(path.join(__dirname, '..'));

const { seedDefaultUsers, checkDatabaseHealth } = require('../src/migrations/seed_default_users');
const { ensureCoreTables } = require('../src/migrations/ensure_core_tables');

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
    
    const logFile = path.join(logDir, 'health-check.log');
    fs.appendFileSync(logFile, `${logMessage} ${JSON.stringify(data)}\n`);
  } catch (e) {
    console.error('写入日志失败:', e.message);
  }
}

// 检查数据库文件是否存在
function checkDatabaseFile() {
  const dbPath = path.join(__dirname, '../src/db.sqlite');
  const exists = fs.existsSync(dbPath);
  
  if (!exists) {
    log('error', '数据库文件不存在', { path: dbPath });
    return false;
  }
  
  const stats = fs.statSync(dbPath);
  if (stats.size === 0) {
    log('error', '数据库文件为空', { path: dbPath, size: stats.size });
    return false;
  }
  
  log('info', '数据库文件检查通过', { path: dbPath, size: stats.size });
  return true;
}

// 检查服务端口是否可用
function checkServicePort() {
  return new Promise((resolve) => {
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/user/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      log('info', '服务端口检查通过', { port: 3001, status: res.statusCode });
      resolve(true);
    });
    
    req.on('error', (e) => {
      log('error', '服务端口检查失败', { port: 3001, error: e.message });
      resolve(false);
    });
    
    req.on('timeout', () => {
      log('error', '服务端口检查超时', { port: 3001 });
      req.destroy();
      resolve(false);
    });
    
    // 发送测试登录请求
    req.write(JSON.stringify({ username: 'admin', password: '123456' }));
    req.end();
  });
}

// 修复数据库问题
async function repairDatabase() {
  log('info', '开始修复数据库');
  
  try {
    // 确保核心表存在
    ensureCoreTables();
    log('info', '核心表检查完成');
    
    // 重新初始化用户数据
    await seedDefaultUsers();
    log('info', '用户数据修复完成');
    
    // 再次检查健康状态
    const isHealthy = checkDatabaseHealth();
    if (isHealthy) {
      log('info', '数据库修复成功');
      return true;
    } else {
      log('error', '数据库修复后仍然不健康');
      return false;
    }
  } catch (e) {
    log('error', '数据库修复失败', { error: e.message });
    return false;
  }
}

// 主健康检查函数
async function performHealthCheck() {
  log('info', '开始健康检查');
  
  let issues = [];
  
  // 1. 检查数据库文件
  if (!checkDatabaseFile()) {
    issues.push('database_file');
  }
  
  // 2. 检查数据库健康状态
  if (!checkDatabaseHealth()) {
    issues.push('database_health');
  }
  
  // 3. 检查服务端口
  const serviceOk = await checkServicePort();
  if (!serviceOk) {
    issues.push('service_port');
  }
  
  if (issues.length === 0) {
    log('info', '✅ 所有健康检查通过');
    return { healthy: true, issues: [] };
  }
  
  log('warn', '发现健康问题', { issues });
  
  // 尝试自动修复数据库相关问题
  if (issues.includes('database_file') || issues.includes('database_health')) {
    log('info', '尝试自动修复数据库问题');
    const repaired = await repairDatabase();
    
    if (repaired) {
      // 重新检查
      const recheck = checkDatabaseHealth();
      if (recheck) {
        issues = issues.filter(i => i !== 'database_health' && i !== 'database_file');
        log('info', '数据库问题已修复');
      }
    }
  }
  
  return { healthy: issues.length === 0, issues };
}

// 生成健康报告
function generateHealthReport(result) {
  const report = {
    timestamp: new Date().toISOString(),
    healthy: result.healthy,
    issues: result.issues,
    recommendations: []
  };
  
  if (result.issues.includes('service_port')) {
    report.recommendations.push('检查服务是否正在运行: pm2 list');
    report.recommendations.push('重启服务: pm2 restart caiwu-backend');
  }
  
  if (result.issues.includes('database_file')) {
    report.recommendations.push('检查数据库文件权限和磁盘空间');
  }
  
  if (result.issues.includes('database_health')) {
    report.recommendations.push('运行数据库修复: node scripts/health-check.js --repair');
  }
  
  return report;
}

// 命令行参数处理
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--repair')) {
    log('info', '执行强制修复模式');
    const success = await repairDatabase();
    process.exit(success ? 0 : 1);
  }
  
  if (args.includes('--continuous')) {
    log('info', '启动连续监控模式');
    setInterval(async () => {
      const result = await performHealthCheck();
      if (!result.healthy) {
        log('error', '健康检查失败，需要人工干预', result);
      }
    }, 60000); // 每分钟检查一次
    return;
  }
  
  // 默认执行一次健康检查
  const result = await performHealthCheck();
  const report = generateHealthReport(result);
  
  console.log('\n=== 健康检查报告 ===');
  console.log(JSON.stringify(report, null, 2));
  
  if (!result.healthy) {
    console.log('\n建议执行以下操作:');
    report.recommendations.forEach(rec => console.log(`- ${rec}`));
  }
  
  process.exit(result.healthy ? 0 : 1);
}

// 错误处理
process.on('uncaughtException', (error) => {
  log('error', '未捕获的异常', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', '未处理的Promise拒绝', { reason: reason?.message || String(reason) });
  process.exit(1);
});

if (require.main === module) {
  main().catch(error => {
    log('error', '健康检查脚本执行失败', { error: error.message });
    process.exit(1);
  });
}

module.exports = { performHealthCheck, repairDatabase, generateHealthReport };

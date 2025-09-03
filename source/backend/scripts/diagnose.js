#!/usr/bin/env node

/**
 * 快速诊断脚本
 * 用于快速检查系统状态，诊断登录失败等常见问题
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 设置正确的工作目录
process.chdir(path.join(__dirname, '..'));

const bcrypt = require('bcryptjs');

console.log('🔍 企业财务管理系统 - 快速诊断工具');
console.log('=====================================\n');

// 诊断结果收集
const diagnostics = {
  timestamp: new Date().toISOString(),
  issues: [],
  warnings: [],
  info: [],
  recommendations: []
};

function addIssue(message, details = {}) {
  console.log(`❌ ${message}`);
  diagnostics.issues.push({ message, details });
}

function addWarning(message, details = {}) {
  console.log(`⚠️  ${message}`);
  diagnostics.warnings.push({ message, details });
}

function addInfo(message, details = {}) {
  console.log(`ℹ️  ${message}`);
  diagnostics.info.push({ message, details });
}

function addRecommendation(message) {
  diagnostics.recommendations.push(message);
}

// 1. 检查数据库文件
function checkDatabaseFile() {
  console.log('1. 检查数据库文件...');
  
  const dbPath = path.join(__dirname, '../src/db.sqlite');
  
  if (!fs.existsSync(dbPath)) {
    addIssue('数据库文件不存在', { path: dbPath });
    addRecommendation('运行: node scripts/health-check.js --repair');
    return false;
  }
  
  const stats = fs.statSync(dbPath);
  if (stats.size === 0) {
    addIssue('数据库文件为空', { path: dbPath });
    addRecommendation('运行: node scripts/health-check.js --repair');
    return false;
  }
  
  addInfo(`数据库文件正常 (${Math.round(stats.size / 1024)}KB)`, { path: dbPath });
  return true;
}

// 2. 检查数据库用户数据
function checkDatabaseUsers() {
  console.log('\n2. 检查数据库用户数据...');
  
  try {
    const db = require('../src/db');
    
    // 检查用户表是否存在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
    if (tables.length === 0) {
      addIssue('用户表不存在');
      addRecommendation('运行: node scripts/health-check.js --repair');
      return false;
    }
    
    // 检查用户数量
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
      addIssue('用户表为空');
      addRecommendation('运行: node scripts/health-check.js --repair');
      return false;
    }
    
    addInfo(`用户表存在，共 ${userCount} 个用户`);
    
    // 检查默认用户
    const defaultUsers = ['admin', 'user', 'finance', 'gm'];
    const missingUsers = [];
    const passwordIssues = [];
    
    for (const username of defaultUsers) {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) {
        missingUsers.push(username);
      } else {
        // 验证密码
        const isValidPassword = bcrypt.compareSync('123456', user.password);
        if (!isValidPassword) {
          passwordIssues.push(username);
        }
      }
    }
    
    if (missingUsers.length > 0) {
      addWarning(`缺失默认用户: ${missingUsers.join(', ')}`);
      addRecommendation('运行: node scripts/health-check.js --repair');
    }
    
    if (passwordIssues.length > 0) {
      addWarning(`用户密码异常: ${passwordIssues.join(', ')}`);
      addRecommendation('运行: node scripts/health-check.js --repair');
    }
    
    if (missingUsers.length === 0 && passwordIssues.length === 0) {
      addInfo('所有默认用户正常');
    }
    
    return true;
  } catch (e) {
    addIssue('数据库连接失败', { error: e.message });
    addRecommendation('检查数据库文件权限和完整性');
    return false;
  }
}

// 3. 检查PM2进程状态
async function checkPM2Status() {
  console.log('\n3. 检查PM2进程状态...');
  
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);
    
    const caiwuProcess = processes.find(p => p.name === 'caiwu-backend');
    
    if (!caiwuProcess) {
      addWarning('PM2进程不存在');
      addRecommendation('运行: pm2 start ecosystem.config.js');
      return false;
    }
    
    const status = caiwuProcess.pm2_env.status;
    const memory = Math.round(caiwuProcess.monit.memory / 1024 / 1024);
    const cpu = caiwuProcess.monit.cpu;
    const uptime = Math.round((Date.now() - caiwuProcess.pm2_env.pm_uptime) / 1000);
    
    if (status !== 'online') {
      addIssue(`PM2进程状态异常: ${status}`);
      addRecommendation('运行: pm2 restart caiwu-backend');
      return false;
    }
    
    addInfo(`PM2进程正常 (内存: ${memory}MB, CPU: ${cpu}%, 运行时间: ${uptime}s)`);
    
    if (memory > 400) {
      addWarning(`内存使用较高: ${memory}MB`);
      addRecommendation('考虑重启进程: pm2 restart caiwu-backend');
    }
    
    return true;
  } catch (e) {
    addWarning('无法获取PM2状态', { error: e.message });
    addRecommendation('检查PM2是否安装: npm install -g pm2');
    return false;
  }
}

// 4. 检查服务端口
async function checkServicePort() {
  console.log('\n4. 检查服务端口...');
  
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
      if (res.statusCode === 200) {
        addInfo('服务端口正常响应');
        resolve(true);
      } else {
        addWarning(`服务端口响应异常: ${res.statusCode}`);
        resolve(false);
      }
    });
    
    req.on('error', (e) => {
      addIssue('服务端口无法连接', { error: e.message });
      addRecommendation('检查服务是否启动: pm2 list');
      resolve(false);
    });
    
    req.on('timeout', () => {
      addWarning('服务端口响应超时');
      req.destroy();
      resolve(false);
    });
    
    // 发送测试登录请求
    req.write(JSON.stringify({ username: 'admin', password: '123456' }));
    req.end();
  });
}

// 5. 测试登录功能
async function testLogin() {
  console.log('\n5. 测试登录功能...');
  
  const testUsers = [
    { username: 'admin', role: 'admin' },
    { username: 'user', role: 'employee' },
    { username: 'finance', role: 'finance' },
    { username: 'gm', role: 'manager' }
  ];
  
  let successCount = 0;
  
  for (const testUser of testUsers) {
    try {
      const response = await new Promise((resolve, reject) => {
        const http = require('http');
        const postData = JSON.stringify({
          username: testUser.username,
          password: '123456'
        });
        
        const options = {
          hostname: 'localhost',
          port: 3001,
          path: '/api/user/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 5000
        };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({ statusCode: res.statusCode, data: result });
            } catch (e) {
              reject(new Error('响应解析失败'));
            }
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('请求超时'));
        });
        
        req.write(postData);
        req.end();
      });
      
      if (response.statusCode === 200 && response.data.success) {
        addInfo(`用户 ${testUser.username} 登录成功`);
        successCount++;
      } else {
        addWarning(`用户 ${testUser.username} 登录失败`, { 
          status: response.statusCode, 
          error: response.data.error || response.data.message 
        });
      }
    } catch (e) {
      addWarning(`用户 ${testUser.username} 登录测试异常`, { error: e.message });
    }
  }
  
  if (successCount === testUsers.length) {
    addInfo('所有用户登录测试通过');
    return true;
  } else {
    addWarning(`${testUsers.length - successCount} 个用户登录失败`);
    return false;
  }
}

// 6. 检查系统资源
async function checkSystemResources() {
  console.log('\n6. 检查系统资源...');
  
  try {
    // 检查磁盘空间
    const { stdout: dfOutput } = await execAsync('df -h .');
    const lines = dfOutput.trim().split('\n');
    if (lines.length > 1) {
      const diskInfo = lines[1].split(/\s+/);
      const usage = diskInfo[4];
      addInfo(`磁盘使用率: ${usage}`);
      
      const usagePercent = parseInt(usage.replace('%', ''));
      if (usagePercent > 90) {
        addWarning('磁盘空间不足');
        addRecommendation('清理磁盘空间或扩容');
      }
    }
    
    // 检查内存使用
    const { stdout: memOutput } = await execAsync('free -h');
    const memLines = memOutput.trim().split('\n');
    if (memLines.length > 1) {
      addInfo('内存信息已获取');
    }
    
  } catch (e) {
    addWarning('无法获取系统资源信息', { error: e.message });
  }
}

// 主诊断函数
async function runDiagnosis() {
  const startTime = Date.now();
  
  // 执行所有检查
  const dbFileOk = checkDatabaseFile();
  const dbUsersOk = checkDatabaseUsers();
  const pm2Ok = await checkPM2Status();
  const portOk = await checkServicePort();
  const loginOk = await testLogin();
  await checkSystemResources();
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log('\n=====================================');
  console.log('📊 诊断结果汇总');
  console.log('=====================================');
  
  console.log(`⏱️  诊断耗时: ${duration}ms`);
  console.log(`❌ 问题数量: ${diagnostics.issues.length}`);
  console.log(`⚠️  警告数量: ${diagnostics.warnings.length}`);
  console.log(`ℹ️  信息数量: ${diagnostics.info.length}`);
  
  if (diagnostics.issues.length === 0 && diagnostics.warnings.length === 0) {
    console.log('\n✅ 系统状态良好，所有检查通过！');
  } else {
    console.log('\n🔧 建议执行以下操作:');
    diagnostics.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  }
  
  // 保存诊断报告
  try {
    const reportPath = path.join(__dirname, '../src/logs/diagnosis-report.json');
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    diagnostics.duration = duration;
    fs.writeFileSync(reportPath, JSON.stringify(diagnostics, null, 2));
    console.log(`\n📄 详细报告已保存: ${reportPath}`);
  } catch (e) {
    console.log('\n⚠️  无法保存诊断报告:', e.message);
  }
  
  // 返回退出码
  const hasIssues = diagnostics.issues.length > 0;
  process.exit(hasIssues ? 1 : 0);
}

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('\n💥 诊断过程中发生异常:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n💥 诊断过程中发生Promise异常:', reason?.message || String(reason));
  process.exit(1);
});

if (require.main === module) {
  runDiagnosis().catch(error => {
    console.error('\n💥 诊断脚本执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = { runDiagnosis };

const db = require('../db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

function seedDefaultUsers() {
  try {
    // 确保 users 表存在
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      real_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // 检查数据库连接和表结构
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    if (tableInfo.length === 0) {
      throw new Error('用户表创建失败或无法访问');
    }

    const count = db.prepare('SELECT COUNT(1) AS c FROM users').get().c || 0;
    console.log(`[seed] 当前用户数量: ${count}`);

    if (count > 0) {
      // 验证默认用户是否存在且密码正确
      const defaultUsers = ['admin', 'user', 'finance', 'gm'];
      const missingUsers = [];

      for (const username of defaultUsers) {
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
          missingUsers.push(username);
        } else {
          // 验证密码是否正确
          const isValidPassword = bcrypt.compareSync('123456', user.password);
          if (!isValidPassword) {
            console.warn(`[seed] 用户 ${username} 密码不正确，将重置`);
            const hash = bcrypt.hashSync('123456', 10);
            db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hash, username);
          }
        }
      }

      // 创建缺失的用户
      if (missingUsers.length > 0) {
        console.log(`[seed] 发现缺失用户: ${missingUsers.join(', ')}`);
        const hash = bcrypt.hashSync('123456', 10);
        const insert = db.prepare('INSERT INTO users (username, password, real_name, role) VALUES (?,?,?,?)');

        const userConfigs = {
          'admin': { realName: '管理员', role: 'admin' },
          'user': { realName: '员工', role: 'employee' },
          'finance': { realName: '财务', role: 'finance' },
          'gm': { realName: '总经理', role: 'manager' }
        };

        for (const username of missingUsers) {
          const config = userConfigs[username];
          if (config) {
            insert.run(username, hash, config.realName, config.role);
            console.log(`[seed] 已创建用户: ${username}`);
          }
        }
      }

      console.log('[seed] 用户验证和修复完成');
      return;
    }

    // 首次创建所有默认用户
    const hash = bcrypt.hashSync('123456', 10);
    const insert = db.prepare('INSERT INTO users (username, password, real_name, role) VALUES (?,?,?,?)');

    const transaction = db.transaction(() => {
      insert.run('admin', hash, '管理员', 'admin');
      insert.run('user', hash, '员工', 'employee');
      insert.run('finance', hash, '财务', 'finance');
      insert.run('gm', hash, '总经理', 'manager');
    });

    transaction();

    // 验证创建结果
    const finalCount = db.prepare('SELECT COUNT(1) AS c FROM users').get().c || 0;
    if (finalCount === 4) {
      console.log('[seed] ✅ 默认用户已创建: admin/user/finance/gm 密码均为 123456');

      // 记录创建时间到日志文件
      const logPath = path.join(__dirname, '../logs/seed.log');
      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(logPath, `${new Date().toISOString()} - 默认用户创建成功\n`);
    } else {
      throw new Error(`用户创建不完整，期望4个用户，实际${finalCount}个`);
    }

  } catch (e) {
    console.error('[seed] ❌ 创建默认用户失败:', e.message);

    // 记录错误到日志文件
    try {
      const logPath = path.join(__dirname, '../logs/seed.log');
      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(logPath, `${new Date().toISOString()} - 错误: ${e.message}\n`);
    } catch (_) {}

    throw e; // 重新抛出错误，让调用者知道初始化失败
  }
}

// 数据库健康检查函数
function checkDatabaseHealth() {
  try {
    // 检查数据库连接
    const result = db.prepare('SELECT 1 as test').get();
    if (!result || result.test !== 1) {
      throw new Error('数据库连接测试失败');
    }

    // 检查用户表
    const userCount = db.prepare('SELECT COUNT(1) AS c FROM users').get().c || 0;
    if (userCount < 4) {
      console.warn(`[health] 用户数量不足: ${userCount}/4`);
      return false;
    }

    // 检查默认用户
    const defaultUsers = ['admin', 'user', 'finance', 'gm'];
    for (const username of defaultUsers) {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) {
        console.warn(`[health] 缺失用户: ${username}`);
        return false;
      }

      // 验证密码
      const isValidPassword = bcrypt.compareSync('123456', user.password);
      if (!isValidPassword) {
        console.warn(`[health] 用户 ${username} 密码异常`);
        return false;
      }
    }

    console.log('[health] ✅ 数据库健康检查通过');
    return true;
  } catch (e) {
    console.error('[health] ❌ 数据库健康检查失败:', e.message);
    return false;
  }
}

module.exports = { seedDefaultUsers, checkDatabaseHealth };

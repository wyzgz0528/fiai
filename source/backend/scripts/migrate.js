#!/usr/bin/env node

/**
 * 统一的数据库迁移管理系统
 * 自动执行所有未执行的迁移文件
 */

const path = require('path');
const fs = require('fs');

// 设置正确的工作目录
process.chdir(path.join(__dirname, '..'));

const db = require('../src/db');

// 创建迁移记录表
function ensureMigrationTable() {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('[migrate] 迁移记录表已确保存在');
  } catch (e) {
    console.error('[migrate] 创建迁移记录表失败:', e.message);
    throw e;
  }
}

// 获取已执行的迁移
function getExecutedMigrations() {
  try {
    const rows = db.prepare('SELECT filename FROM migrations ORDER BY filename').all();
    return rows.map(row => row.filename);
  } catch (e) {
    console.error('[migrate] 获取已执行迁移失败:', e.message);
    return [];
  }
}

// 记录迁移执行
function recordMigration(filename) {
  try {
    db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(filename);
    console.log(`[migrate] 已记录迁移: ${filename}`);
  } catch (e) {
    console.error(`[migrate] 记录迁移失败 ${filename}:`, e.message);
  }
}

// 获取所有迁移文件
function getAllMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../src/migrations');
  
  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.match(/^\d{4}_.*\.js$/)) // 匹配 0001_xxx.js 格式
      .sort(); // 按文件名排序
    
    console.log(`[migrate] 发现 ${files.length} 个迁移文件:`, files);
    return files;
  } catch (e) {
    console.error('[migrate] 读取迁移目录失败:', e.message);
    return [];
  }
}

// 执行单个迁移
function executeMigration(filename) {
  const migrationPath = path.join(__dirname, '../src/migrations', filename);
  
  try {
    console.log(`[migrate] 执行迁移: ${filename}`);
    
    // 动态加载迁移模块
    delete require.cache[require.resolve(migrationPath)]; // 清除缓存
    const migration = require(migrationPath);
    
    if (typeof migration.up === 'function') {
      // 标准迁移格式
      const result = migration.up();
      if (result === false) {
        throw new Error('迁移执行返回false');
      }
    } else if (typeof migration.addMissingFields === 'function') {
      // 0008_add_missing_fields.js 格式
      migration.addMissingFields();
    } else {
      console.warn(`[migrate] 迁移文件 ${filename} 没有标准的 up() 方法，跳过`);
      return false;
    }
    
    // 记录迁移执行
    recordMigration(filename);
    console.log(`[migrate] ✅ 迁移 ${filename} 执行成功`);
    return true;
    
  } catch (e) {
    console.error(`[migrate] ❌ 迁移 ${filename} 执行失败:`, e.message);
    return false;
  }
}

// 主迁移函数
function runMigrations() {
  console.log('[migrate] 开始执行数据库迁移');
  
  try {
    // 1. 确保迁移记录表存在
    ensureMigrationTable();
    
    // 2. 获取已执行的迁移
    const executedMigrations = getExecutedMigrations();
    console.log(`[migrate] 已执行的迁移: ${executedMigrations.length} 个`);
    
    // 3. 获取所有迁移文件
    const allMigrations = getAllMigrationFiles();
    
    // 4. 找出未执行的迁移
    const pendingMigrations = allMigrations.filter(file => !executedMigrations.includes(file));
    
    if (pendingMigrations.length === 0) {
      console.log('[migrate] ✅ 所有迁移都已执行，无需操作');
      return true;
    }
    
    console.log(`[migrate] 发现 ${pendingMigrations.length} 个待执行迁移:`, pendingMigrations);
    
    // 5. 执行待执行的迁移
    let successCount = 0;
    let failCount = 0;
    
    for (const filename of pendingMigrations) {
      const success = executeMigration(filename);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    // 6. 输出结果
    console.log(`[migrate] 迁移执行完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);
    
    if (failCount > 0) {
      console.error('[migrate] ⚠️  部分迁移执行失败，请检查日志');
      return false;
    }
    
    console.log('[migrate] ✅ 所有迁移执行成功');
    return true;
    
  } catch (e) {
    console.error('[migrate] ❌ 迁移系统执行失败:', e.message);
    return false;
  }
}

// 命令行参数处理
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--status')) {
    // 显示迁移状态
    console.log('[migrate] 迁移状态检查');
    
    try {
      ensureMigrationTable();
      const executed = getExecutedMigrations();
      const all = getAllMigrationFiles();
      const pending = all.filter(file => !executed.includes(file));
      
      console.log(`已执行迁移 (${executed.length}):`, executed);
      console.log(`待执行迁移 (${pending.length}):`, pending);
      
      process.exit(pending.length > 0 ? 1 : 0);
    } catch (e) {
      console.error('[migrate] 状态检查失败:', e.message);
      process.exit(1);
    }
  }
  
  if (args.includes('--force')) {
    console.log('[migrate] 强制执行模式（忽略已执行记录）');
    // 清空迁移记录，强制重新执行所有迁移
    try {
      ensureMigrationTable();
      db.prepare('DELETE FROM migrations').run();
      console.log('[migrate] 已清空迁移记录');
    } catch (e) {
      console.error('[migrate] 清空迁移记录失败:', e.message);
    }
  }
  
  // 默认执行迁移
  const success = runMigrations();
  process.exit(success ? 0 : 1);
}

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('[migrate] 未捕获的异常:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[migrate] 未处理的Promise拒绝:', reason?.message || String(reason));
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = { runMigrations, executeMigration, getAllMigrationFiles };

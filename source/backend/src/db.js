const path = require('path');
const betterSqlite3 = require('better-sqlite3');
const fs = require('fs');

// 允许通过环境变量指定数据库路径，默认使用源码目录下的 db.sqlite
const DB_PATH = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, 'db.sqlite');

// 目录兜底创建，允许 better-sqlite3 自动创建数据库文件
try {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} catch (_) {}

const db = betterSqlite3(DB_PATH);

module.exports = db;

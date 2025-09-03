// 迁移：创建报销类型表（expense_types）并插入少量默认值（幂等）
const id = '0005_create_expense_types';

function up(db) {
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS expense_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // 索引兜底
    try { db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_types_name ON expense_types(name)').run(); } catch (_) {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_expense_types_active ON expense_types(active)').run(); } catch (_) {}

    // 如果为空，写入常用默认类型
    try {
      const c = db.prepare('SELECT COUNT(*) AS c FROM expense_types').get().c || 0;
      if (c === 0) {
        const defaults = ['差旅费', '办公用品', '招待费'];
        const insert = db.prepare('INSERT OR IGNORE INTO expense_types(name, active) VALUES (?, 1)');
        const tx = db.transaction((items) => items.forEach((n) => insert.run(n)));
        tx(defaults);
      }
    } catch (_) {}
    console.log('[migration] 0005_create_expense_types 已应用');
    // 记录到 schema_migrations（与 scripts/migrate.js 兼容）
    try {
      db.prepare('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)').run();
      db.prepare('INSERT OR IGNORE INTO schema_migrations(id) VALUES (?)').run(id);
    } catch (_) {}
  } catch (e) {
    console.error('[migration] 0005_create_expense_types 失败:', e.message);
  }
}

module.exports = { id, up };

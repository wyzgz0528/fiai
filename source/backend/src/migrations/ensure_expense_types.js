const db = require('../db');

function ensureExpenseTypes() {
  try {
    // 创建报销类型表（如不存在）
    db.prepare(`CREATE TABLE IF NOT EXISTS expense_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // 常用索引兜底
    try { db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_types_name ON expense_types(name)').run(); } catch(_){}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_expense_types_active ON expense_types(active)').run(); } catch(_){}

    // 首次初始化可选：如表为空，插入几个常用类型，避免前端完全空白
    try {
      const count = db.prepare('SELECT COUNT(*) AS c FROM expense_types').get().c || 0;
      if (count === 0) {
        const defaults = ['差旅费', '办公用品', '招待费'];
        const insert = db.prepare('INSERT OR IGNORE INTO expense_types(name, active) VALUES (?, 1)');
        const tx = db.transaction((items)=>{ items.forEach(n=>insert.run(n)); });
        tx(defaults);
      }
    } catch(_){}
  } catch (e) {
    console.error('[ensureExpenseTypes] 运行失败:', e.message);
  }
}

module.exports = { ensureExpenseTypes };

const db = require('../db');

function ensureFormTables(){
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
    if(!tables.includes('reimbursement_forms')){
      db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        form_number VARCHAR(50) UNIQUE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(30) DEFAULT '草稿',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        loan_offset_amount DECIMAL(10,2) DEFAULT 0,
        net_payment_amount DECIMAL(10,2),
        payment_note TEXT,
        paid_at DATETIME
      )`).run();
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_user_id ON reimbursement_forms(user_id)').run(); } catch(_){}
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_status ON reimbursement_forms(status)').run(); } catch(_){}
    }

    // 即使表已存在，也要确保关键列存在（兼容老环境）
    try {
      const cols = db.prepare("PRAGMA table_info(reimbursement_forms)").all().map(c=>c.name);
      const addCol = (name, def) => { try { if(!cols.includes(name)) db.prepare(`ALTER TABLE reimbursement_forms ADD COLUMN ${name} ${def}`).run(); } catch(_){} };
      addCol('loan_offset_amount', 'DECIMAL(10,2) DEFAULT 0');
      addCol('net_payment_amount', 'DECIMAL(10,2)');
      addCol('payment_note', 'TEXT');
      addCol('paid_at', 'DATETIME');
      // 常用索引兜底
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_user_id ON reimbursement_forms(user_id)').run(); } catch(_){ }
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_status ON reimbursement_forms(status)').run(); } catch(_){ }
    } catch(_){ }
    if(!tables.includes('reimbursements')){
      db.prepare(`CREATE TABLE IF NOT EXISTS reimbursements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        purpose TEXT,
        type TEXT,
        remark TEXT,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        form_status TEXT,
        form_id INTEGER
      )`).run();
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimbursements_form_id ON reimbursements(form_id)').run(); } catch(_){}
    }

    // 报销批次表（用于借款抵扣联查）
    if(!tables.includes('reimbursement_batches')){
      db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_number TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        reject_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME
      )`).run();
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimb_batches_user ON reimbursement_batches(user_id)').run(); } catch(_){ }
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimb_batches_status ON reimbursement_batches(status)').run(); } catch(_){ }
    }

    // 报销批次-记录关联表（用于借款抵扣联查）
    if(!tables.includes('reimbursement_batch_items')){
      db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_batch_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        reimbursement_id INTEGER NOT NULL
      )`).run();
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimb_batch_items_batch ON reimbursement_batch_items(batch_id)').run(); } catch(_){ }
      try { db.prepare('CREATE INDEX IF NOT EXISTS idx_reimb_batch_items_reimb ON reimbursement_batch_items(reimbursement_id)').run(); } catch(_){ }
    }
  } catch (e) {
    console.error('[ensureFormTables] failed:', e.message);
  }
}

module.exports = { ensureFormTables };

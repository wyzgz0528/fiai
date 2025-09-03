const db = require('../db');

function ensureCoreTables() {
  try {
    // 借款表（部分环境可能缺失，需兜底创建）
    db.prepare(`CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      purpose TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      finance_comment TEXT,
      manager_comment TEXT,
      remaining_amount DECIMAL(10,2),
      approved_by INTEGER,
      loan_type TEXT DEFAULT 'advance',
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`).run();

    // 借款审批日志（含意见）
    db.prepare(`CREATE TABLE IF NOT EXISTS loan_approval_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      approver_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      comment TEXT,
      from_status TEXT,
      to_status TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`).run();

    // 报销单-借款关联（冲抵）
    db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_loan_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      loan_id INTEGER NOT NULL,
      offset_amount DECIMAL(10,2) NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`).run();

    // 借款还款明细（支持现金/报销两种方式）
    db.prepare(`CREATE TABLE IF NOT EXISTS loan_payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      operator_id INTEGER NOT NULL,
      remark TEXT,
      type TEXT DEFAULT 'cash', -- cash | reimbursement
      reimbursement_id INTEGER, -- 如果是报销抵扣，记录对应报销单
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`).run();

    // 旧版/批量抵扣记录表（用于查询抵扣明细列表展示）
    db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_loan_offsets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      offset_amount DECIMAL(10,2) NOT NULL,
      offset_date DATETIME DEFAULT (datetime('now', 'localtime')),
      batch_id INTEGER
    )`).run();

    // 临时附件（上传暂存区）
    db.prepare(`CREATE TABLE IF NOT EXISTS temp_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      uploaded_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`).run();

    // 旧版附件表（仍被部分接口/测试使用）
    db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reimbursement_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      uploaded_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`).run();

    // 新版凭证表（归属报销单；可通过关联表绑定到具体明细）
    db.prepare(`CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reimbursement_form_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL, -- 相对 uploads 目录的相对路径，如 vouchers/xxxx
      file_size INTEGER,
      file_type TEXT,
      uploaded_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`).run();

    // 报销记录-凭证 关联表（供批量下载/明细联查使用）
    db.prepare(`CREATE TABLE IF NOT EXISTS reimbursement_record_vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      voucher_id INTEGER NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(record_id, voucher_id)
    )`).run();

    // 常用索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_loan_logs_loan_id ON loan_approval_logs(loan_id);
      CREATE INDEX IF NOT EXISTS idx_rr_loan_links_form_id ON reimbursement_loan_links(form_id);
      CREATE INDEX IF NOT EXISTS idx_temp_attachments_user_id ON temp_attachments(user_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_reimbursement_id ON attachments(reimbursement_id);
      CREATE INDEX IF NOT EXISTS idx_loan_pay_logs_loan_id ON loan_payment_logs(loan_id);
      CREATE INDEX IF NOT EXISTS idx_loan_pay_logs_operator_id ON loan_payment_logs(operator_id);
      CREATE INDEX IF NOT EXISTS idx_rr_loan_offsets_loan_id ON reimbursement_loan_offsets(loan_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_form_id ON vouchers(reimbursement_form_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_created_at ON vouchers(created_at);
  CREATE INDEX IF NOT EXISTS idx_rrv_record_id ON reimbursement_record_vouchers(record_id);
  CREATE INDEX IF NOT EXISTS idx_rrv_voucher_id ON reimbursement_record_vouchers(voucher_id);
    `);

    // loans 表兜底字段与索引
    try {
      const cols = db.prepare("PRAGMA table_info(loans)").all().map(c => c.name);
      if (!cols.includes('remaining_amount')) {
        db.prepare('ALTER TABLE loans ADD COLUMN remaining_amount DECIMAL(10,2)').run();
        // 使用 amount 初始化 remaining_amount
        db.prepare('UPDATE loans SET remaining_amount = amount WHERE remaining_amount IS NULL').run();
      }
      if (!cols.includes('remark')) {
        db.prepare('ALTER TABLE loans ADD COLUMN remark TEXT').run();
        console.log('[ensure_core_tables] 已添加 loans.remark 字段');
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
        CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
        CREATE INDEX IF NOT EXISTS idx_loans_created_at ON loans(created_at);
      `);
    } catch (_) { /* ignore */ }
  } catch (e) {
    console.error('[ensure_core_tables] 运行失败:', e.message);
  }
}

module.exports = { ensureCoreTables };

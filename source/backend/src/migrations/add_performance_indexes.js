const db = require('../db');

function addPerformanceIndexes() {
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_status ON reimbursement_forms(status);
      CREATE INDEX IF NOT EXISTS idx_reimbursements_form_id ON reimbursements(form_id);
      CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
      CREATE INDEX IF NOT EXISTS idx_rrv_record_id ON reimbursement_record_vouchers(record_id);
      CREATE INDEX IF NOT EXISTS idx_rrv_voucher_id ON reimbursement_record_vouchers(voucher_id);
      CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_user_id ON reimbursement_forms(user_id);
    `);
  } catch (e) {
    console.error('[add_performance_indexes] 失败:', e.message);
  }
}

module.exports = { addPerformanceIndexes };

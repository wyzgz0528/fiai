const db = require('../db');

function addCoreIndexes() {
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_status ON reimbursement_forms(status);
      CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_user ON reimbursement_forms(user_id);
      CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_created ON reimbursement_forms(created_at);
    `);
    console.log('[migration] 0004_add_core_indexes 已应用');
    return true;
  } catch (e) {
    console.error('[migration] 0004_add_core_indexes 失败:', e.message);
    throw e;
  }
}

// 标准迁移格式
function up() {
  return addCoreIndexes();
}

function down() {
  try {
    db.exec(`
      DROP INDEX IF EXISTS idx_reimbursement_forms_status;
      DROP INDEX IF EXISTS idx_reimbursement_forms_user;
      DROP INDEX IF EXISTS idx_reimbursement_forms_created;
    `);
    console.log('[migration] 0004_add_core_indexes 已回滚');
    return true;
  } catch (e) {
    console.error('[migration] 0004_add_core_indexes 回滚失败:', e.message);
    throw e;
  }
}

module.exports = { addCoreIndexes, up, down };

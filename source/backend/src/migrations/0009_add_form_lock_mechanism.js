/**
 * 迁移 0009: 添加报销单锁定机制
 * 
 * 功能：
 * 1. 添加报销单锁定相关字段
 * 2. 添加凭证复用跟踪表
 * 3. 自动锁定已驳回的报销单
 * 4. 确保重启后永久有效
 */

const db = require('../db');

function up() {
  console.log('[0009] 开始执行报销单锁定机制迁移');
  
  try {
    // 1. 添加报销单锁定相关字段
    console.log('[0009] 添加报销单锁定字段');
    
    // 检查字段是否已存在，避免重复添加
    const formColumns = db.pragma('table_info(reimbursement_forms)').map(col => col.name);
    
    if (!formColumns.includes('is_locked')) {
      db.prepare('ALTER TABLE reimbursement_forms ADD COLUMN is_locked BOOLEAN DEFAULT FALSE').run();
      console.log('[0009] ✅ 添加 is_locked 字段');
    }
    
    if (!formColumns.includes('lock_reason')) {
      db.prepare('ALTER TABLE reimbursement_forms ADD COLUMN lock_reason TEXT').run();
      console.log('[0009] ✅ 添加 lock_reason 字段');
    }
    
    if (!formColumns.includes('locked_at')) {
      db.prepare('ALTER TABLE reimbursement_forms ADD COLUMN locked_at DATETIME').run();
      console.log('[0009] ✅ 添加 locked_at 字段');
    }
    
    if (!formColumns.includes('can_create_new_from_rejected')) {
      db.prepare('ALTER TABLE reimbursement_forms ADD COLUMN can_create_new_from_rejected BOOLEAN DEFAULT TRUE').run();
      console.log('[0009] ✅ 添加 can_create_new_from_rejected 字段');
    }
    
    // 2. 创建凭证复用跟踪表
    console.log('[0009] 创建凭证复用跟踪表');
    db.prepare(`
      CREATE TABLE IF NOT EXISTS voucher_reuse_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_voucher_id INTEGER NOT NULL,
        original_form_id INTEGER NOT NULL,
        new_form_id INTEGER NOT NULL,
        reuse_reason TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (original_voucher_id) REFERENCES attachments(id),
        FOREIGN KEY (original_form_id) REFERENCES reimbursement_forms(id),
        FOREIGN KEY (new_form_id) REFERENCES reimbursement_forms(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `).run();
    console.log('[0009] ✅ 凭证复用跟踪表创建完成');
    
    // 3. 创建报销单关联表（用于追踪从被驳回单创建的新单）
    console.log('[0009] 创建报销单关联表');
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reimbursement_form_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rejected_form_id INTEGER NOT NULL,
        new_form_id INTEGER NOT NULL,
        relation_type TEXT DEFAULT 'created_from_rejected',
        created_by INTEGER,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (rejected_form_id) REFERENCES reimbursement_forms(id),
        FOREIGN KEY (new_form_id) REFERENCES reimbursement_forms(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `).run();
    console.log('[0009] ✅ 报销单关联表创建完成');
    
    // 4. 自动锁定所有已驳回的报销单
    console.log('[0009] 锁定已驳回的报销单');
    const lockResult = db.prepare(`
      UPDATE reimbursement_forms 
      SET 
        is_locked = TRUE,
        lock_reason = '报销单已被驳回，不可修改。如需重新申请，请创建新的报销单。',
        locked_at = datetime('now', 'localtime')
      WHERE status IN ('财务已驳回', '总经理已驳回', 'finance_rejected', 'manager_rejected')
        AND (is_locked IS NULL OR is_locked = FALSE)
    `).run();
    
    console.log(`[0009] ✅ 已锁定 ${lockResult.changes} 张被驳回的报销单`);
    
    // 5. 创建索引提高查询性能
    console.log('[0009] 创建相关索引');
    try {
      db.prepare('CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_locked ON reimbursement_forms(is_locked, status)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_voucher_reuse_original ON voucher_reuse_records(original_form_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_voucher_reuse_new ON voucher_reuse_records(new_form_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_form_relations_rejected ON reimbursement_form_relations(rejected_form_id)').run();
      console.log('[0009] ✅ 索引创建完成');
    } catch (e) {
      console.warn('[0009] ⚠️ 索引创建部分失败:', e.message);
    }
    
    console.log('[0009] ✅ 报销单锁定机制迁移完成');
    return true;
    
  } catch (error) {
    console.error('[0009] ❌ 迁移执行失败:', error.message);
    throw error;
  }
}

function down() {
  console.log('[0009] 开始回滚报销单锁定机制迁移');
  
  try {
    // 删除新增的表
    db.prepare('DROP TABLE IF EXISTS voucher_reuse_records').run();
    db.prepare('DROP TABLE IF EXISTS reimbursement_form_relations').run();
    
    // 删除新增的字段（SQLite不支持DROP COLUMN，所以只能重置值）
    db.prepare(`
      UPDATE reimbursement_forms 
      SET is_locked = NULL, lock_reason = NULL, locked_at = NULL, can_create_new_from_rejected = NULL
    `).run();
    
    console.log('[0009] ✅ 回滚完成');
    return true;
    
  } catch (error) {
    console.error('[0009] ❌ 回滚失败:', error.message);
    throw error;
  }
}

module.exports = { up, down };

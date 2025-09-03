const db = require('../db');

/**
 * 添加缺失的数据库字段
 * 修复生产环境中可能缺失的字段导致的500错误
 */
function addMissingFields() {
  try {
    console.log('[migration] 0008_add_missing_fields 开始执行');
    
    // 检查并添加 loans 表的 remark 字段
    const loansCols = db.prepare("PRAGMA table_info(loans)").all().map(c => c.name);
    if (!loansCols.includes('remark')) {
      db.prepare('ALTER TABLE loans ADD COLUMN remark TEXT').run();
      console.log('[migration] 已添加 loans.remark 字段');
    }
    
    // 检查并添加其他可能缺失的字段
    // 检查 reimbursement_items 表是否有 invoice_number 字段
    try {
      const reimbursementItemsCols = db.prepare("PRAGMA table_info(reimbursement_items)").all().map(c => c.name);
      if (!reimbursementItemsCols.includes('invoice_number')) {
        db.prepare('ALTER TABLE reimbursement_items ADD COLUMN invoice_number TEXT').run();
        console.log('[migration] 已添加 reimbursement_items.invoice_number 字段');
      }
    } catch (e) {
      // 表可能不存在，忽略错误
      console.log('[migration] reimbursement_items 表不存在，跳过');
    }
    
    // 检查 reimbursement_forms 表是否有相关字段
    try {
      const reimbursementFormsCols = db.prepare("PRAGMA table_info(reimbursement_forms)").all().map(c => c.name);
      
      const missingFields = [];
      const requiredFields = [
        { name: 'invoice_number', type: 'TEXT' },
        { name: 'invoice_date', type: 'DATE' },
        { name: 'buyer_name', type: 'TEXT' },
        { name: 'service_name', type: 'TEXT' }
      ];
      
      requiredFields.forEach(field => {
        if (!reimbursementFormsCols.includes(field.name)) {
          missingFields.push(field);
        }
      });
      
      if (missingFields.length > 0) {
        missingFields.forEach(field => {
          db.prepare(`ALTER TABLE reimbursement_forms ADD COLUMN ${field.name} ${field.type}`).run();
          console.log(`[migration] 已添加 reimbursement_forms.${field.name} 字段`);
        });
      }
    } catch (e) {
      // 表可能不存在，忽略错误
      console.log('[migration] reimbursement_forms 表不存在，跳过');
    }
    
    // 检查 users 表是否有所有必要字段
    try {
      const usersCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      
      const userMissingFields = [];
      const userRequiredFields = [
        { name: 'real_name', type: 'TEXT' },
        { name: 'role', type: 'TEXT' },
        { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
      ];
      
      userRequiredFields.forEach(field => {
        if (!usersCols.includes(field.name)) {
          userMissingFields.push(field);
        }
      });
      
      if (userMissingFields.length > 0) {
        userMissingFields.forEach(field => {
          db.prepare(`ALTER TABLE users ADD COLUMN ${field.name} ${field.type}`).run();
          console.log(`[migration] 已添加 users.${field.name} 字段`);
        });
      }
    } catch (e) {
      console.error('[migration] users 表字段检查失败:', e.message);
    }
    
    // 创建缺失的索引
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_loans_remark ON loans(remark);
        CREATE INDEX IF NOT EXISTS idx_reimbursement_items_invoice_number ON reimbursement_items(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_invoice_number ON reimbursement_forms(invoice_number);
      `);
      console.log('[migration] 已创建缺失的索引');
    } catch (e) {
      console.log('[migration] 创建索引时出现错误（可能表不存在）:', e.message);
    }
    
    console.log('[migration] 0008_add_missing_fields 执行完成');
    
  } catch (error) {
    console.error('[migration] 0008_add_missing_fields 执行失败:', error.message);
    throw error;
  }
}

// 如果直接运行此文件，执行迁移
if (require.main === module) {
  addMissingFields();
}

module.exports = { addMissingFields };

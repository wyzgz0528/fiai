const Database = require('better-sqlite3');
const path = require('path');

/**
 * Migration 0006: 为报销记录表添加发票信息字段
 * 支持OCR识别结果的持久化存储
 */

function addInvoiceFields() {
  const dbPath = path.join(__dirname, '..', 'db.sqlite');
  const db = new Database(dbPath);
  
  try {
    console.log('[Migration 0006] 开始添加发票信息字段...');
    
    // 检查表是否存在
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='reimbursements'
    `).get();
    
    if (!tableExists) {
      console.log('[Migration 0006] reimbursements表不存在，跳过迁移');
      return;
    }
    
    // 获取现有列信息
    const columns = db.prepare(`PRAGMA table_info(reimbursements)`).all();
    const existingColumns = columns.map(col => col.name);
    
    console.log('[Migration 0006] 现有字段:', existingColumns);
    
    // 定义要添加的发票字段
    const invoiceFields = [
      {
        name: 'invoice_number',
        definition: 'VARCHAR(50)',
        comment: '发票号码'
      },
      {
        name: 'invoice_amount',
        definition: 'DECIMAL(10,2)',
        comment: '发票金额(含税)'
      },
      {
        name: 'invoice_date',
        definition: 'DATE',
        comment: '开票日期'
      },
      {
        name: 'buyer_name',
        definition: 'VARCHAR(200)',
        comment: '购买方名称'
      },
      {
        name: 'service_name',
        definition: 'VARCHAR(500)',
        comment: '服务名称/商品名称'
      },
      {
        name: 'ocr_confidence',
        definition: 'DECIMAL(3,2)',
        comment: 'OCR识别置信度(0-1)'
      },
      {
        name: 'ocr_processed_at',
        definition: 'DATETIME',
        comment: 'OCR处理时间'
      },
      {
        name: 'ocr_mode',
        definition: 'VARCHAR(20)',
        comment: 'OCR识别模式(production/mock/manual)'
      }
    ];
    
    // 逐个添加字段
    let addedCount = 0;
    for (const field of invoiceFields) {
      if (!existingColumns.includes(field.name)) {
        try {
          const sql = `ALTER TABLE reimbursements ADD COLUMN ${field.name} ${field.definition}`;
          db.exec(sql);
          console.log(`[Migration 0006] ✓ 添加字段: ${field.name} (${field.comment})`);
          addedCount++;
        } catch (error) {
          console.error(`[Migration 0006] ✗ 添加字段失败: ${field.name}`, error.message);
        }
      } else {
        console.log(`[Migration 0006] - 字段已存在: ${field.name}`);
      }
    }
    
    // 创建索引以提高查询性能
    const indexes = [
      {
        name: 'idx_reimbursements_invoice_number',
        sql: 'CREATE INDEX IF NOT EXISTS idx_reimbursements_invoice_number ON reimbursements(invoice_number)'
      },
      {
        name: 'idx_reimbursements_invoice_date',
        sql: 'CREATE INDEX IF NOT EXISTS idx_reimbursements_invoice_date ON reimbursements(invoice_date)'
      },
      {
        name: 'idx_reimbursements_buyer_name',
        sql: 'CREATE INDEX IF NOT EXISTS idx_reimbursements_buyer_name ON reimbursements(buyer_name)'
      }
    ];
    
    console.log('[Migration 0006] 创建索引...');
    for (const index of indexes) {
      try {
        db.exec(index.sql);
        console.log(`[Migration 0006] ✓ 创建索引: ${index.name}`);
      } catch (error) {
        console.log(`[Migration 0006] - 索引已存在或创建失败: ${index.name}`);
      }
    }
    
    // 验证迁移结果
    const newColumns = db.prepare(`PRAGMA table_info(reimbursements)`).all();
    const newColumnNames = newColumns.map(col => col.name);
    
    console.log('[Migration 0006] 迁移后字段:', newColumnNames);
    console.log(`[Migration 0006] ✅ 迁移完成，新增 ${addedCount} 个字段`);
    
  } catch (error) {
    console.error('[Migration 0006] ✗ 迁移失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 如果直接运行此文件，执行迁移
if (require.main === module) {
  addInvoiceFields();
}

module.exports = {
  id: '0006_add_invoice_fields',
  description: '为报销记录表添加发票信息字段',
  up: addInvoiceFields
};

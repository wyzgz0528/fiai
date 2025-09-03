const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../db.sqlite');
const db = new Database(dbPath);

console.log('开始执行报销单级审批支持的数据库迁移...');

try {
  // 读取SQL迁移文件
  const sqlPath = path.join(__dirname, 'add_form_approval_support.sql');
  const migrationSQL = fs.readFileSync(sqlPath, 'utf8');
  
  // 分步骤执行迁移，确保依赖关系正确
  console.log('步骤1: 添加表字段...');
  db.exec(`
    ALTER TABLE reimbursement_forms ADD COLUMN parent_form_id INTEGER;
    ALTER TABLE reimbursement_forms ADD COLUMN is_split_from_parent BOOLEAN DEFAULT FALSE;
    ALTER TABLE reimbursement_forms ADD COLUMN split_reason TEXT;
    ALTER TABLE reimbursement_forms ADD COLUMN approved_record_count INTEGER DEFAULT 0;
    ALTER TABLE reimbursement_forms ADD COLUMN rejected_record_count INTEGER DEFAULT 0;
    
    ALTER TABLE reimbursements ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending';
    ALTER TABLE reimbursements ADD COLUMN reject_reason TEXT;
    ALTER TABLE reimbursements ADD COLUMN approver_id INTEGER;
    ALTER TABLE reimbursements ADD COLUMN approved_at DATETIME;
  `);
  console.log('✓ 步骤1: 字段添加成功');
  
  console.log('步骤2: 创建新表...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS reimbursement_form_approval_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      approver_id INTEGER NOT NULL,
      action VARCHAR(20) NOT NULL,
      approved_record_ids TEXT,
      rejected_record_ids TEXT,
      new_form_id INTEGER,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES reimbursement_forms(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (new_form_id) REFERENCES reimbursement_forms(id)
    );
    
    CREATE TABLE IF NOT EXISTS reimbursement_form_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_form_id INTEGER NOT NULL,
      new_form_id INTEGER NOT NULL,
      split_type VARCHAR(20) NOT NULL,
      record_ids TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (original_form_id) REFERENCES reimbursement_forms(id),
      FOREIGN KEY (new_form_id) REFERENCES reimbursement_forms(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
  console.log('✓ 步骤2: 新表创建成功');
  
  console.log('步骤3: 更新现有数据...');
  db.exec(`
    UPDATE reimbursements SET approval_status = 
      CASE 
        WHEN status = '待财务审核' THEN 'pending'
        WHEN status = '财务已审核' THEN 'finance_approved'
        WHEN status = '总经理已审批' THEN 'manager_approved'
        WHEN status = '已驳回' THEN 'rejected'
        WHEN status = 'paid' THEN 'paid'
        ELSE 'pending'
      END
    WHERE approval_status = 'pending';
  `);
  console.log('✓ 步骤3: 数据更新成功');
  
  console.log('步骤4: 创建索引...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_parent_id ON reimbursement_forms(parent_form_id);
    CREATE INDEX IF NOT EXISTS idx_reimbursements_approval_status ON reimbursements(approval_status);
    CREATE INDEX IF NOT EXISTS idx_form_approval_logs_form_id ON reimbursement_form_approval_logs(form_id);
    CREATE INDEX IF NOT EXISTS idx_form_splits_original_id ON reimbursement_form_splits(original_form_id);
  `);
  console.log('✓ 步骤4: 索引创建成功');
  
  console.log('\n🎉 数据库迁移执行成功！');
  console.log('新增功能：');
  console.log('- ✅ 报销单级审批支持');
  console.log('- ✅ 混合状态处理');
  console.log('- ✅ 自动拆分功能');
  console.log('- ✅ 审批日志追踪');
  
  // 验证表结构
  console.log('\n📊 验证新增表结构：');
  
  const tables = ['reimbursement_form_approval_logs', 'reimbursement_form_splits'];
  tables.forEach(tableName => {
    try {
      const result = db.prepare(`SELECT count(*) as count FROM ${tableName}`).get();
      console.log(`✓ ${tableName}: 表创建成功，当前记录数 ${result.count}`);
    } catch (error) {
      console.error(`✗ ${tableName}: 表验证失败`, error.message);
    }
  });
  
  // 验证新增字段
  console.log('\n📋 验证新增字段：');
  try {
    const formColumns = db.pragma('table_info(reimbursement_forms)');
    const newFormColumns = ['parent_form_id', 'is_split_from_parent', 'split_reason'];
    newFormColumns.forEach(col => {
      const exists = formColumns.some(c => c.name === col);
      console.log(`${exists ? '✓' : '✗'} reimbursement_forms.${col}: ${exists ? '已添加' : '添加失败'}`);
    });
    
    const reimbColumns = db.pragma('table_info(reimbursements)');
    const newReimbColumns = ['approval_status', 'reject_reason', 'approver_id', 'approved_at'];
    newReimbColumns.forEach(col => {
      const exists = reimbColumns.some(c => c.name === col);
      console.log(`${exists ? '✓' : '✗'} reimbursements.${col}: ${exists ? '已添加' : '添加失败'}`);
    });
  } catch (error) {
    console.error('字段验证失败:', error.message);
  }
  
} catch (error) {
  console.error('\n❌ 数据库迁移失败:', error.message);
  console.error('请检查SQL语句并重新执行');
  process.exit(1);
} finally {
  db.close();
  console.log('\n数据库连接已关闭');
}

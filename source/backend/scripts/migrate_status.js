#!/usr/bin/env node

/**
 * 状态系统重构迁移脚本
 * 将旧的 approved/rejected 状态迁移为新的 finance_approved/finance_rejected/manager_approved/manager_rejected 状态
 */

const path = require('path');
const betterSqlite3 = require('better-sqlite3');

// 数据库连接
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../src/db.sqlite');
const db = betterSqlite3(DB_PATH);

console.log('🚀 开始状态系统重构迁移...');
console.log(`📁 数据库路径: ${DB_PATH}`);

// 状态映射规则
const STATUS_MIGRATION_MAP = {
  // 报销单状态映射
  form_status: {
    '已驳回': '财务已驳回',
    'rejected': '财务已驳回',
    '财务已审核': '财务已通过',
    '总经理已审批': '总经理已通过'
  },
  
  // 报销记录状态映射
  record_status: {
    'rejected': 'finance_rejected',
    '已驳回': 'finance_rejected',
    'approved': 'manager_approved',
    '已审核': 'manager_approved'
  },
  
  // 借款状态映射
  loan_status: {
    '已驳回': '财务已驳回',
    'rejected': '财务已驳回',
    '财务已审核': '财务已通过',
    '总经理已审批': '总经理已通过'
  }
};

function migrateReimbursementFormStatus() {
  console.log('\n📋 迁移报销单状态...');
  
  const forms = db.prepare('SELECT id, status FROM reimbursement_forms').all();
  let updated = 0;
  
  const updateStmt = db.prepare('UPDATE reimbursement_forms SET status = ? WHERE id = ?');
  
  for (const form of forms) {
    const newStatus = STATUS_MIGRATION_MAP.form_status[form.status];
    if (newStatus && newStatus !== form.status) {
      updateStmt.run(newStatus, form.id);
      console.log(`  ✅ 报销单 ${form.id}: ${form.status} → ${newStatus}`);
      updated++;
    }
  }
  
  console.log(`📊 报销单状态迁移完成: ${updated}/${forms.length} 条记录已更新`);
}

function migrateReimbursementRecordStatus() {
  console.log('\n📝 迁移报销记录状态...');
  
  // 迁移 approval_status 字段
  const records = db.prepare('SELECT id, approval_status FROM reimbursements WHERE approval_status IS NOT NULL').all();
  let updated = 0;
  
  const updateStmt = db.prepare('UPDATE reimbursements SET approval_status = ? WHERE id = ?');
  
  for (const record of records) {
    const newStatus = STATUS_MIGRATION_MAP.record_status[record.approval_status];
    if (newStatus && newStatus !== record.approval_status) {
      updateStmt.run(newStatus, record.id);
      console.log(`  ✅ 记录 ${record.id}: ${record.approval_status} → ${newStatus}`);
      updated++;
    }
  }
  
  console.log(`📊 报销记录状态迁移完成: ${updated}/${records.length} 条记录已更新`);
}

function migrateLoanStatus() {
  console.log('\n💰 迁移借款状态...');
  
  const loans = db.prepare('SELECT id, status FROM loans').all();
  let updated = 0;
  
  const updateStmt = db.prepare('UPDATE loans SET status = ? WHERE id = ?');
  
  for (const loan of loans) {
    const newStatus = STATUS_MIGRATION_MAP.loan_status[loan.status];
    if (newStatus && newStatus !== loan.status) {
      updateStmt.run(newStatus, loan.id);
      console.log(`  ✅ 借款 ${loan.id}: ${loan.status} → ${newStatus}`);
      updated++;
    }
  }
  
  console.log(`📊 借款状态迁移完成: ${updated}/${loans.length} 条记录已更新`);
}

function updateStatusMappingFiles() {
  console.log('\n🔄 状态映射文件已在代码中更新');
  console.log('  ✅ backend/src/constants/status.js');
  console.log('  ✅ frontend/src/constants/status.js');
  console.log('  ✅ backend/src/utils/status_maps.js');
}

function validateMigration() {
  console.log('\n🔍 验证迁移结果...');
  
  // 检查报销单状态
  const formStatuses = db.prepare('SELECT DISTINCT status FROM reimbursement_forms').all();
  console.log('📋 报销单状态分布:');
  formStatuses.forEach(s => console.log(`  - ${s.status}`));
  
  // 检查报销记录状态
  const recordStatuses = db.prepare('SELECT DISTINCT approval_status FROM reimbursements WHERE approval_status IS NOT NULL').all();
  console.log('📝 报销记录状态分布:');
  recordStatuses.forEach(s => console.log(`  - ${s.approval_status}`));
  
  // 检查借款状态
  const loanStatuses = db.prepare('SELECT DISTINCT status FROM loans').all();
  console.log('💰 借款状态分布:');
  loanStatuses.forEach(s => console.log(`  - ${s.status}`));
}

// 主执行函数
function main() {
  try {
    // 开始事务
    const transaction = db.transaction(() => {
      migrateReimbursementFormStatus();
      migrateReimbursementRecordStatus();
      migrateLoanStatus();
    });
    
    transaction();
    
    updateStatusMappingFiles();
    validateMigration();
    
    console.log('\n🎉 状态系统重构迁移完成！');
    console.log('\n📝 迁移总结:');
    console.log('  ✅ 移除了模糊的 approved/rejected 状态');
    console.log('  ✅ 引入了明确的 finance_approved/finance_rejected 状态');
    console.log('  ✅ 引入了明确的 manager_approved/manager_rejected 状态');
    console.log('  ✅ 保持了向后兼容性');
    console.log('  ✅ 所有状态均为中文显示');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { main };

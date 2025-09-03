const db = require('../db');

/**
 * 迁移：为 loans 表添加 remark 字段
 * 修复借款编辑功能中缺少 remark 字段的问题
 */
function up() {
  console.log('[migration] 0007_add_loan_remark: 开始执行');
  
  try {
    // 检查 remark 字段是否已存在
    const tableInfo = db.prepare("PRAGMA table_info(loans)").all();
    const hasRemarkField = tableInfo.some(column => column.name === 'remark');
    
    if (!hasRemarkField) {
      // 添加 remark 字段
      db.prepare("ALTER TABLE loans ADD COLUMN remark TEXT DEFAULT ''").run();
      console.log('[migration] 0007_add_loan_remark: 已添加 remark 字段');
    } else {
      console.log('[migration] 0007_add_loan_remark: remark 字段已存在，跳过');
    }
    
    console.log('[migration] 0007_add_loan_remark: 执行完成');
    return true;
  } catch (error) {
    console.error('[migration] 0007_add_loan_remark: 执行失败', error);
    return false;
  }
}

function down() {
  console.log('[migration] 0007_add_loan_remark: 回滚开始');
  
  try {
    // SQLite 不支持 DROP COLUMN，需要重建表
    // 为了安全起见，这里不实现回滚
    console.log('[migration] 0007_add_loan_remark: SQLite 不支持删除列，跳过回滚');
    return true;
  } catch (error) {
    console.error('[migration] 0007_add_loan_remark: 回滚失败', error);
    return false;
  }
}

module.exports = { up, down };

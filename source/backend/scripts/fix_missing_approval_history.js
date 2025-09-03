#!/usr/bin/env node

/**
 * 修复丢失的审批历史记录
 * 
 * 问题：由于之前的逻辑错误，部分审批历史记录被删除了
 * 解决：根据表单拆分记录和当前状态，重建审批历史
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../src/db.sqlite');
const db = new Database(dbPath);

console.log('🔧 开始修复审批历史记录...');

try {
  // 查找所有拆分记录
  const splits = db.prepare(`
    SELECT 
      rfs.*,
      original.form_number as original_form_number,
      original.status as original_status,
      new_form.form_number as new_form_number,
      new_form.status as new_status,
      u.real_name as creator_name
    FROM reimbursement_form_splits rfs
    LEFT JOIN reimbursement_forms original ON rfs.original_form_id = original.id
    LEFT JOIN reimbursement_forms new_form ON rfs.new_form_id = new_form.id
    LEFT JOIN users u ON rfs.created_by = u.id
    ORDER BY rfs.created_at ASC
  `).all();

  console.log(`找到 ${splits.length} 条拆分记录`);

  for (const split of splits) {
    console.log(`\n处理拆分记录: ${split.original_form_number} -> ${split.new_form_number}`);
    
    // 检查是否已有审批记录
    const existingLogs = db.prepare(`
      SELECT COUNT(*) as count 
      FROM reimbursement_form_approval_logs 
      WHERE form_id = ?
    `).get(split.original_form_id);

    if (existingLogs.count === 0) {
      console.log(`  原表单 ${split.original_form_id} 缺少审批记录，需要重建`);
      
      // 根据拆分类型和创建者角色推断审批动作
      let action = 'partial'; // 默认为部分通过
      let approverRole = 'finance'; // 默认财务
      
      // 根据表单状态推断审批者角色
      if (split.new_status === '财务已通过' || split.new_status === '财务已驳回') {
        approverRole = 'finance';
      } else if (split.new_status === '总经理已通过' || split.new_status === '总经理已驳回') {
        approverRole = 'manager';
      }
      
      // 获取对应角色的用户ID（使用创建者作为审批者）
      const approver = db.prepare(`
        SELECT id FROM users WHERE id = ? AND role = ?
      `).get(split.created_by, approverRole);
      
      if (approver) {
        // 解析记录ID
        const recordIds = JSON.parse(split.record_ids || '[]');
        
        // 创建审批记录
        const insertLog = db.prepare(`
          INSERT INTO reimbursement_form_approval_logs 
          (form_id, approver_id, action, approved_record_ids, rejected_record_ids, new_form_id, comment, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        if (split.split_type === 'approved') {
          // 部分通过：approved_record_ids 包含通过的记录
          insertLog.run(
            split.original_form_id,
            approver.id,
            'partial',
            JSON.stringify(recordIds),
            JSON.stringify([]), // 驳回的记录ID需要从其他地方获取
            split.new_form_id,
            `${approverRole === 'finance' ? '财务' : '总经理'}部分审批通过`,
            split.created_at
          );
          console.log(`  ✅ 为表单 ${split.original_form_id} 创建了 ${approverRole} 部分通过记录`);
        }
      } else {
        console.log(`  ⚠️  无法找到合适的审批者 (用户ID: ${split.created_by}, 角色: ${approverRole})`);
      }
    } else {
      console.log(`  ✅ 表单 ${split.original_form_id} 已有 ${existingLogs.count} 条审批记录`);
    }
  }

  // 验证修复结果
  console.log('\n🔍 验证修复结果...');
  
  const allApprovalLogs = db.prepare(`
    SELECT 
      rfal.*,
      rf.form_number,
      u.real_name as approver_name,
      u.role as approver_role
    FROM reimbursement_form_approval_logs rfal
    LEFT JOIN reimbursement_forms rf ON rfal.form_id = rf.id
    LEFT JOIN users u ON rfal.approver_id = u.id
    ORDER BY rfal.created_at ASC
  `).all();

  console.log(`\n总共有 ${allApprovalLogs.length} 条审批记录:`);
  for (const log of allApprovalLogs) {
    console.log(`  - ${log.form_number}: ${log.approver_name}(${log.approver_role}) ${log.action} at ${log.created_at}`);
  }

  console.log('\n✅ 审批历史记录修复完成！');

} catch (error) {
  console.error('❌ 修复过程中出现错误:', error);
  process.exit(1);
} finally {
  db.close();
}

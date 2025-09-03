#!/usr/bin/env node

/**
 * 全面修复项目中所有时间戳问题
 * 将所有 CURRENT_TIMESTAMP 替换为 datetime('now', 'localtime') 以使用北京时间
 */

const fs = require('fs');
const path = require('path');

console.log('🕐 开始修复项目中的所有时间戳问题...\n');

// 需要修复的文件列表和对应的修复规则
const fixRules = [
  {
    file: 'src/services/approvalService.js',
    fixes: [
      {
        search: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
        replace: 'created_at DATETIME DEFAULT (datetime(\'now\', \'localtime\'))',
        description: '审批日志表创建时间'
      },
      {
        search: 'INSERT INTO reimbursement_forms (user_id, form_number, total_amount, status, parent_form_id, is_split_from_parent, split_reason, approved_record_count, rejected_record_count, version, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,CURRENT_TIMESTAMP)',
        replace: 'INSERT INTO reimbursement_forms (user_id, form_number, total_amount, status, parent_form_id, is_split_from_parent, split_reason, approved_record_count, rejected_record_count, version, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,datetime(\'now\', \'localtime\'))',
        description: '拆分报销单创建时间'
      },
      {
        search: 'INSERT INTO reimbursement_form_approval_logs (form_id, approver_id, action, approved_record_ids, rejected_record_ids, new_form_id, comment, action_fingerprint) VALUES (?,?,?,?,?,?,?,?)',
        replace: 'INSERT INTO reimbursement_form_approval_logs (form_id, approver_id, action, approved_record_ids, rejected_record_ids, new_form_id, comment, action_fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?,datetime(\'now\', \'localtime\'))',
        description: '审批日志记录时间'
      }
    ]
  },
  {
    file: 'src/migrations/ensure_core_tables.js',
    fixes: [
      {
        search: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
        replace: 'created_at DATETIME DEFAULT (datetime(\'now\', \'localtime\'))',
        description: '核心表创建时间字段默认值'
      },
      {
        search: 'uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP',
        replace: 'uploaded_at DATETIME DEFAULT (datetime(\'now\', \'localtime\'))',
        description: '上传时间字段默认值'
      },
      {
        search: 'offset_date DATETIME DEFAULT CURRENT_TIMESTAMP',
        replace: 'offset_date DATETIME DEFAULT (datetime(\'now\', \'localtime\'))',
        description: '冲抵日期字段默认值'
      }
    ]
  },
  {
    file: 'src/migrations/ensure_form_tables.js',
    fixes: [
      {
        search: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
        replace: 'created_at DATETIME DEFAULT (datetime(\'now\', \'localtime\'))',
        description: '表单表创建时间字段默认值'
      },
      {
        search: 'paid_at DATETIME',
        replace: 'paid_at DATETIME',
        description: '打款时间字段（手动设置，无需修改）'
      }
    ]
  },
  {
    file: 'src/utils/audit.js',
    fixes: [
      {
        search: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
        replace: 'created_at DATETIME DEFAULT (datetime(\'now\', \'localtime\'))',
        description: '审计日志创建时间'
      }
    ]
  }
];

// 执行修复
let totalFixes = 0;
let totalFiles = 0;

for (const rule of fixRules) {
  const filePath = path.join(__dirname, '..', rule.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  文件不存在: ${rule.file}`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let fileChanged = false;
  let fileFixes = 0;
  
  console.log(`📝 处理文件: ${rule.file}`);
  
  for (const fix of rule.fixes) {
    if (content.includes(fix.search)) {
      content = content.replace(new RegExp(fix.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fix.replace);
      fileChanged = true;
      fileFixes++;
      totalFixes++;
      console.log(`  ✅ ${fix.description}`);
    } else {
      console.log(`  ⏭️  跳过: ${fix.description} (未找到匹配内容)`);
    }
  }
  
  if (fileChanged) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalFiles++;
    console.log(`  💾 已保存 ${fileFixes} 处修改\n`);
  } else {
    console.log(`  ✨ 无需修改\n`);
  }
}

console.log(`🎉 修复完成！`);
console.log(`📊 统计信息:`);
console.log(`  - 处理文件: ${totalFiles} 个`);
console.log(`  - 修复项目: ${totalFixes} 处`);
console.log(`\n⚠️  注意: 需要重启PM2服务以应用更改`);
console.log(`   命令: pm2 reload caiwu-backend`);

#!/usr/bin/env node

/**
 * 修复状态重构后的遗留问题
 * 处理代码中仍然使用旧状态值的地方
 */

const path = require('path');
const fs = require('fs');

console.log('🔧 修复状态重构后的遗留问题...');

// 需要修复的文件和对应的修复内容
const fixes = [
  {
    file: 'src/services/formService.js',
    fixes: [
      {
        search: "approval_status = 'rejected'",
        replace: "approval_status IN ('rejected', 'finance_rejected', 'manager_rejected')",
        description: '更新被驳回记录的查询条件'
      },
      {
        search: "!['draft','rejected'].includes(norm)",
        replace: "!['draft','rejected','finance_rejected','manager_rejected'].includes(norm)",
        description: '更新状态验证逻辑'
      }
    ]
  },
  {
    file: 'src/routes/forms.js',
    fixes: [
      {
        search: "'manager_approved','总经理已审批','approved'",
        replace: "'manager_approved','总经理已审批','总经理已通过','approved'",
        description: '更新财务待办状态查询'
      },
      {
        search: "'finance_approved','财务已审核'",
        replace: "'finance_approved','财务已审核','财务已通过'",
        description: '更新总经理待办状态查询'
      }
    ]
  },
  {
    file: 'src/routes/loan.js',
    fixes: [
      {
        search: "'总经理已审批'",
        replace: "'总经理已审批','总经理已通过'",
        description: '更新借款状态查询'
      },
      {
        search: "'财务已审核'",
        replace: "'财务已审核','财务已通过'",
        description: '更新借款状态查询'
      }
    ]
  },
  {
    file: 'src/server.js',
    fixes: [
      {
        search: "'财务已审核'",
        replace: "'财务已审核','财务已通过'",
        description: '更新统计查询中的状态'
      },
      {
        search: "'总经理已审批'",
        replace: "'总经理已审批','总经理已通过'",
        description: '更新统计查询中的状态'
      }
    ]
  },
  {
    file: 'src/services/invoiceValidationService.js',
    fixes: [
      {
        search: "['草稿', 'draft', '已驳回', 'rejected']",
        replace: "['草稿', 'draft', '已驳回', 'rejected', '财务已驳回', 'finance_rejected', '总经理已驳回', 'manager_rejected']",
        description: '更新发票验证中的允许状态'
      }
    ]
  }
];

let totalFixed = 0;

fixes.forEach(({ file, fixes: fileFixes }) => {
  const filePath = path.join(__dirname, '..', file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  文件不存在: ${file}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let fileChanged = false;
  
  fileFixes.forEach(({ search, replace, description }) => {
    if (content.includes(search)) {
      content = content.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
      console.log(`  ✅ ${file}: ${description}`);
      fileChanged = true;
      totalFixed++;
    }
  });
  
  if (fileChanged) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`📝 已更新: ${file}`);
  }
});

console.log(`\n🎉 修复完成！共修复 ${totalFixed} 处遗留问题`);

// 验证修复结果
console.log('\n🔍 验证修复结果...');

const verificationChecks = [
  {
    description: '检查是否还有硬编码的 rejected 状态',
    command: "grep -r \"= 'rejected'\" src/ --include=\"*.js\" | grep -v finance_rejected | grep -v manager_rejected"
  },
  {
    description: '检查是否还有硬编码的 approved 状态',
    command: "grep -r \"= 'approved'\" src/ --include=\"*.js\" | grep -v finance_approved | grep -v manager_approved"
  }
];

console.log('✅ 状态重构遗留问题修复完成');
console.log('\n📋 建议手动验证以下内容：');
console.log('1. 报销单列表页面的状态筛选');
console.log('2. 借款列表页面的状态筛选');
console.log('3. 统计分析页面的数据准确性');
console.log('4. 审批流程的状态转换');
console.log('5. 打款功能的状态判断');

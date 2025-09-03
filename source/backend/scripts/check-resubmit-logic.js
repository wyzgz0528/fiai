#!/usr/bin/env node

/**
 * 报销单重新提交逻辑检查脚本
 * 
 * 这个脚本会检查代码中是否包含正确的重新提交逻辑，
 * 确保修复后的代码不会被意外回退。
 */

const fs = require('fs');
const path = require('path');

class ResubmitLogicChecker {
  constructor() {
    this.formServicePath = path.join(__dirname, '../src/services/formService.js');
    this.errors = [];
    this.warnings = [];
  }

  checkFile() {
    if (!fs.existsSync(this.formServicePath)) {
      this.errors.push('formService.js 文件不存在');
      return;
    }

    const content = fs.readFileSync(this.formServicePath, 'utf8');
    this.checkSubmitFormFunction(content);
  }

  checkSubmitFormFunction(content) {
    // 检查submitForm函数是否存在
    if (!content.includes('function submitForm(')) {
      this.errors.push('submitForm 函数不存在');
      return;
    }

    // 检查是否有被驳回记录检查逻辑
    const rejectedCheckPattern = /SELECT COUNT\(\*\) as count FROM reimbursements WHERE form_id = \? AND approval_status = 'rejected'/;
    if (!rejectedCheckPattern.test(content)) {
      this.errors.push('缺少被驳回记录检查逻辑');
    }

    // 检查是否有hasRejectedRecords变量
    if (!content.includes('hasRejectedRecords')) {
      this.errors.push('缺少 hasRejectedRecords 变量');
    }

    // 检查条件判断是否包含hasRejectedRecords
    const conditionPattern = /if\s*\(\s*!\s*\['draft','rejected'\]\.includes\(norm\)\s*&&\s*!\s*hasRejectedRecords\s*\)/;
    if (!conditionPattern.test(content)) {
      this.errors.push('条件判断逻辑不正确，应该包含 !hasRejectedRecords 检查');
    }

    // 检查是否有重置审批状态的逻辑
    const resetPattern = /UPDATE reimbursements SET approval_status = 'pending'/;
    if (!resetPattern.test(content)) {
      this.errors.push('缺少重置审批状态的逻辑');
    }

    // 检查是否清空驳回原因
    const clearRejectReasonPattern = /reject_reason = NULL/;
    if (!clearRejectReasonPattern.test(content)) {
      this.errors.push('缺少清空驳回原因的逻辑');
    }

    // 检查是否重置统计字段
    const resetCountPattern = /UPDATE reimbursement_forms SET approved_record_count = 0, rejected_record_count = 0/;
    if (!resetCountPattern.test(content)) {
      this.warnings.push('建议重置报销单的统计字段 (approved_record_count, rejected_record_count)');
    }

    // 检查是否清理审批历史
    const clearHistoryPattern = /DELETE FROM reimbursement_form_approval_logs WHERE form_id = \?/;
    if (!clearHistoryPattern.test(content)) {
      this.warnings.push('建议清理审批历史记录，避免状态冲突');
    }
  }

  generateReport() {
    console.log('🔍 报销单重新提交逻辑检查报告\n');
    console.log('=' .repeat(50));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ 所有检查通过！重新提交逻辑正确实现。');
      return true;
    }

    if (this.errors.length > 0) {
      console.log('❌ 发现错误:');
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      console.log('');
    }

    if (this.warnings.length > 0) {
      console.log('⚠️  警告:');
      this.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
      console.log('');
    }

    console.log('=' .repeat(50));
    
    if (this.errors.length > 0) {
      console.log('❌ 检查失败！请修复上述错误。');
      return false;
    } else {
      console.log('✅ 核心逻辑正确，但有一些建议改进的地方。');
      return true;
    }
  }

  run() {
    this.checkFile();
    const success = this.generateReport();
    process.exit(success ? 0 : 1);
  }
}

// 运行检查
if (require.main === module) {
  const checker = new ResubmitLogicChecker();
  checker.run();
}

module.exports = ResubmitLogicChecker;

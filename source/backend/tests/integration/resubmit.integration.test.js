#!/usr/bin/env node

/**
 * 报销单重新提交功能集成测试
 * 
 * 这个测试脚本会：
 * 1. 创建一个测试报销单
 * 2. 模拟财务驳回
 * 3. 测试重新提交功能
 * 4. 验证被驳回记录状态是否正确重置
 */

const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const BASE_URL = 'http://localhost:3001/api';
const DB_PATH = path.join(__dirname, '../../src/db.sqlite');

class ResubmitIntegrationTest {
  constructor() {
    this.db = new Database(DB_PATH);
    this.userToken = null;
    this.financeToken = null;
    this.testFormId = null;
  }

  async login(username, password) {
    try {
      const response = await axios.post(`${BASE_URL}/user/login`, {
        username,
        password
      });
      return response.data.token;
    } catch (error) {
      throw new Error(`登录失败: ${error.response?.data?.message || error.message}`);
    }
  }

  async createTestForm() {
    try {
      const response = await axios.post(`${BASE_URL}/reimbursement/reimbursement-forms/auto-generate`, {
        items: [{
          amount: 100,
          purpose: '集成测试报销',
          type: '差旅费',
          remark: '测试用途'
        }],
        statusFlag: '提交申请'
      }, {
        headers: { Authorization: `Bearer ${this.userToken}` }
      });
      
      this.testFormId = response.data.formId;
      console.log(`✅ 创建测试报销单成功: ID=${this.testFormId}`);
      return this.testFormId;
    } catch (error) {
      throw new Error(`创建报销单失败: ${error.response?.data?.message || error.message}`);
    }
  }

  async rejectRecord(formId, recordId) {
    // 直接通过数据库操作模拟财务驳回
    try {
      this.db.prepare(`
        UPDATE reimbursements 
        SET approval_status = 'rejected', reject_reason = '集成测试驳回' 
        WHERE id = ? AND form_id = ?
      `).run(recordId, formId);
      
      this.db.prepare(`
        UPDATE reimbursement_forms 
        SET rejected_record_count = 1 
        WHERE id = ?
      `).run(formId);
      
      console.log(`✅ 模拟驳回记录成功: recordId=${recordId}`);
    } catch (error) {
      throw new Error(`模拟驳回失败: ${error.message}`);
    }
  }

  async resubmitForm(formId) {
    try {
      const response = await axios.post(`${BASE_URL}/reimbursement/reimbursement-forms/${formId}/submit`, {}, {
        headers: { Authorization: `Bearer ${this.userToken}` }
      });
      
      console.log(`✅ 重新提交报销单成功: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      throw new Error(`重新提交失败: ${error.response?.data?.message || error.message}`);
    }
  }

  checkRecordStatus(formId) {
    const records = this.db.prepare(`
      SELECT id, approval_status, reject_reason 
      FROM reimbursements 
      WHERE form_id = ?
    `).all(formId);
    
    const form = this.db.prepare(`
      SELECT rejected_record_count, approved_record_count 
      FROM reimbursement_forms 
      WHERE id = ?
    `).get(formId);
    
    return { records, form };
  }

  async cleanup() {
    if (this.testFormId) {
      try {
        // 删除测试数据
        this.db.prepare('DELETE FROM reimbursements WHERE form_id = ?').run(this.testFormId);
        this.db.prepare('DELETE FROM reimbursement_forms WHERE id = ?').run(this.testFormId);
        console.log(`🗑️  清理测试数据完成: formId=${this.testFormId}`);
      } catch (error) {
        console.warn(`⚠️  清理测试数据失败: ${error.message}`);
      }
    }
    this.db.close();
  }

  async run() {
    try {
      console.log('🚀 开始报销单重新提交集成测试...\n');

      // 1. 登录获取token
      console.log('1️⃣  登录用户...');
      this.userToken = await this.login('user', '123456');
      console.log('✅ 用户登录成功\n');

      // 2. 创建测试报销单
      console.log('2️⃣  创建测试报销单...');
      const formId = await this.createTestForm();
      
      // 获取报销记录ID
      const records = this.db.prepare('SELECT id FROM reimbursements WHERE form_id = ?').all(formId);
      if (records.length === 0) {
        throw new Error('未找到报销记录');
      }
      const recordId = records[0].id;
      console.log(`✅ 报销记录ID: ${recordId}\n`);

      // 3. 检查初始状态
      console.log('3️⃣  检查初始状态...');
      let status = this.checkRecordStatus(formId);
      console.log('初始状态:', {
        records: status.records.map(r => ({ id: r.id, approval_status: r.approval_status, reject_reason: r.reject_reason })),
        form: status.form
      });
      console.log('');

      // 4. 模拟财务驳回
      console.log('4️⃣  模拟财务驳回...');
      await this.rejectRecord(formId, recordId);
      
      status = this.checkRecordStatus(formId);
      console.log('驳回后状态:', {
        records: status.records.map(r => ({ id: r.id, approval_status: r.approval_status, reject_reason: r.reject_reason })),
        form: status.form
      });
      
      // 验证驳回状态
      if (status.records[0].approval_status !== 'rejected') {
        throw new Error('驳回状态设置失败');
      }
      if (status.form.rejected_record_count !== 1) {
        throw new Error('报销单驳回计数错误');
      }
      console.log('✅ 驳回状态验证通过\n');

      // 5. 重新提交报销单
      console.log('5️⃣  重新提交报销单...');
      await this.resubmitForm(formId);
      
      // 6. 验证重置结果
      console.log('6️⃣  验证重置结果...');
      status = this.checkRecordStatus(formId);
      console.log('重新提交后状态:', {
        records: status.records.map(r => ({ id: r.id, approval_status: r.approval_status, reject_reason: r.reject_reason })),
        form: status.form
      });

      // 验证重置效果
      const errors = [];
      if (status.records[0].approval_status !== 'pending') {
        errors.push(`记录状态未重置: 期望 'pending', 实际 '${status.records[0].approval_status}'`);
      }
      if (status.records[0].reject_reason !== null) {
        errors.push(`驳回原因未清空: 期望 null, 实际 '${status.records[0].reject_reason}'`);
      }
      if (status.form.rejected_record_count !== 0) {
        errors.push(`报销单驳回计数未重置: 期望 0, 实际 ${status.form.rejected_record_count}`);
      }

      if (errors.length > 0) {
        throw new Error(`重置验证失败:\n${errors.join('\n')}`);
      }

      console.log('✅ 重置结果验证通过\n');
      console.log('🎉 报销单重新提交集成测试全部通过！');

    } catch (error) {
      console.error('❌ 集成测试失败:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new ResubmitIntegrationTest();
  test.run().catch(console.error);
}

module.exports = ResubmitIntegrationTest;

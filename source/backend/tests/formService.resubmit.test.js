const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 模拟依赖函数
const { logAction } = () => {};
const normalizeFormStatus = (status) => {
  const statusMap = {
    '草稿': 'draft',
    '已驳回': 'rejected',
    '待财务审核': 'submitted',
    '财务已审核': 'finance_approved',
    '经理已审核': 'manager_approved'
  };
  return statusMap[status] || 'unknown';
};
const ensureApprovalSchema = () => {};

// 导入被测试的函数
const { submitForm } = require('../src/services/formService');

describe('报销单重新提交功能测试', () => {
  let db;
  let testDbPath;

  beforeEach(() => {
    // 创建临时测试数据库
    testDbPath = path.join(__dirname, 'test_resubmit.db');
    db = new Database(testDbPath);
    
    // 创建必要的表结构
    db.exec(`
      CREATE TABLE reimbursement_forms (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        status TEXT,
        approved_record_count INTEGER DEFAULT 0,
        rejected_record_count INTEGER DEFAULT 0
      );
      
      CREATE TABLE reimbursements (
        id INTEGER PRIMARY KEY,
        form_id INTEGER,
        amount REAL,
        purpose TEXT,
        status TEXT,
        approval_status TEXT DEFAULT 'pending',
        reject_reason TEXT,
        FOREIGN KEY (form_id) REFERENCES reimbursement_forms(id)
      );
      
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        role TEXT
      );
      
      CREATE TABLE action_logs (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        action TEXT,
        detail TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 插入测试数据
    db.prepare(`
      INSERT INTO users (id, username, role) 
      VALUES (1, 'testuser', 'employee')
    `).run();
    
    // 模拟全局db对象和依赖函数
    global.db = db;
    global.logAction = logAction;
    global.normalizeFormStatus = normalizeFormStatus;
    global.ensureApprovalSchema = ensureApprovalSchema;
  });

  afterEach(() => {
    // 清理测试数据库
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    delete global.db;
    delete global.logAction;
    delete global.normalizeFormStatus;
    delete global.ensureApprovalSchema;
  });

  describe('被驳回报销单重新提交', () => {
    it('应该重置被驳回记录的状态', () => {
      // 准备测试数据：创建一个有被驳回记录的报销单
      const formId = db.prepare(`
        INSERT INTO reimbursement_forms (user_id, status, rejected_record_count)
        VALUES (1, '待财务审核', 1)
      `).run().lastInsertRowid;
      
      db.prepare(`
        INSERT INTO reimbursements (form_id, amount, purpose, status, approval_status, reject_reason)
        VALUES (?, 100, '测试报销', '已归集到报销单', 'rejected', '金额不符')
      `).run(formId);
      
      // 验证测试数据
      const testForm = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
      console.log('测试表单数据:', testForm);
      console.log('用户数据:', { userId: 1 });
      console.log('权限检查:', testForm.user_id, '!==', 1, '=', testForm.user_id !== 1);

      // 执行重新提交
      const user = { userId: 1 };
      const result = submitForm(formId, user);
      
      // 验证结果
      expect(result).to.have.property('formId', formId);
      expect(result).to.have.property('status', '待财务审核');
      
      // 验证报销记录状态被重置
      const record = db.prepare('SELECT * FROM reimbursements WHERE form_id = ?').get(formId);
      expect(record.approval_status).to.equal('pending');
      expect(record.reject_reason).to.be.null;
      
      // 验证报销单统计数据被重置
      const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
      expect(form.rejected_record_count).to.equal(0);
    });

    it('应该处理多个被驳回记录的情况', () => {
      // 准备测试数据：创建一个有多个被驳回记录的报销单
      const formId = db.prepare(`
        INSERT INTO reimbursement_forms (user_id, status, rejected_record_count) 
        VALUES (1, '待财务审核', 2)
      `).run().lastInsertRowid;
      
      db.prepare(`
        INSERT INTO reimbursements (form_id, amount, purpose, status, approval_status, reject_reason)
        VALUES 
        (?, 100, '测试报销1', '已归集到报销单', 'rejected', '金额不符'),
        (?, 200, '测试报销2', '已归集到报销单', 'rejected', '发票不清晰'),
        (?, 300, '测试报销3', '已归集到报销单', 'approved', NULL)
      `).run(formId, formId, formId);
      
      // 执行重新提交
      const user = { userId: 1 };
      const result = submitForm(formId, user);
      
      // 验证所有被驳回记录都被重置
      const rejectedRecords = db.prepare(
        'SELECT * FROM reimbursements WHERE form_id = ? AND approval_status = ?'
      ).all(formId, 'rejected');
      expect(rejectedRecords).to.have.length(0);
      
      // 验证重置后的记录状态
      const pendingRecords = db.prepare(
        'SELECT * FROM reimbursements WHERE form_id = ? AND approval_status = ?'
      ).all(formId, 'pending');
      expect(pendingRecords).to.have.length(2);
      
      // 验证已通过的记录不受影响
      const approvedRecords = db.prepare(
        'SELECT * FROM reimbursements WHERE form_id = ? AND approval_status = ?'
      ).all(formId, 'approved');
      expect(approvedRecords).to.have.length(1);
    });

    it('没有被驳回记录时应该正常返回', () => {
      // 准备测试数据：创建一个没有被驳回记录的已提交报销单
      const formId = db.prepare(`
        INSERT INTO reimbursement_forms (user_id, status, rejected_record_count) 
        VALUES (1, '待财务审核', 0)
      `).run().lastInsertRowid;
      
      db.prepare(`
        INSERT INTO reimbursements (form_id, amount, purpose, status, approval_status)
        VALUES (?, 100, '测试报销', '已归集到报销单', 'pending')
      `).run(formId);
      
      // 执行重新提交
      const user = { userId: 1 };
      const result = submitForm(formId, user);
      
      // 验证幂等性：应该直接返回，不做任何修改
      expect(result).to.have.property('formId', formId);
      expect(result).to.have.property('status', '待财务审核');
      
      // 验证记录状态没有变化
      const record = db.prepare('SELECT * FROM reimbursements WHERE form_id = ?').get(formId);
      expect(record.approval_status).to.equal('pending');
    });
  });

  describe('边界情况测试', () => {
    it('应该拒绝非法用户的提交', () => {
      const formId = db.prepare(`
        INSERT INTO reimbursement_forms (user_id, status) 
        VALUES (1, '待财务审核')
      `).run().lastInsertRowid;
      
      const wrongUser = { userId: 999 };
      
      expect(() => {
        submitForm(formId, wrongUser);
      }).to.throw('FORBIDDEN');
    });

    it('应该拒绝不存在的报销单', () => {
      const user = { userId: 1 };
      
      expect(() => {
        submitForm(999, user);
      }).to.throw('NOT_FOUND');
    });
  });
});

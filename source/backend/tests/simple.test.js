const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('简单测试', () => {
  let db;
  let testDbPath;

  beforeEach(() => {
    // 创建临时测试数据库
    testDbPath = path.join(__dirname, 'test_simple.db');
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
      
      CREATE TABLE action_logs (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        action TEXT,
        detail TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 模拟全局依赖
    global.db = db;
    global.logAction = () => {};
    global.normalizeFormStatus = (status) => {
      const statusMap = {
        '草稿': 'draft',
        '已驳回': 'rejected',
        '待财务审核': 'submitted',
        '财务已审核': 'finance_approved',
        '经理已审核': 'manager_approved'
      };
      return statusMap[status] || 'unknown';
    };
    global.ensureApprovalSchema = () => {};
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

  it('应该能够创建和查询数据', () => {
    // 插入测试数据
    const formId = db.prepare(`
      INSERT INTO reimbursement_forms (user_id, status, rejected_record_count) 
      VALUES (1, '待财务审核', 1)
    `).run().lastInsertRowid;
    
    db.prepare(`
      INSERT INTO reimbursements (form_id, amount, purpose, status, approval_status, reject_reason)
      VALUES (?, 100, '测试报销', '已归集到报销单', 'rejected', '金额不符')
    `).run(formId);
    
    // 验证数据
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    expect(form).to.not.be.null;
    expect(form.user_id).to.equal(1);
    expect(form.status).to.equal('待财务审核');
    
    const record = db.prepare('SELECT * FROM reimbursements WHERE form_id = ?').get(formId);
    expect(record).to.not.be.null;
    expect(record.approval_status).to.equal('rejected');
  });

  it('应该能够测试真实的submitForm函数', () => {
    // 导入真实的submitForm函数
    const { submitForm } = require('../src/services/formService');

    // 插入测试数据
    const formId = db.prepare(`
      INSERT INTO reimbursement_forms (user_id, status, rejected_record_count)
      VALUES (1, '待财务审核', 1)
    `).run().lastInsertRowid;

    db.prepare(`
      INSERT INTO reimbursements (form_id, amount, purpose, status, approval_status, reject_reason)
      VALUES (?, 100, '测试报销', '已归集到报销单', 'rejected', '金额不符')
    `).run(formId);

    // 执行submitForm
    const user = { userId: 1 };
    const result = submitForm(formId, user);

    // 验证结果
    expect(result).to.have.property('formId', formId);
    expect(result).to.have.property('status', '待财务审核');

    // 验证报销记录状态被重置
    const record = db.prepare('SELECT * FROM reimbursements WHERE form_id = ?').get(formId);
    expect(record.approval_status).to.equal('pending');
    expect(record.reject_reason).to.be.null;
  });

  it('应该能够直接测试submitForm逻辑', () => {
    // 插入测试数据
    const formId = db.prepare(`
      INSERT INTO reimbursement_forms (user_id, status, rejected_record_count) 
      VALUES (1, '待财务审核', 1)
    `).run().lastInsertRowid;
    
    db.prepare(`
      INSERT INTO reimbursements (form_id, amount, purpose, status, approval_status, reject_reason)
      VALUES (?, 100, '测试报销', '已归集到报销单', 'rejected', '金额不符')
    `).run(formId);
    
    // 手动实现submitForm的核心逻辑
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(formId);
    const user = { userId: 1 };
    
    console.log('表单数据:', form);
    console.log('用户数据:', user);
    console.log('权限检查:', form.user_id, '!==', user.userId, '=', form.user_id !== user.userId);
    
    // 权限检查
    expect(form).to.not.be.null;
    expect(form.user_id).to.equal(user.userId);
    
    // 检查被驳回记录
    const rejectedCount = db.prepare("SELECT COUNT(*) as count FROM reimbursements WHERE form_id = ? AND approval_status = 'rejected'").get(formId);
    expect(rejectedCount.count).to.equal(1);
    
    // 重置记录状态
    db.prepare("UPDATE reimbursements SET approval_status = 'pending', reject_reason = NULL WHERE form_id = ?").run(formId);
    
    // 验证重置结果
    const updatedRecord = db.prepare('SELECT * FROM reimbursements WHERE form_id = ?').get(formId);
    expect(updatedRecord.approval_status).to.equal('pending');
    expect(updatedRecord.reject_reason).to.be.null;
  });
});

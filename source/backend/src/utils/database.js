const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { logger } = require('../middlewares/errorHandler');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  // 初始化数据库连接
  initialize(dbPath = null) {
    try {
      const DB_PATH = dbPath || path.join(__dirname, '..', 'db.sqlite');
      
      // 确保数据库目录存在
      const dbDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(DB_PATH, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : null,
        fileMustExist: false
      });

      // 启用WAL模式提高并发性能
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('temp_store = memory');

      this.isInitialized = true;
      logger.info('数据库连接初始化成功', { path: DB_PATH });
      
      return this.db;
    } catch (error) {
      logger.error('数据库连接初始化失败', { error: error.message });
      throw error;
    }
  }

  // 获取数据库实例
  getDatabase() {
    if (!this.isInitialized) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  // 执行事务
  async transaction(callback) {
    if (!this.isInitialized) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      try {
        this.db.transaction(() => {
          try {
            const result = callback(this.db);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })();
      } catch (error) {
        reject(error);
      }
    });
  }

  // 执行查询并返回单条记录
  get(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(params);
    } catch (error) {
      logger.error('数据库查询失败', { sql, params, error: error.message });
      throw error;
    }
  }

  // 执行查询并返回多条记录
  all(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(params);
    } catch (error) {
      logger.error('数据库查询失败', { sql, params, error: error.message });
      throw error;
    }
  }

  // 执行更新操作
  run(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.run(params);
    } catch (error) {
      logger.error('数据库更新失败', { sql, params, error: error.message });
      throw error;
    }
  }

  // 批量执行操作
  batch(operations) {
    try {
      return this.db.transaction(() => {
        const results = [];
        for (const operation of operations) {
          const stmt = this.db.prepare(operation.sql);
          const result = stmt.run(operation.params || []);
          results.push(result);
        }
        return results;
      })();
    } catch (error) {
      logger.error('批量操作失败', { operations, error: error.message });
      throw error;
    }
  }

  // 创建索引以提高查询性能
  createIndexes() {
    const indexes = [
      // 用户表索引
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      
      // 借款表索引
      'CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)',
      'CREATE INDEX IF NOT EXISTS idx_loans_created_at ON loans(created_at)',
      
      // 报销表索引
      'CREATE INDEX IF NOT EXISTS idx_reimbursements_user_id ON reimbursements(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_reimbursements_status ON reimbursements(status)',
      'CREATE INDEX IF NOT EXISTS idx_reimbursements_created_at ON reimbursements(created_at)',
      
      // 日志表索引
      'CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action)',
      
      // 审批日志索引
      'CREATE INDEX IF NOT EXISTS idx_loan_approval_logs_loan_id ON loan_approval_logs(loan_id)',
      'CREATE INDEX IF NOT EXISTS idx_reimbursement_approval_logs_reimbursement_id ON reimbursement_approval_logs(reimbursement_id)',
      
      // 附件表索引
      'CREATE INDEX IF NOT EXISTS idx_attachments_reimbursement_id ON attachments(reimbursement_id)',
      
      // 报销单表索引
      'CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_user_id ON reimbursement_forms(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_status ON reimbursement_forms(status)',
      'CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_form_number ON reimbursement_forms(form_number)'
    ];

    try {
      for (const indexSql of indexes) {
        this.db.exec(indexSql);
      }
      logger.info('数据库索引创建完成');
    } catch (error) {
      logger.error('创建数据库索引失败', { error: error.message });
      throw error;
    }
  }

  // 数据库备份
  backup(backupPath) {
    try {
      const backupDir = path.dirname(backupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      this.db.backup(backupPath);
      logger.info('数据库备份完成', { backupPath });
    } catch (error) {
      logger.error('数据库备份失败', { backupPath, error: error.message });
      throw error;
    }
  }

  // 获取数据库统计信息
  getStats() {
    try {
      const stats = {
        tables: this.all("SELECT name FROM sqlite_master WHERE type='table'"),
        size: fs.statSync(this.db.name).size,
        userCount: this.get("SELECT COUNT(*) as count FROM users").count,
        loanCount: this.get("SELECT COUNT(*) as count FROM loans").count,
        reimbursementCount: this.get("SELECT COUNT(*) as count FROM reimbursements").count,
        logCount: this.get("SELECT COUNT(*) as count FROM logs").count
      };
      
      return stats;
    } catch (error) {
      logger.error('获取数据库统计信息失败', { error: error.message });
      throw error;
    }
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      this.db.close();
      this.isInitialized = false;
      logger.info('数据库连接已关闭');
    }
  }
}

// 创建单例实例
const dbManager = new DatabaseManager();

module.exports = dbManager; 
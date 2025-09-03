const Database = require('better-sqlite3');
const path = require('path');

/**
 * 发票信息服务
 * 处理发票信息的存储、检索和管理
 */
class InvoiceService {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'db.sqlite');
  }

  /**
   * 处理发票号：仅保留最后8位数字或字母
   */
  processInvoiceNumber(invoiceNumber) {
    if (!invoiceNumber || typeof invoiceNumber !== 'string') return '';
    const alphanumeric = invoiceNumber.replace(/[^a-zA-Z0-9]/g, '');
    if (!alphanumeric) return '';
    return alphanumeric.length <= 8 ? alphanumeric : alphanumeric.slice(-8);
  }

  /**
   * 获取数据库连接
   */
  getDb() {
    return new Database(this.dbPath);
  }

  /**
   * 保存OCR识别的发票信息到报销记录
   * @param {number} reimbursementId - 报销记录ID
   * @param {Object} ocrResult - OCR识别结果
   * @param {string} mode - 识别模式 (production/mock/manual)
   */
  async saveInvoiceInfo(reimbursementId, ocrResult, mode = 'production') {
    const db = this.getDb();

    try {
      // 提取OCR结果中的字段，并对发票号进行后8位归一化
      const rawInvoiceNumber = this.extractFieldValue(ocrResult.invoice_number);
      const invoiceData = {
        invoice_number: this.processInvoiceNumber(rawInvoiceNumber || ''),
        invoice_amount: this.extractFieldValue(ocrResult.amount, 'number'),
        invoice_date: this.extractFieldValue(ocrResult.invoice_date, 'date'),
        buyer_name: this.extractFieldValue(ocrResult.buyer_name),
        service_name: this.extractFieldValue(ocrResult.service_name),
        ocr_confidence: ocrResult.confidence || 0.0,
        ocr_processed_at: new Date().toISOString(),
        ocr_mode: mode
      };

      // 更新报销记录
      const updateSql = `
        UPDATE reimbursements
        SET invoice_number = ?,
            invoice_amount = ?,
            invoice_date = ?,
            buyer_name = ?,
            service_name = ?,
            ocr_confidence = ?,
            ocr_processed_at = ?,
            ocr_mode = ?
        WHERE id = ?
      `;

      const stmt = db.prepare(updateSql);
      const result = stmt.run(
        invoiceData.invoice_number,
        invoiceData.invoice_amount,
        invoiceData.invoice_date,
        invoiceData.buyer_name,
        invoiceData.service_name,
        invoiceData.ocr_confidence,
        invoiceData.ocr_processed_at,
        invoiceData.ocr_mode,
        reimbursementId
      );

      if (result.changes === 0) {
        throw new Error(`报销记录 ${reimbursementId} 不存在或更新失败`);
      }

      console.log(`✓ 发票信息已保存到报销记录 ${reimbursementId}`);
      return {
        success: true,
        reimbursementId,
        invoiceData
      };

    } catch (error) {
      console.error('保存发票信息失败:', error);
      throw error;
    } finally {
      db.close();
    }
  }

  /**
   * 获取报销记录的发票信息
   * @param {number} reimbursementId - 报销记录ID
   */
  async getInvoiceInfo(reimbursementId) {
    const db = this.getDb();
    
    try {
      const sql = `
        SELECT 
          id, user_id, amount, purpose, type, remark, status,
          invoice_number, invoice_amount, invoice_date, 
          buyer_name, service_name, ocr_confidence, 
          ocr_processed_at, ocr_mode, created_at
        FROM reimbursements 
        WHERE id = ?
      `;

      const stmt = db.prepare(sql);
      const record = stmt.get(reimbursementId);

      if (!record) {
        return {
          success: false,
          error: `报销记录 ${reimbursementId} 不存在`
        };
      }

      return {
        success: true,
        data: {
          reimbursement: {
            id: record.id,
            user_id: record.user_id,
            amount: record.amount,
            purpose: record.purpose,
            type: record.type,
            remark: record.remark,
            status: record.status,
            created_at: record.created_at
          },
          invoice: {
            invoice_number: record.invoice_number,
            invoice_amount: record.invoice_amount,
            invoice_date: record.invoice_date,
            buyer_name: record.buyer_name,
            service_name: record.service_name,
            ocr_confidence: record.ocr_confidence,
            ocr_processed_at: record.ocr_processed_at,
            ocr_mode: record.ocr_mode
          }
        }
      };

    } catch (error) {
      console.error('获取发票信息失败:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      db.close();
    }
  }

  /**
   * 批量获取报销记录的发票信息（用于台账导出）
   * @param {Object} filters - 过滤条件
   */
  async getInvoiceInfoBatch(filters = {}) {
    const db = this.getDb();
    
    try {
      let sql = `
        SELECT 
          r.id, r.user_id, r.amount, r.purpose, r.type, r.remark, r.status,
          r.invoice_number, r.invoice_amount, r.invoice_date, 
          r.buyer_name, r.service_name, r.ocr_confidence, 
          r.ocr_processed_at, r.ocr_mode, r.created_at,
          u.real_name, u.username
        FROM reimbursements r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE 1=1
      `;

      const params = [];

      // 添加过滤条件
      if (filters.user_id) {
        sql += ' AND r.user_id = ?';
        params.push(filters.user_id);
      }

      if (filters.status) {
        sql += ' AND r.status = ?';
        params.push(filters.status);
      }

      if (filters.start_date) {
        sql += ' AND r.created_at >= ?';
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        sql += ' AND r.created_at <= ?';
        params.push(filters.end_date);
      }

      if (filters.has_invoice) {
        sql += ' AND r.invoice_number IS NOT NULL AND r.invoice_number != \'\'';
      }

      // 排序
      sql += ' ORDER BY r.created_at DESC';

      // 限制数量
      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      const stmt = db.prepare(sql);
      const records = stmt.all(...params);

      return {
        success: true,
        data: records.map(record => ({
          reimbursement: {
            id: record.id,
            user_id: record.user_id,
            user_name: record.real_name || record.username,
            amount: record.amount,
            purpose: record.purpose,
            type: record.type,
            remark: record.remark,
            status: record.status,
            created_at: record.created_at
          },
          invoice: {
            invoice_number: record.invoice_number,
            invoice_amount: record.invoice_amount,
            invoice_date: record.invoice_date,
            buyer_name: record.buyer_name,
            service_name: record.service_name,
            ocr_confidence: record.ocr_confidence,
            ocr_processed_at: record.ocr_processed_at,
            ocr_mode: record.ocr_mode
          }
        })),
        total: records.length
      };

    } catch (error) {
      console.error('批量获取发票信息失败:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      db.close();
    }
  }

  /**
   * 检查发票号是否重复
   * @param {string} invoiceNumber - 发票号
   * @param {number} excludeId - 排除的报销记录ID
   */
  async checkInvoiceDuplicate(invoiceNumber, excludeId = null) {
    const db = this.getDb();
    
    try {
      let sql = `
        SELECT r.id, r.user_id, r.amount, r.created_at, u.real_name
        FROM reimbursements r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.invoice_number = ?
      `;

      const params = [invoiceNumber];

      if (excludeId) {
        sql += ' AND r.id != ?';
        params.push(excludeId);
      }

      const stmt = db.prepare(sql);
      const duplicates = stmt.all(...params);

      return {
        success: true,
        isDuplicate: duplicates.length > 0,
        duplicates: duplicates
      };

    } catch (error) {
      console.error('检查发票号重复失败:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      db.close();
    }
  }

  /**
   * 提取字段值的辅助方法
   */
  extractFieldValue(field, type = 'string') {
    if (!field) return null;
    
    let value = null;
    if (typeof field === 'object' && field.value !== undefined) {
      value = field.value;
    } else {
      value = field;
    }

    if (value === null || value === undefined || value === '') {
      return null;
    }

    // 类型转换
    switch (type) {
      case 'number':
        return parseFloat(value) || null;
      case 'date':
        // 验证日期格式 YYYY-MM-DD
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value;
        }
        return null;
      default:
        return String(value).trim() || null;
    }
  }
}

module.exports = new InvoiceService();

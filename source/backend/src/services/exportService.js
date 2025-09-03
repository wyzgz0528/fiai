// const XLSX = require('xlsx'); // 已移除xlsx依赖，使用CSV导出
const path = require('path');
const fs = require('fs');
const invoiceService = require('./invoiceService');

/**
 * 导出服务
 * 处理财务台账和报销记录的导出功能
 */
class ExportService {
  constructor() {
    this.exportDir = path.join(__dirname, '..', '..', 'exports');
    this.ensureExportDir();
  }

  /**
   * 确保导出目录存在
   */
  ensureExportDir() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * 导出财务台账（包含发票信息的报销记录）
   * @param {Object} filters - 过滤条件
   * @param {Object} options - 导出选项
   */
  async exportFinancialLedger(filters = {}, options = {}) {
    return {
      success: false,
      error: 'Excel导出功能已禁用，请使用CSV格式导出'
    };
  }

  /**
   * 准备财务台账Excel数据
   */
  prepareFinancialLedgerData(records) {
    const mainData = [];
    const summaryData = [];

    // 统计数据
    let totalAmount = 0;
    let totalInvoiceAmount = 0;
    let recordsWithInvoice = 0;
    const statusCount = {};
    const typeCount = {};
    const userCount = {};

    records.forEach((record, index) => {
      const reimbursement = record.reimbursement;
      const invoice = record.invoice;

      // 主表数据
      mainData.push({
        '序号': index + 1,
        '报销记录ID': reimbursement.id,
        '用户姓名': reimbursement.user_name || '未知',
        '报销金额': reimbursement.amount || 0,
        '报销用途': reimbursement.purpose || '',
        '报销类型': reimbursement.type || '',
        '状态': reimbursement.status || '',
        '创建时间': reimbursement.created_at || '',
        '发票号码': invoice.invoice_number || '',
        '发票金额': invoice.invoice_amount || 0,
        '开票日期': invoice.invoice_date || '',
        '购买方名称': invoice.buyer_name || '',
        '服务名称': invoice.service_name || '',
        'OCR置信度': invoice.ocr_confidence ? (invoice.ocr_confidence * 100).toFixed(1) + '%' : '',
        'OCR处理时间': invoice.ocr_processed_at || '',
        'OCR模式': invoice.ocr_mode || '',
        '备注': reimbursement.remark || ''
      });

      // 统计数据
      totalAmount += reimbursement.amount || 0;
      if (invoice.invoice_amount) {
        totalInvoiceAmount += invoice.invoice_amount;
      }
      if (invoice.invoice_number) {
        recordsWithInvoice++;
      }

      // 状态统计
      const status = reimbursement.status || '未知';
      statusCount[status] = (statusCount[status] || 0) + 1;

      // 类型统计
      const type = reimbursement.type || '未知';
      typeCount[type] = (typeCount[type] || 0) + 1;

      // 用户统计
      const user = reimbursement.user_name || '未知';
      userCount[user] = (userCount[user] || 0) + 1;
    });

    // 汇总表数据
    summaryData.push(
      { '统计项目': '总记录数', '数值': records.length, '单位': '条' },
      { '统计项目': '有发票记录数', '数值': recordsWithInvoice, '单位': '条' },
      { '统计项目': '发票覆盖率', '数值': records.length > 0 ? ((recordsWithInvoice / records.length) * 100).toFixed(1) : 0, '单位': '%' },
      { '统计项目': '报销总金额', '数值': totalAmount.toFixed(2), '单位': '元' },
      { '统计项目': '发票总金额', '数值': totalInvoiceAmount.toFixed(2), '单位': '元' },
      { '统计项目': '金额差异', '数值': (totalAmount - totalInvoiceAmount).toFixed(2), '单位': '元' },
      { '统计项目': '', '数值': '', '单位': '' }, // 空行
      { '统计项目': '按状态统计', '数值': '', '单位': '' }
    );

    // 添加状态统计
    Object.entries(statusCount).forEach(([status, count]) => {
      summaryData.push({
        '统计项目': `  ${status}`,
        '数值': count,
        '单位': '条'
      });
    });

    summaryData.push({ '统计项目': '', '数值': '', '单位': '' }); // 空行
    summaryData.push({ '统计项目': '按类型统计', '数值': '', '单位': '' });

    // 添加类型统计
    Object.entries(typeCount).forEach(([type, count]) => {
      summaryData.push({
        '统计项目': `  ${type}`,
        '数值': count,
        '单位': '条'
      });
    });

    return {
      main: mainData,
      summary: summaryData
    };
  }

  /**
   * 导出简单的报销记录列表
   * @param {Object} filters - 过滤条件
   */
  async exportReimbursementList(filters = {}) {
    return {
      success: false,
      error: 'Excel导出功能已禁用，请使用CSV格式导出'
    };
  }

  /**
   * 清理过期的导出文件
   * @param {number} maxAgeHours - 文件最大保留时间（小时）
   */
  cleanupOldExports(maxAgeHours = 24) {
    try {
      const files = fs.readdirSync(this.exportDir);
      const now = Date.now();
      let deletedCount = 0;

      files.forEach(filename => {
        const filepath = path.join(this.exportDir, filename);
        const stats = fs.statSync(filepath);
        const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);

        if (ageHours > maxAgeHours) {
          fs.unlinkSync(filepath);
          deletedCount++;
          console.log(`删除过期导出文件: ${filename}`);
        }
      });

      console.log(`清理完成，删除了 ${deletedCount} 个过期文件`);
      return { success: true, deletedCount };

    } catch (error) {
      console.error('清理导出文件失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取导出文件列表
   */
  getExportFiles() {
    try {
      const files = fs.readdirSync(this.exportDir);
      const fileList = files.map(filename => {
        const filepath = path.join(this.exportDir, filename);
        const stats = fs.statSync(filepath);
        
        return {
          filename,
          filepath,
          size: stats.size,
          created: stats.mtime,
          age: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60)) // 小时
        };
      });

      return {
        success: true,
        files: fileList.sort((a, b) => b.created - a.created) // 按创建时间倒序
      };

    } catch (error) {
      console.error('获取导出文件列表失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new ExportService();

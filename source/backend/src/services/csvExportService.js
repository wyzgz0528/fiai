const path = require('path');
const fs = require('fs');
const invoiceService = require('./invoiceService');

/**
 * CSV导出服务
 * 替代xlsx库，避免安全漏洞
 */
class CsvExportService {
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
   * 转义CSV字段中的特殊字符
   */
  escapeField(field) {
    if (field === null || field === undefined) {
      return '';
    }
    
    const str = String(field);
    // 如果包含逗号、引号或换行符，需要用引号包围并转义内部引号
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * 将JSON数据转换为CSV格式
   */
  jsonToCsv(data, headers = null) {
    if (!data || data.length === 0) {
      return '';
    }

    // 如果没有提供headers，从第一行数据中提取
    if (!headers) {
      headers = Object.keys(data[0]);
    }

    // 构建CSV内容
    const csvRows = [];
    
    // 添加BOM以支持中文显示
    csvRows.push('\uFEFF');
    
    // 添加表头
    csvRows.push(headers.map(h => this.escapeField(h)).join(','));
    
    // 添加数据行
    data.forEach(row => {
      const values = headers.map(header => this.escapeField(row[header]));
      csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * 导出财务台账为CSV
   */
  async exportFinancialLedger(filters = {}) {
    try {
      console.log('开始导出财务台账CSV:', filters);

      // 获取报销记录数据
      const result = await invoiceService.getReimbursementRecordsWithInvoices(filters);
      
      if (!result.success) {
        throw new Error(result.error || '获取数据失败');
      }

      const records = result.data;
      console.log(`获取到 ${records.length} 条记录`);

      // 准备CSV数据
      const csvData = this.prepareFinancialLedgerData(records);

      // 生成主表CSV
      const mainCsv = this.jsonToCsv(csvData.main);
      
      // 生成汇总表CSV
      const summaryCsv = this.jsonToCsv(csvData.summary);

      // 生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const mainFilename = `财务台账_${timestamp}.csv`;
      const summaryFilename = `财务台账汇总_${timestamp}.csv`;
      
      const mainFilepath = path.join(this.exportDir, mainFilename);
      const summaryFilepath = path.join(this.exportDir, summaryFilename);

      // 写入文件
      fs.writeFileSync(mainFilepath, mainCsv, 'utf8');
      fs.writeFileSync(summaryFilepath, summaryCsv, 'utf8');

      console.log(`财务台账CSV导出成功: ${mainFilename}, ${summaryFilename}`);

      return {
        success: true,
        files: [
          {
            filename: mainFilename,
            filepath: mainFilepath,
            type: 'main'
          },
          {
            filename: summaryFilename,
            filepath: summaryFilepath,
            type: 'summary'
          }
        ],
        recordCount: records.length,
        totalSize: fs.statSync(mainFilepath).size + fs.statSync(summaryFilepath).size
      };

    } catch (error) {
      console.error('导出财务台账CSV失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 导出报销记录为CSV
   */
  async exportReimbursementRecords(filters = {}) {
    try {
      console.log('开始导出报销记录CSV:', filters);

      const result = await invoiceService.getReimbursementRecordsWithInvoices(filters);
      
      if (!result.success) {
        throw new Error(result.error || '获取数据失败');
      }

      const records = result.data;

      // 准备简化的数据
      const csvData = records.map((record, index) => ({
        '序号': index + 1,
        '报销记录ID': record.reimbursement.id,
        '用户姓名': record.reimbursement.user_name || '未知',
        '报销金额': record.reimbursement.amount || 0,
        '报销用途': record.reimbursement.purpose || '',
        '报销类型': record.reimbursement.type || '',
        '状态': record.reimbursement.status || '',
        '创建时间': record.reimbursement.created_at || '',
        '发票号码': record.invoice.invoice_number || '',
        '发票金额': record.invoice.invoice_amount || 0,
        '开票日期': record.invoice.invoice_date || ''
      }));

      // 转换为CSV
      const csvContent = this.jsonToCsv(csvData);

      // 生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `报销记录_${timestamp}.csv`;
      const filepath = path.join(this.exportDir, filename);

      // 写入文件
      fs.writeFileSync(filepath, csvContent, 'utf8');

      console.log(`报销记录CSV导出成功: ${filename}`);

      return {
        success: true,
        filename,
        filepath,
        recordCount: records.length,
        fileSize: fs.statSync(filepath).size
      };

    } catch (error) {
      console.error('导出报销记录CSV失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 准备财务台账数据
   */
  prepareFinancialLedgerData(records) {
    const main = [];
    const summaryMap = new Map();

    records.forEach((record, index) => {
      const reimbursement = record.reimbursement;
      const invoice = record.invoice;

      // 主表数据
      main.push({
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
        '服务名称': invoice.service_name || ''
      });

      // 汇总统计
      const userKey = reimbursement.user_name || '未知';
      if (!summaryMap.has(userKey)) {
        summaryMap.set(userKey, {
          '用户姓名': userKey,
          '报销次数': 0,
          '报销总金额': 0,
          '有发票次数': 0,
          '发票总金额': 0
        });
      }

      const summary = summaryMap.get(userKey);
      summary['报销次数']++;
      summary['报销总金额'] += reimbursement.amount || 0;
      
      if (invoice.invoice_number) {
        summary['有发票次数']++;
        summary['发票总金额'] += invoice.invoice_amount || 0;
      }
    });

    return {
      main,
      summary: Array.from(summaryMap.values())
    };
  }
}

module.exports = new CsvExportService();

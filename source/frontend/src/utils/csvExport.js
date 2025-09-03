/**
 * CSV导出工具
 * 替代xlsx库，避免安全漏洞
 */

/**
 * 将数据转换为CSV格式
 * @param {Array} data - 要导出的数据数组
 * @param {Array} headers - 表头数组（可选）
 * @returns {string} CSV格式的字符串
 */
export function jsonToCsv(data, headers = null) {
  if (!data || data.length === 0) {
    return '';
  }

  // 如果没有提供headers，从第一行数据中提取
  if (!headers) {
    headers = Object.keys(data[0]);
  }

  // 转义CSV字段中的特殊字符
  const escapeField = (field) => {
    if (field === null || field === undefined) {
      return '';
    }
    
    const str = String(field);
    // 如果包含逗号、引号或换行符，需要用引号包围并转义内部引号
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // 构建CSV内容
  const csvRows = [];
  
  // 添加表头
  csvRows.push(headers.map(escapeField).join(','));
  
  // 添加数据行
  data.forEach(row => {
    const values = headers.map(header => escapeField(row[header]));
    csvRows.push(values.join(','));
  });

  return csvRows.join('\n');
}

/**
 * 下载CSV文件
 * @param {string} csvContent - CSV内容
 * @param {string} filename - 文件名（不包含扩展名）
 */
export function downloadCsv(csvContent, filename) {
  // 添加BOM以支持中文显示
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { 
    type: 'text/csv;charset=utf-8;' 
  });
  
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * 将JSON数据导出为CSV文件
 * @param {Array} data - 要导出的数据
 * @param {string} filename - 文件名
 * @param {Array} headers - 自定义表头（可选）
 */
export function exportToCsv(data, filename, headers = null) {
  const csvContent = jsonToCsv(data, headers);
  downloadCsv(csvContent, filename);
}

/**
 * 设置CSV列宽（仅用于兼容xlsx代码，实际CSV不支持列宽）
 * @param {Array} widths - 列宽数组（兼容性参数，实际不使用）
 * @returns {Object} 兼容对象
 */
export function setCsvColumnWidths(widths) {
  // CSV不支持列宽设置，返回空对象保持兼容性
  return {};
}

/**
 * 创建多工作表CSV导出（将多个表合并为一个CSV）
 * @param {Object} sheets - 工作表对象 {sheetName: data}
 * @param {string} filename - 文件名
 */
export function exportMultiSheetToCsv(sheets, filename) {
  const allData = [];
  
  Object.entries(sheets).forEach(([sheetName, data]) => {
    if (data && data.length > 0) {
      // 添加工作表标识行
      allData.push({ '工作表': sheetName });
      allData.push({}); // 空行分隔
      
      // 添加该工作表的数据
      allData.push(...data);
      allData.push({}); // 空行分隔
    }
  });
  
  exportToCsv(allData, filename);
}

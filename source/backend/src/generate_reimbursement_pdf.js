const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// 检查并获取可用的中文字体
function getAvailableChineseFont() {
  // 优先使用项目内的字体文件
  const projectFontPath = path.join(__dirname, 'simhei.ttf');
  if (fs.existsSync(projectFontPath)) {
    console.log(`找到项目中文字体: ${projectFontPath}`);
    return projectFontPath;
  }

  // Linux 系统常见中文字体路径（按优先级排序）
  const linuxChineseFonts = [
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',  // Noto Sans CJK（首选）
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',           // 文泉驿正黑
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',         // 文泉驿微米黑
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',        // DejaVu Sans（备选）
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', // Liberation Sans（备选）
    '/System/Library/Fonts/PingFang.ttc', // macOS
  ];

  // Windows 系统常见中文字体路径 (优先使用.ttf格式)
  const windowsChineseFonts = [
    'C:/Windows/Fonts/simhei.ttf',     // 黑体 (TTF格式，首选)
    'C:/Windows/Fonts/microsoftyaheimono.ttf', // 微软雅黑
    'C:/Windows/Fonts/simfang.ttf',    // 仿宋
    'C:/Windows/Fonts/simkai.ttf',     // 楷体
    'C:/Windows/Fonts/simsunb.ttf',    // 宋体加粗
  ];

  const allFonts = [...linuxChineseFonts, ...windowsChineseFonts];

  for (const fontPath of allFonts) {
    if (fs.existsSync(fontPath)) {
      console.log(`找到系统中文字体: ${fontPath}`);
      return fontPath;
    }
  }

  console.warn('未找到中文字体，将使用默认字体');
  return null;
}

// 获取审批动作的显示文本
function getActionText(action) {
  const actionMap = {
    'partial': '部分通过',
    'all_approved': '全部通过',
    'rejected': '驳回',
    'approved': '通过',
    'submit': '提交'
  };
  return actionMap[action] || action || '未知';
}

// 获取明细审批状态的显示文本
function getDetailApprovalStatusText(status) {
  const statusMap = {
    'pending': '待审核',
    'finance_approved': '财务已通过',
    'manager_approved': '总经理已通过',
    'finance_rejected': '财务已驳回',
    'manager_rejected': '总经理已驳回',
    'approved': '已通过',
    'rejected': '已驳回'
  };
  return statusMap[status] || status || '未知状态';
}

// 获取明细审批状态的颜色（用于将来可能的颜色显示）
function getDetailApprovalStatusColor(status) {
  const colorMap = {
    'pending': '#FFA500',        // 橙色
    'finance_approved': '#32CD32', // 绿色
    'manager_approved': '#228B22', // 深绿色
    'finance_rejected': '#FF6347', // 红色
    'manager_rejected': '#DC143C', // 深红色
    'approved': '#32CD32',       // 绿色
    'rejected': '#FF6347'        // 红色
  };
  return colorMap[status] || '#000000'; // 默认黑色
}

// 金额转大写
function numToUpper(num) {
  const fraction = ['角', '分'];
  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const unit = [['元', '万', '亿'], ['', '拾', '佰', '仟']];
  let head = num < 0 ? '负' : '';
  num = Math.abs(num);
  let s = '';
  for (let i = 0; i < fraction.length; i++) {
    s += (digit[Math.floor(num * 10 * Math.pow(10, i)) % 10] + fraction[i]).replace(/零./, '');
  }
  s = s || '整';
  num = Math.floor(num);
  for (let i = 0; i < unit[0].length && num > 0; i++) {
    let p = '';
    for (let j = 0; j < unit[1].length && num > 0; j++) {
      p = digit[num % 10] + unit[1][j] + p;
      num = Math.floor(num / 10);
    }
    s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s;
  }
  return head + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零').replace(/^整$/, '零元整');
}

// 绘制表格边框
function drawTable(doc, x, y, width, height, rows, cols) {
  // 外边框
  doc.rect(x, y, width, height).stroke();

  // 水平线
  const rowHeight = height / rows;
  for (let i = 1; i < rows; i++) {
    doc.moveTo(x, y + i * rowHeight)
       .lineTo(x + width, y + i * rowHeight)
       .stroke();
  }

  // 垂直线
  const colWidth = width / cols;
  for (let i = 1; i < cols; i++) {
    doc.moveTo(x + i * colWidth, y)
       .lineTo(x + i * colWidth, y + height)
       .stroke();
  }
}

// 绘制不规则表格
function drawCustomTable(doc, x, y, width, height, structure) {
  // 外边框
  doc.rect(x, y, width, height).stroke();

  // 根据结构绘制内部线条
  structure.forEach(line => {
    if (line.type === 'horizontal') {
      doc.moveTo(x + line.startX, y + line.y)
         .lineTo(x + line.endX, y + line.y)
         .stroke();
    } else if (line.type === 'vertical') {
      doc.moveTo(x + line.x, y + line.startY)
         .lineTo(x + line.x, y + line.endY)
         .stroke();
    }
  });
}

async function generateReimbursementPDF({user, details, date, outputPath, formNumber, totalAmount, department = '', loanBalance = null, approvalHistory = [], formData = null}) {

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size: 'A4', margin: 30});
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // 尝试加载系统中文字体
    const chineseFontPath = getAvailableChineseFont();

    if (chineseFontPath) {
      try {
        doc.registerFont('ChineseFont', chineseFontPath);
        doc.font('ChineseFont');
        console.log(`成功加载中文字体: ${chineseFontPath}`);
      } catch (error) {
        console.warn(`字体加载失败 ${chineseFontPath}:`, error.message);
        doc.font('Helvetica');
        console.warn('使用默认字体 Helvetica');
      }
    } else {
      doc.font('Helvetica');
      console.warn('未找到可用的中文字体，使用默认字体');
    }

    // 设置默认字体大小和行高
    doc.fontSize(12);
    const pageWidth = 595.28 - 60; // A4宽度减去左右边距
    const startX = 30;
    let currentY = 50;

    // 标题 - 确保是中文
    doc.fontSize(20)
       .text('费用报销单', startX, currentY, {width: pageWidth, align: 'center'});
    currentY += 45;

    // 头部信息行 - 全部中文
    doc.fontSize(11);
    doc.text('申请人：', startX, currentY);
    doc.text(user.real_name || user.username || '', startX + 60, currentY);
    doc.text('日期：', startX + 250, currentY);
    doc.text(date, startX + 290, currentY);

    // 添加报销单状态显示
    if (formData && formData.status) {
      const statusMap = {
        'draft': '草稿',
        'submitted': '待财务审核',
        'finance_approved': '财务已通过',
        'finance_rejected': '财务已驳回',
        'manager_approved': '总经理已通过',
        'manager_rejected': '总经理已驳回',
        'paid': '已打款'
      };
      const statusText = statusMap[formData.status] || formData.status;
      doc.text('状态：', startX + 400, currentY);
      doc.text(statusText, startX + 430, currentY);
    }

    currentY += 25;

    // 主表格开始位置
    const tableStartY = currentY;
    const tableWidth = pageWidth;
    const tableHeight = 420;

    // 绘制主表格的复杂结构
    const tableStructure = [
      // 表头行分隔线
      {type: 'horizontal', startX: 0, endX: tableWidth, y: 25},

      // 明细行分隔线 (15行)
      ...Array.from({length: 14}, (_, i) => ({
        type: 'horizontal',
        startX: 0,
        endX: tableWidth,
        y: 25 + (i + 1) * 22
      })),

      // 合计行
      {type: 'horizontal', startX: 0, endX: tableWidth, y: 355},
      // 金额大写行
      {type: 'horizontal', startX: 0, endX: tableWidth, y: 375},
      // 报销总金额行
      {type: 'horizontal', startX: 0, endX: tableWidth, y: 395},
      // 借款抵扣行
      {type: 'horizontal', startX: 0, endX: tableWidth, y: 415},
      // 净付款金额行
      {type: 'horizontal', startX: 0, endX: tableWidth, y: 435},

      // 垂直分隔线 - 只需要3列：类型、金额、用途
      {type: 'vertical', x: tableWidth * 0.15, startY: 0, endY: 355}, // 类型列
      {type: 'vertical', x: tableWidth * 0.30, startY: 0, endY: 355}, // 金额列
      // 用途列占剩余空间，不需要右边线
    ];

    // 绘制表格 - 增加高度以容纳新增的行
    drawCustomTable(doc, startX, tableStartY, tableWidth, 460, tableStructure);

    // 填写表头 - 只有3列
    doc.fontSize(11);
    doc.text('类型', startX + 5, tableStartY + 8, {width: tableWidth * 0.15 - 10, align: 'center'});
    doc.text('金额', startX + tableWidth * 0.15 + 5, tableStartY + 8, {width: tableWidth * 0.15 - 10, align: 'center'});
    doc.text('用途', startX + tableWidth * 0.30 + 5, tableStartY + 8, {width: tableWidth * 0.70 - 10, align: 'center'});

    // 填写明细数据 - 使用实际的报销单明细
    doc.fontSize(10);
    let total = 0;
    const maxRows = 15;

    for (let i = 0; i < maxRows; i++) {
      const rowY = tableStartY + 25 + i * 22 + 5;
      const detail = details[i];

      if (detail) {
        // 类型 - 使用实际的费用类型
        doc.text(detail.type || '其他',
                startX + 5, rowY, {width: tableWidth * 0.15 - 10, align: 'center'});
        // 金额 - 使用实际金额
        const amountText = (detail.amount || 0).toFixed(2);
        doc.text(amountText,
                startX + tableWidth * 0.15 + 5, rowY, {width: tableWidth * 0.15 - 10, align: 'right'});
        // 用途 - 使用实际的用途说明
        const purposeText = detail.purpose || detail.remark || '';
        doc.text(purposeText,
                startX + tableWidth * 0.30 + 5, rowY, {width: tableWidth * 0.70 - 10, align: 'left'});

        total += Number(detail.amount) || 0;
      }
    }

    // 合计行
    doc.fontSize(11);
    const totalRowY = tableStartY + 355 + 6;
    doc.text('合计', startX + 8, totalRowY, {width: tableWidth * 0.15 - 16, align: 'center'});
    doc.text(total.toFixed(2), startX + tableWidth * 0.15 + 8, totalRowY, {width: tableWidth * 0.15 - 16, align: 'right'});
    doc.text(`共计 ${details.length} 项费用`, startX + tableWidth * 0.30 + 8, totalRowY, {width: tableWidth * 0.70 - 16, align: 'left'});

    // 金额大写行
    doc.fontSize(10);
    const upperRowY = tableStartY + 375 + 6;
    doc.text('金额大写：', startX + 8, upperRowY);
    doc.text(numToUpper(total), startX + 70, upperRowY, {width: tableWidth - 80});

    // 报销总金额行
    const totalAmountRowY = tableStartY + 395 + 6;
    doc.text('报销总金额：', startX + 8, totalAmountRowY);
    doc.text(`￥${total.toFixed(2)}`, startX + 90, totalAmountRowY);

    // 借款抵扣行 - 使用基本信息中的借款抵扣
    const loanRowY = tableStartY + 415 + 6;
    doc.text('借款抵扣：', startX + 8, loanRowY);

    // 从formData中获取借款抵扣信息，如果没有则使用loanBalance
    let loanAmount = 0;
    if (formData && formData.loan_offset_amount) {
        loanAmount = formData.loan_offset_amount;
        doc.text(`￥${loanAmount.toFixed(2)}`, startX + 90, loanRowY);
    } else if (loanBalance && loanBalance.total_loan_balance > 0) {
        loanAmount = loanBalance.total_loan_balance;
        doc.text(`￥${loanAmount.toFixed(2)}`, startX + 90, loanRowY);
    } else {
        doc.text('￥0.00', startX + 90, loanRowY);
    }

    // 净付款金额行 - 使用基本信息中的净付款金额
    const balanceRowY = tableStartY + 435 + 6;
    doc.text('净付款金额：', startX + 8, balanceRowY);

    if (formData && typeof formData.net_payment_amount !== 'undefined') {
        // 使用基本信息中的净付款金额
        doc.text(`￥${formData.net_payment_amount.toFixed(2)}`, startX + 90, balanceRowY);
    } else {
        // 兼容旧逻辑 - 计算净付款金额
        const netPayment = Math.max(0, total - loanAmount);
        doc.text(`￥${netPayment.toFixed(2)}`, startX + 90, balanceRowY);
    }

    // 审批历史区域
    const approvalY = tableStartY + 480;
    doc.fontSize(11);
    doc.text('审批历史', startX, approvalY);

    let currentRowY = approvalY + 20;
    doc.fontSize(10);

    // 申请人信息
    doc.text('申请人签名：', startX + 15, currentRowY);
    doc.text(`${user.real_name || user.username || ''}`, startX + 80, currentRowY);
    doc.text('日期：', startX + 200, currentRowY);
    doc.text(date, startX + 230, currentRowY);
    currentRowY += 25;

    // 绘制审批历史表格
    if (approvalHistory && approvalHistory.length > 0) {
        // 表格头部
        const tableHeaders = ['时间', '审批人', '角色', '来源表单', '操作', '通过/驳回', '意见'];
        const colWidths = [80, 60, 50, 80, 60, 50, 120]; // 列宽
        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
        const tableX = startX + 15;

        // 绘制表格边框和表头 - 去除底色，只保留边框
        const headerHeight = 20;
        doc.rect(tableX, currentRowY, tableWidth, headerHeight).stroke();

        // 绘制表头文字
        doc.fillColor('#000').fontSize(9);
        let colX = tableX;
        tableHeaders.forEach((header, index) => {
            doc.text(header, colX + 2, currentRowY + 5, {
                width: colWidths[index] - 4,
                align: 'center'
            });
            colX += colWidths[index];
        });

        // 绘制表头列分隔线
        colX = tableX;
        for (let i = 0; i < colWidths.length - 1; i++) {
            colX += colWidths[i];
            doc.moveTo(colX, currentRowY).lineTo(colX, currentRowY + headerHeight).stroke();
        }

        currentRowY += headerHeight;

        // 绘制数据行
        const rowHeight = 18;
        approvalHistory.forEach((h) => {
            // 数据映射
            const actionMap = {
                approve_all: '全部通过',
                reject_all: '全部驳回',
                partial_approve: '部分通过'
            };
            const roleMap = {
                finance: '财务',
                manager: '总经理',
                admin: '管理员',
                employee: '员工'
            };

            const approveCount = (h.approved_record_ids || []).length;
            const rejectCount = (h.rejected_record_ids || []).length;
            const sourceLabel = h.source_form_number ?
                `${h.source_form_number}${h.source_level === 0 ? '(当前)' : ''}` :
                (h.form_number || '');

            const rowData = [
                h.created_at ? new Date(h.created_at).toLocaleDateString('zh-CN') + ' ' +
                               new Date(h.created_at).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}) : '-',
                h.approver_name || '-',
                roleMap[h.approver_role] || h.approver_role || '-',
                sourceLabel,
                actionMap[h.action] || h.action || '-',
                `${approveCount}/${rejectCount}`,
                (h.comment || '-').length > 15 ? (h.comment || '-').substring(0, 15) + '...' : (h.comment || '-')
            ];

            // 绘制行边框 - 去除底色，只保留边框
            doc.rect(tableX, currentRowY, tableWidth, rowHeight).stroke();

            // 绘制行数据
            doc.fillColor('#000').fontSize(8);
            colX = tableX;
            rowData.forEach((data, colIndex) => {
                doc.text(data, colX + 2, currentRowY + 4, {
                    width: colWidths[colIndex] - 4,
                    height: rowHeight - 8,
                    align: colIndex === 0 ? 'left' : 'center',
                    ellipsis: true
                });
                colX += colWidths[colIndex];
            });

            // 绘制列分隔线
            colX = tableX;
            for (let i = 0; i < colWidths.length - 1; i++) {
                colX += colWidths[i];
                doc.moveTo(colX, currentRowY).lineTo(colX, currentRowY + rowHeight).stroke();
            }

            currentRowY += rowHeight;
        });

        currentRowY += 10; // 表格后间距
    } else {
        doc.text('暂无审批记录', startX + 15, currentRowY);
        currentRowY += 20;
    }

    // 底部信息 - 使用动态位置
    const bottomY = currentRowY + 20;
    doc.fontSize(8);
    doc.text(`报销单编号：${formNumber}`, startX, bottomY);
    doc.text(`生成时间：${new Date().toLocaleString('zh-CN')}`, startX + 300, bottomY);

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

/**
 * 生成报销单PDF并返回Buffer（用于单个下载）
 * @param {Object} formData - 报销单数据
 * @param {Array} records - 报销明细记录
 * @param {Array} vouchers - 凭证文件
 * @param {Array} approvalHistory - 审批历史
 * @returns {Buffer} PDF文件缓冲区
 */
function generateReimbursementPDFBuffer(formData, records = [], vouchers = [], approvalHistory = []) {
  return new Promise(async (resolve, reject) => {
    try {
      // 创建临时文件
      const tempPath = path.join(__dirname, '../uploads', `temp_pdf_${Date.now()}.pdf`);

      // 使用原始PDF生成函数 - 传递完整的参数
      await generateReimbursementPDF({
        user: { username: formData.username, real_name: formData.real_name },
        details: records,
        date: formData.created_at ? new Date(formData.created_at).toLocaleDateString('zh-CN') : new Date().toLocaleDateString('zh-CN'),
        outputPath: tempPath,
        formNumber: formData.form_number,
        totalAmount: formData.total_amount,
        department: '',
        loanBalance: null,
        approvalHistory: approvalHistory,
        formData: formData
      });

      // 读取文件为Buffer
      const pdfBuffer = fs.readFileSync(tempPath);

      // 删除临时文件
      setTimeout(() => {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }, 1000);

      resolve(pdfBuffer);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateReimbursementPDF,
  generateReimbursementPDFBuffer
};

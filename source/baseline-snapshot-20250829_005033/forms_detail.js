const express = require('express');
const { verifyToken } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { requirePermission } = require('../middlewares/requirePermission');
const { z } = require('zod');
const { createFormAutoGenerate, getFormDetail, updateForm, submitForm, withdrawForm, deleteForm, linkLoans, confirmPayment, createFormFromRejected } = require('../services/formService');
const { getApprovalHistory } = require('../services/approvalService');
const { normalizeFormStatus, formStatusToZh } = require('../utils/status_maps');
const { STATUS_GROUPS } = require('../constants/status');
const Database = require('better-sqlite3');
const path = require('path');

const router = express.Router();

// 发票号查重API
router.get('/check-duplicate', verifyToken, (req, res) => {
  try {
    const { invoice_number, exclude_form_id } = req.query;

    if (!invoice_number || !invoice_number.trim()) {
      return res.json({ isDuplicate: false });
    }

    const trimmedNumber = invoice_number.trim();
    const excludeFormId = exclude_form_id ? parseInt(exclude_form_id) : null;

    // 使用更完善的发票号查重逻辑
    const { checkInvoiceNumberAvailability } = require('../services/invoiceValidationService');
    const result = checkInvoiceNumberAvailability(trimmedNumber, excludeFormId);

    if (result.isAvailable) {
      return res.json({ isDuplicate: false });
    }

    // 发票号不可用，返回冲突信息
    const conflictInfo = result.conflictInfo;
    const isSameUser = conflictInfo.userId === req.user.userId;

    res.json({
      isDuplicate: true,
      existingRecordId: conflictInfo.recordId,
      formId: conflictInfo.formId,
      formNumber: conflictInfo.formNumber,
      formStatus: conflictInfo.formStatus,
      isSameUser: isSameUser,
      message: isSameUser ?
        `您已在报销单 ${conflictInfo.formNumber} 中使用过此发票号` :
        `此发票号已被其他用户在报销单 ${conflictInfo.formNumber} 中使用`
    });

  } catch (error) {
    console.error('发票号查重错误:', error);
    res.status(500).json({
      success: false,
      message: '查重服务异常',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

const autoGenerateSchema = z.object({
  items: z.array(z.object({
    amount: z.number().positive('金额必须>0'),
    purpose: z.string().min(1),
    type: z.string().min(1),
    remark: z.string().optional(),
    invoice_number: z.string().optional(), // 发票号
    attachments: z.array(z.object({ temp_id: z.number().int(), name: z.string().optional() })).optional()
  })).min(1),
  status: z.string().optional()
});

router.post('/reimbursement-forms/auto-generate', verifyToken, validate(autoGenerateSchema), (req, res) => {
  try {
    console.log('=== 自动生成报销单请求 ===');
    console.log('用户:', req.user);
    console.log('请求数据:', JSON.stringify(req.body, null, 2));

    const { formId, formNumber, totalAmount, reimbursementIds } = createFormAutoGenerate(req.user, req.body.items, req.body.status);
    res.json({ formId, formNumber, totalAmount, reimbursementIds });
  } catch (e) {
    console.error('=== 自动生成报销单失败 ===');
    console.error('错误信息:', e.message);
    console.error('错误代码:', e.code);

    // 如果是业务错误（如发票号重复），返回400而不是500
    if (e.code === 'INVOICE_DUPLICATE' || e.statusCode === 400) {
      res.status(400).json({
        success: false,
        message: e.message,
        code: e.code,
        requestId: req.requestId
      });
    } else {
      // 其他错误仍然返回500
      console.error('错误堆栈:', e.stack);
      res.status(500).json({
        success: false,
        message: '自动生成失败',
        detail: e.message,
        requestId: req.requestId
      });
    }
  }
});

router.get('/reimbursement-forms/:id', verifyToken, (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const data = getFormDetail(formId, req.user);
    if(!data) return res.status(404).json({ success:false, message:'报销单不存在' });
    const { form, records, loanLinks } = data;
    const history = getApprovalHistory(formId,false); // 当前表单审批记录
    res.json({
      ...form,
      version: form.version || 0,
      status_en: normalizeFormStatus(form.status),
      status_zh: formStatusToZh(form.status),
      records,
      loan_links: loanLinks,
      approval_history: history
    });
  } catch (e) {
    if(e.message==='FORBIDDEN') return res.status(403).json({ success:false, message:'无权限' });
    res.status(500).json({ success:false, message:'获取详情失败' });
  }
});

const updateSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().optional(),
    amount: z.number().positive(),
    purpose: z.string().min(1),
    type: z.string().min(1),
    remark: z.string().optional(),
    invoice_number: z.string().optional(), // 发票号
    attachments: z.array(z.object({ temp_id: z.number().int(), name: z.string().optional() })).optional()
  })).min(1),
  status: z.string().optional()
});

router.put('/reimbursement-forms/:id', verifyToken, validate(updateSchema), (req, res) => {
  try {
    console.log(`[PUT /reimbursement-forms/${req.params.id}] 开始处理更新请求`);
    console.log('用户:', req.user);
    console.log('请求体:', JSON.stringify(req.body, null, 2));

    const out = updateForm(parseInt(req.params.id), req.user, req.body.items, req.body.status);
    console.log(`[PUT /reimbursement-forms/${req.params.id}] 更新成功:`, out);
    res.json(out);
  } catch (e) {
    console.error(`[PUT /reimbursement-forms/${req.params.id}] 更新失败:`, e);
    console.error('错误堆栈:', e.stack);

    if(['NOT_FOUND'].includes(e.message)) return res.status(404).json({ success:false, message:'报销单不存在' });
    if(['FORBIDDEN'].includes(e.message)) return res.status(403).json({ success:false, message:'无权限' });
    if(['INVALID_STATE','INVALID_ITEM'].includes(e.message)) return res.status(400).json({ success:false, message:'状态或数据不允许操作: ' + e.message });

    // 对于其他错误，返回更详细的错误信息
    res.status(500).json({ success:false, message:'更新失败: ' + e.message });
  }
});

router.post('/reimbursement-forms/:id/submit', verifyToken, (req, res) => {
  try {
    const out = submitForm(parseInt(req.params.id), req.user);
    res.json(out);
  } catch (e) {
    if(e.message==='NOT_FOUND') return res.status(404).json({ success:false, message:'报销单不存在' });
    if(e.message==='FORBIDDEN') return res.status(403).json({ success:false, message:'无权限' });
    if(e.message==='INVALID_STATE') return res.status(400).json({ success:false, message:'状态不允许提交' });
    res.status(500).json({ success:false, message:'提交失败' });
  }
});

router.post('/reimbursement-forms/:id/withdraw', verifyToken, (req, res) => {
  try {
    const out = withdrawForm(parseInt(req.params.id), req.user);
    res.json(out);
  } catch (e) {
    if(e.message==='NOT_FOUND') return res.status(404).json({ success:false, message:'报销单不存在' });
    if(e.message==='FORBIDDEN') return res.status(403).json({ success:false, message:'无权限' });
    if(e.message==='INVALID_STATE') return res.status(400).json({ success:false, message:'仅待财务审核可撤回' });
    res.status(500).json({ success:false, message:'撤回失败' });
  }
});

router.delete('/reimbursement-forms/:id', verifyToken, (req,res)=>{
  try {
    const out = deleteForm(parseInt(req.params.id), req.user);
    res.json(out);
  } catch (e) {
    if(e.message==='NOT_FOUND') return res.status(404).json({ success:false, message:'报销单不存在' });
    if(e.message==='FORBIDDEN') return res.status(403).json({ success:false, message:'无权限删除此报销单' });
    if(e.message==='INVALID_STATE') return res.status(400).json({
      success: false,
      message: '无法删除此报销单：只能删除草稿状态或已驳回的报销单。已提交审批、已审批通过或已打款的报销单不能删除。'
    });
    res.status(500).json({ success:false, message:'删除失败' });
  }
});

// 管理员专用删除路由
router.delete('/admin/reimbursement-forms/:id', verifyToken, (req, res) => {
  try {
    console.log(`[DELETE /admin/reimbursement-forms/${req.params.id}] 管理员删除请求`);
    console.log('用户:', req.user);

    // 权限检查：只有admin可以使用此路由
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '只有管理员可以删除报销单' });
    }

    const result = deleteForm(parseInt(req.params.id), req.user);
    console.log(`[DELETE /admin/reimbursement-forms/${req.params.id}] 删除成功:`, result);
    res.json(result);
  } catch (e) {
    console.error(`[DELETE /admin/reimbursement-forms/${req.params.id}] 删除失败:`, e);

    if(e.message==='NOT_FOUND') return res.status(404).json({ success:false, message:'报销单不存在' });
    if(e.message==='FORBIDDEN') return res.status(403).json({ success:false, message:'无权限删除此报销单' });
    if(e.message==='INVALID_STATE') return res.status(400).json({
      success: false,
      message: '无法删除此报销单：只能删除草稿状态或已驳回的报销单。已审批通过或已打款的报销单不能删除，以确保财务记录的完整性。'
    });
    res.status(500).json({ success:false, message:'删除失败: ' + e.message });
  }
});

const linkLoansSchema = z.object({
  loan_links: z.array(z.object({ loan_id: z.number().int(), offset_amount: z.number().positive() })).min(1)
});

router.post('/reimbursement-forms/:id/link-loans', verifyToken, validate(linkLoansSchema), (req,res)=>{
  try {
    const out = linkLoans(parseInt(req.params.id), req.body.loan_links, req.user);
    res.json({ success:true, ...out });
  } catch (e) {
    if(e.message==='NOT_FOUND') return res.status(404).json({ success:false, message:'报销单不存在' });
    if(['FORBIDDEN'].includes(e.message)) return res.status(403).json({ success:false, message:'无权限' });
    if(['INVALID_STATE','LOAN_NOT_FOUND','USER_MISMATCH','LOAN_INVALID_STATUS','LOAN_INSUFFICIENT'].includes(e.message)) return res.status(400).json({ success:false, message:'借款关联失败:'+e.message });
    res.status(500).json({ success:false, message:'借款关联异常' });
  }
});

const confirmPaymentSchema = z.object({
  payment_note: z.string().max(200).optional(),
  loan_links: z.array(z.object({ loan_id: z.number().int(), offset_amount: z.number().positive() })).optional()
});

router.post('/reimbursement-forms/:id/confirm-payment', verifyToken, validate(confirmPaymentSchema), (req,res)=>{
  try {
    const out = confirmPayment(parseInt(req.params.id), req.body, req.user);
    res.json(out);
  } catch (e) {
  try { console.error('[confirm-payment] failed:', e && e.message ? e.message : e, '\nstack:', e && e.stack); } catch(_){}
    if(e.message==='FORBIDDEN') return res.status(403).json({ success:false, message:'无权限' });
    if(e.message==='NOT_FOUND') return res.status(404).json({ success:false, message:'报销单不存在' });
    if(['INVALID_STATE','LOAN_NOT_FOUND','USER_MISMATCH','LOAN_INVALID_STATUS','LOAN_INSUFFICIENT'].includes(e.message)) return res.status(400).json({ success:false, message:'条件不满足: '+e.message });
  res.status(500).json({ success:false, message:'打款失败', detail: e.message });
  }
});

// PDF 下载路由
router.get('/reimbursement-forms/:id/pdf', verifyToken, async (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const db = require('../db');
    const path = require('path');
    const fs = require('fs');
    const { generateReimbursementPDFBuffer } = require('../generate_reimbursement_pdf');
    
    // 获取报销单基本信息
    const form = db.prepare(`
      SELECT rf.*, u.username, u.real_name
      FROM reimbursement_forms rf
      LEFT JOIN users u ON rf.user_id = u.id
      WHERE rf.id = ?
    `).get(formId);
    
    if (!form) {
      return res.status(404).json({ msg: '报销单不存在' });
    }
    
    // 权限检查：本人或有权限的角色可以下载
    const userId = req.user.id || req.user.userId;
    if (form.user_id !== userId && !['finance', 'manager', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ msg: '无权限下载此PDF' });
    }
    
    // 获取报销单明细
    const details = db.prepare(`
      SELECT r.id, r.type, r.amount, r.purpose, r.remark, r.created_at
      FROM reimbursements r
      WHERE r.form_id = ?
      ORDER BY r.created_at ASC
    `).all(formId);
    
    if (details.length === 0) {
      return res.status(404).json({ msg: '报销单无明细记录' });
    }
    
    // 计算本单打款摘要：与详情页保持一致（借款抵扣/净付款金额）
    const loanOffset = Number(form.loan_offset_amount || 0);
    const netPayment = Number(
      form.net_payment_amount != null
        ? form.net_payment_amount
        : Math.max(0, Number(form.total_amount || 0) - loanOffset)
    );
    const paymentSummary = { loanOffset, netPayment, paymentNote: form.payment_note || '' };

    // 获取审批历史（包含父表单，解决“部分通过后拆分导致财务审批记录缺失”的问题）
    const approvalHistoryRaw = getApprovalHistory(formId, true);
    const approvalHistory = approvalHistoryRaw && approvalHistoryRaw.merged ? (approvalHistoryRaw.logs || []) : (approvalHistoryRaw || []);
    
    // 生成PDF数据 - 包含基本信息中的借款抵扣和净付款金额
    const formData = {
      form_number: form.form_number,
      real_name: form.real_name,
      username: form.username,
      created_at: form.created_at,
      total_amount: form.total_amount,
      status: form.status,
      approved_at: form.approved_at,
      reject_reason: form.reject_reason,
      loan_offset_amount: loanOffset, // 借款抵扣金额
      net_payment_amount: netPayment  // 净付款金额
    };

    // 获取凭证信息
    const vouchers = details.map(detail => ({
      original_name: detail.voucher_file_name || 'Unknown',
      file_name: detail.voucher_file_name
    }));

    // 生成PDF Buffer - 传递审批历史和基本信息
    const pdfData = await generateReimbursementPDFBuffer(formData, details, vouchers, approvalHistory);
    
    // 返回PDF文件
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reimbursement_form_${form.form_number}.pdf"`);
    res.send(pdfData);
    
  } catch (error) {
    console.error('PDF生成失败:', error);
    res.status(500).json({ msg: 'PDF生成失败', error: error.message });
  }
});

// 批量下载ZIP路由
const batchDownloadSchema = z.object({
  formIds: z.array(z.number().int()).min(1).max(100)
});

router.post('/admin/batch-download', verifyToken, validate(batchDownloadSchema), async (req, res) => {
  try {
    // 权限检查：只有admin、finance、manager可以批量下载
    if (!['admin', 'finance', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ msg: '无权限进行批量下载' });
    }
    
    const { formIds } = req.body;
    const db = require('../db');
    const path = require('path');
    const fs = require('fs');
    const archiver = require('archiver');
    const { generateReimbursementPDF } = require('../generate_reimbursement_pdf');
    
    // 去重并过滤
    const uniqueFormIds = [...new Set(formIds.filter(id => Number.isInteger(id) && id > 0))];
    
    if (uniqueFormIds.length === 0) {
      return res.status(400).json({ msg: '无有效的报销单ID' });
    }
    
    // 查询有效的报销单（只导出允许状态的报销单）
    const placeholders = uniqueFormIds.map(() => '?').join(',');
    const forms = db.prepare(`
      SELECT rf.*, u.username, u.real_name
      FROM reimbursement_forms rf
      LEFT JOIN users u ON rf.user_id = u.id
      WHERE rf.id IN (${placeholders})
        AND rf.status IN (${STATUS_GROUPS.ALL_FORM_STATUSES.map(() => '?').join(', ')})
      ORDER BY rf.created_at DESC
    `).all(...uniqueFormIds, ...STATUS_GROUPS.ALL_FORM_STATUSES);
    
    if (forms.length === 0) {
      return res.status(404).json({ msg: '未找到可导出的报销单' });
    }
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="reimbursements_${Date.now()}.zip"`);
    
    // 创建ZIP流
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    // 创建索引信息
    const indexInfo = {
      exported_at: new Date().toISOString(),
      exported_by: req.user.real_name || req.user.username,
      total_forms: forms.length,
      forms: []
    };
    
    // 为每个报销单生成PDF和添加附件
    for (const form of forms) {
      try {
        // 获取报销单明细
        const details = db.prepare(`
          SELECT r.id, r.type, r.amount, r.purpose, r.remark, r.created_at
          FROM reimbursements r
          WHERE r.form_id = ?
          ORDER BY r.created_at ASC
        `).all(form.id);
        
        // 获取借款余额信息
        const loanBalance = db.prepare(`
          SELECT 
            COALESCE(SUM(l.remaining_amount), 0) as total_loan_balance,
            COUNT(CASE WHEN l.remaining_amount > 0 THEN l.id END) as active_loans_count
          FROM loans l
          WHERE l.user_id = ? AND l.status IN (${STATUS_GROUPS.AVAILABLE_LOANS.map(() => '?').join(', ')}) AND l.remaining_amount > 0
        `).get(form.user_id, ...STATUS_GROUPS.AVAILABLE_LOANS);
        
        // 获取审批历史
        const approvalHistory = getApprovalHistory(form.id);

        // 计算借款抵扣和净付款金额
        const loanOffset = 0; // 这里需要根据实际业务逻辑计算
        const netPayment = form.total_amount - loanOffset;

        // 生成PDF
        if (details.length > 0) {
          const userData = { username: form.username, real_name: form.real_name };
          const pdfPath = path.join(__dirname, '../uploads', `temp_form_${form.id}_${Date.now()}.pdf`);

          // 构建完整的formData
          const formData = {
            form_number: form.form_number,
            real_name: form.real_name,
            username: form.username,
            created_at: form.created_at,
            total_amount: form.total_amount,
            status: form.status,
            loan_offset_amount: loanOffset,
            net_payment_amount: netPayment
          };

          await generateReimbursementPDF({
            user: userData,
            details: details,
            date: new Date(form.created_at).toLocaleDateString('zh-CN'),
            outputPath: pdfPath,
            formNumber: form.form_number,
            totalAmount: form.total_amount,
            department: '',
            loanBalance: loanBalance,
            approvalHistory: approvalHistory,
            formData: formData
          });
          
          // 添加PDF到ZIP
          const folderName = `${form.form_number}_${form.id}`;
          archive.file(pdfPath, { name: `${folderName}/reimbursement_form_${form.form_number}.pdf` });
          
          // 添加凭证文件
          const attachments = db.prepare(`
            SELECT a.file_path
            FROM attachments a
            JOIN reimbursements r ON a.reimbursement_id = r.id
            WHERE r.form_id = ?
          `).all(form.id);
          
          for (const att of attachments) {
            const attPath = path.join(__dirname, '../uploads', att.file_path);
            if (fs.existsSync(attPath)) {
              const fileName = path.basename(att.file_path);
              archive.file(attPath, { name: `${folderName}/vouchers/${fileName}` });
            }
          }
          
          // 清理临时PDF文件
          setTimeout(() => {
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
            }
          }, 5000);
        }
        
        // 添加到索引
        indexInfo.forms.push({
          id: form.id,
          form_number: form.form_number,
          user_name: form.real_name,
          total_amount: form.total_amount,
          status: form.status,
          created_at: form.created_at
        });
        
      } catch (formError) {
        console.error(`处理报销单 ${form.id} 失败:`, formError);
        // 继续处理其他报销单
      }
    }
    
    // 添加索引文件
    archive.append(JSON.stringify(indexInfo, null, 2), { name: 'index.json' });
    
    // 完成ZIP
    archive.finalize();
    
  } catch (error) {
    console.error('批量下载失败:', error);
    res.status(500).json({ msg: '批量下载失败', error: error.message });
  }
});

// 全量备份 ZIP（数据库 + 上传目录 + 关键表 JSON 导出）
router.get('/admin/backup/full', verifyToken, requirePermission('system.backup'), async (req, res) => {
  try {
    const db = require('../db');
    const fs = require('fs');
    const path = require('path');
    const archiver = require('archiver');

    // 临时备份文件路径
    const backupFile = path.join(__dirname, '../uploads', `backup_full_${Date.now()}.zip`);

    // 确保目录存在
    const dir = path.dirname(backupFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const output = fs.createWriteStream(backupFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="backup_${new Date().toISOString().replace(/[:T]/g,'-').replace(/\..+/, '')}.zip"`);
      const stream = fs.createReadStream(backupFile);
      stream.on('close', () => { try { fs.unlinkSync(backupFile); } catch(_){} });
      stream.pipe(res);
    });
    archive.on('error', (err) => { throw err; });

    archive.pipe(output);

    // 1) 数据库文件（使用实际运行中的数据库路径）
    const dbPath = (db && db.name) ? db.name : (process.env.SQLITE_PATH || path.join(__dirname, '..', 'db.sqlite'));
    if (fs.existsSync(dbPath)) {
      const baseName = path.basename(dbPath) || 'db.sqlite';
      archive.file(dbPath, { name: baseName });
    }

    // 2) 上传目录（包括 vouchers 等）
    const uploadsDir = path.join(__dirname, '../uploads');
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }

    // 3) 关键表 JSON 导出
    const tables = ['users','loans','reimbursements','reimbursement_forms','attachments','vouchers','logs'];
    const jsonDir = path.join(__dirname, '../uploads', `backup_json_${Date.now()}`);
    if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir, { recursive: true });
    try {
      for (const t of tables) {
        try {
          const rows = db.prepare(`SELECT * FROM ${t}`).all();
          fs.writeFileSync(path.join(jsonDir, `${t}.json`), JSON.stringify(rows, null, 2));
        } catch (_) {
          // ignore missing tables
        }
      }
      archive.directory(jsonDir, 'json');
    } finally {
      // 清理临时 json 目录
      try {
        for (const f of fs.readdirSync(jsonDir)) fs.unlinkSync(path.join(jsonDir, f));
        fs.rmdirSync(jsonDir);
      } catch(_){}
    }

    await archive.finalize();
  } catch (e) {
    res.status(500).json({ success:false, msg: '备份失败', detail: e.message });
  }
});

// 管理员清空所有数据接口
router.delete('/admin/purge-all', verifyToken, async (req, res) => {
  try {
    // 权限检查：只有admin可以执行清空操作
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: '只有管理员可以执行清空操作' });
    }
    const db = require('../db');
    // 兼容旧环境：安全删除辅助（表不存在时跳过，不抛错）
    const safeDelete = (table) => {
      try {
        const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!exists) return { changes: 0, skipped: true };
        return db.prepare(`DELETE FROM ${table}`).run();
      } catch (e) {
        if (String(e && e.message || '').includes('no such table')) {
          return { changes: 0, skipped: true };
        }
        throw e;
      }
    };
    // 暂时禁用外键约束
    db.pragma('foreign_keys = OFF');
    let totalDeleted = 0;
    const bump = (r) => { totalDeleted += (r && r.changes) ? r.changes : 0; };
    [
      'reimbursement_loan_links',
      'attachments',
      'temp_attachments',
      'reimbursement_record_vouchers',
      'vouchers',
      'reimbursements',
      'reimbursement_form_items',
      'reimbursement_form_loans',
      'reimbursement_form_splits',
      'reimbursement_form_relations',  // 新增：报销单关联记录
      'voucher_reuse_records',         // 新增：凭证复用记录
      'reimbursement_forms',
      'loans',
      'reimbursement_approval_logs',
      'loan_approval_logs',
      'reimbursement_form_approval_logs',
      'loan_payment_logs',
      'reimbursement_loan_offsets',
      'loan_offsets',
      'reimbursement_batch_items',
      'reimbursement_batches'
    ].forEach(t => bump(safeDelete(t)));

    // 额外清理：确保发票号相关数据完全清除
    try {
      const invoiceCleanResult = db.prepare('UPDATE reimbursements SET invoice_number = NULL WHERE invoice_number IS NOT NULL').run();
      console.log(`清理了 ${invoiceCleanResult.changes} 个发票号记录`);
    } catch (e) {
      console.warn('清理发票号失败（可能表已删除）:', e.message);
    }
    // 重新启用外键约束
    db.pragma('foreign_keys = ON');
    console.log(`管理员 ${req.user.username} 执行了数据清空操作，共删除 ${totalDeleted} 条记录`);
    res.status(200).json({ 
      msg: '数据清空成功', 
      deletedRecords: totalDeleted,
      details: '所有报销和借款数据已清空'
    });
  } catch (error) {
    console.error('数据清空失败:', error);
    res.status(500).json({ msg: '数据清空失败', error: error.message });
  }
});

// 恢复（上传 ZIP 覆盖 db.sqlite 与 uploads）
router.post('/admin/backup/restore', verifyToken, requirePermission('system.restore'), async (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const multer = require('multer');
    const AdmZip = require('adm-zip');

    // 临时接收上传文件
    const upload = multer({ dest: path.join(__dirname, '../uploads/tmp_restore') }).single('file');
    upload(req, res, (err) => {
      if (err) return res.status(400).json({ success:false, msg:'上传失败' });
      if (!req.file) return res.status(400).json({ success:false, msg:'缺少文件' });
      try {
        const zip = new AdmZip(req.file.path);
        const entries = zip.getEntries();

        // 1) 还原数据库文件（写回当前实际使用的 DB 路径）
        const db = require('../db');
        const dbDest = (db && db.name) ? db.name : (process.env.SQLITE_PATH || path.join(__dirname, '..', 'db.sqlite'));
  const dbEntry = entries.find(e => e.entryName.endsWith('db.sqlite')) || entries.find(e => /\bdb\.(sqlite|db)\b/i.test(e.entryName));
        if (dbEntry) {
          const buf = dbEntry.getData();
          // 确保目标目录存在
          const dir = path.dirname(dbDest);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(dbDest, buf);
        }

        // 2) 还原 uploads 目录
        const uploadsDest = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadsDest)) fs.mkdirSync(uploadsDest, { recursive: true });
        for (const e of entries) {
          if (e.entryName.startsWith('uploads/')) {
            const destPath = path.join(uploadsDest, e.entryName.replace(/^uploads\//, ''));
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            if (!e.isDirectory) fs.writeFileSync(destPath, e.getData());
          }
        }

        res.json({ success:true, msg:'恢复成功' });
      } catch (e) {
        res.status(500).json({ success:false, msg:'恢复失败', detail:e.message });
      } finally {
        try { fs.unlinkSync(req.file.path); } catch(_){}
      }
    });
  } catch (e) {
    res.status(500).json({ success:false, msg:'恢复失败', detail:e.message });
  }
});

// 普通用户获取可用的报销类型列表（只返回启用的）
router.get('/expense-types', verifyToken, async (req, res) => {
  try {
    const db = require('../db');
    const expenseTypes = db.prepare('SELECT * FROM expense_types WHERE active = 1 ORDER BY created_at DESC').all();
    res.status(200).json(expenseTypes);
  } catch (error) {
    // 缺表自愈：尝试创建后重试一次
    try {
      if (String(error && error.message || '').includes('no such table: expense_types')) {
        try { require('../migrations/ensure_expense_types').ensureExpenseTypes(); } catch(_) {}
        try {
          const db = require('../db');
          const expenseTypes = db.prepare('SELECT * FROM expense_types WHERE active = 1 ORDER BY created_at DESC').all();
          return res.status(200).json(expenseTypes);
        } catch (e2) {
          console.error('获取报销类型失败(重试后):', e2);
          return res.status(500).json({ msg: '获取报销类型失败', error: e2.message });
        }
      }
    } catch (_) {}
    console.error('获取报销类型失败:', error);
    res.status(500).json({ msg: '获取报销类型失败', error: error.message });
  }
});

// 管理员获取报销类型列表
router.get('/admin/expense-types', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: '只有管理员可以管理报销类型' });
    }
    const db = require('../db');
    const expenseTypes = db.prepare('SELECT * FROM expense_types ORDER BY created_at DESC').all();
    res.status(200).json({ success: true, data: expenseTypes });
  } catch (error) {
    // 缺表自愈：尝试创建后重试一次
    try {
      if (String(error && error.message || '').includes('no such table: expense_types')) {
        try { require('../migrations/ensure_expense_types').ensureExpenseTypes(); } catch(_) {}
        try {
          const db = require('../db');
          const expenseTypes = db.prepare('SELECT * FROM expense_types ORDER BY created_at DESC').all();
          return res.status(200).json({ success: true, data: expenseTypes });
        } catch (e2) {
          console.error('获取报销类型失败(重试后):', e2);
          return res.status(500).json({ msg: '获取报销类型失败', error: e2.message });
        }
      }
    } catch (_) {}
    console.error('获取报销类型失败:', error);
    res.status(500).json({ msg: '获取报销类型失败', error: error.message });
  }
});

// 管理员创建报销类型
router.post('/admin/expense-types', verifyToken, async (req, res) => {
  try {
    // 权限检查：只有admin可以管理报销类型
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: '只有管理员可以管理报销类型' });
    }
    
    const { name, active } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ msg: '报销类型名称不能为空' });
    }
    
    const db = require('../db');
    
    // 检查是否已存在同名类型
    const existing = db.prepare('SELECT id FROM expense_types WHERE name = ?').get(name.trim());
    if (existing) {
      return res.status(400).json({ msg: '该报销类型已存在' });
    }
    
    // 处理active字段，默认为true
    const isActive = active !== undefined ? (active === true || active === 1 || active === '1') : true;
    
    const result = db.prepare('INSERT INTO expense_types (name, active) VALUES (?, ?)').run(name.trim(), isActive ? 1 : 0);
    
    const newExpenseType = db.prepare('SELECT * FROM expense_types WHERE id = ?').get(result.lastInsertRowid);
    
    res.status(201).json({
      success: true,
      data: newExpenseType,
      msg: '报销类型创建成功'
    });
    
  } catch (error) {
    console.error('创建报销类型失败:', error);
    res.status(500).json({ msg: '创建报销类型失败', error: error.message });
  }
});

// 管理员更新报销类型
router.put('/admin/expense-types/:id', verifyToken, async (req, res) => {
  try {
    // 权限检查：只有admin可以管理报销类型
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: '只有管理员可以管理报销类型' });
    }
    
    const { id } = req.params;
    const { name, active } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ msg: '报销类型名称不能为空' });
    }
    
    const db = require('../db');
    
    // 检查类型是否存在
    const existing = db.prepare('SELECT * FROM expense_types WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ msg: '报销类型不存在' });
    }
    
    // 检查是否已存在同名类型（排除当前记录）
    const duplicate = db.prepare('SELECT id FROM expense_types WHERE name = ? AND id != ?').get(name.trim(), id);
    if (duplicate) {
      return res.status(400).json({ msg: '该报销类型名称已存在' });
    }
    
    const updateData = { name: name.trim() };
    if (typeof active === 'number') {
      updateData.active = active;
    }
    
    const fields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updateData);
    values.push(id);
    
    db.prepare(`UPDATE expense_types SET ${fields} WHERE id = ?`).run(...values);
    
    const updatedExpenseType = db.prepare('SELECT * FROM expense_types WHERE id = ?').get(id);
    
    res.status(200).json({
      success: true,
      data: updatedExpenseType,
      msg: '报销类型更新成功'
    });
    
  } catch (error) {
    console.error('更新报销类型失败:', error);
    res.status(500).json({ msg: '更新报销类型失败', error: error.message });
  }
});

// 管理员删除报销类型
router.delete('/admin/expense-types/:id', verifyToken, async (req, res) => {
  try {
    // 权限检查：只有admin可以管理报销类型
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: '只有管理员可以管理报销类型' });
    }
    
    const { id } = req.params;
    const db = require('../db');
    
    // 检查类型是否存在
    const existing = db.prepare('SELECT * FROM expense_types WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ msg: '报销类型不存在' });
    }
    
    // 检查是否有关联的报销记录
    const hasReimbursements = db.prepare('SELECT COUNT(*) as count FROM reimbursements WHERE type = ?').get(existing.name);
    if (hasReimbursements.count > 0) {
      return res.status(400).json({ msg: '该报销类型已被使用，无法删除' });
    }
    
    db.prepare('DELETE FROM expense_types WHERE id = ?').run(id);
    
    res.status(200).json({
      success: true,
      msg: '报销类型删除成功'
    });
    
  } catch (error) {
    console.error('删除报销类型失败:', error);
    res.status(500).json({ msg: '删除报销类型失败', error: error.message });
  }
});

// ========== 凭证相关API ==========

// 获取报销单的凭证列表
router.get('/reimbursement-forms/:id/vouchers', verifyToken, (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const db = require('../db');
    
    console.log('=== 凭证API调试 ===');
    console.log('表单ID:', formId);
    console.log('用户信息:', req.user);
    
    // 验证报销单是否存在且用户有权限访问
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    console.log('表单信息:', form);
    
    if (!form) {
      return res.status(404).json({ success: false, message: '报销单不存在' });
    }
    
    // 权限检查：只有报销单所有者、财务、总经理和管理员可以查看凭证
    const hasPermission = req.user.role === 'admin' || req.user.role === 'finance' || req.user.role === 'manager' || form.user_id === req.user.userId;
    console.log('权限检查:', {
      userRole: req.user.role,
      isAdmin: req.user.role === 'admin',
      isFinance: req.user.role === 'finance',
      isManager: req.user.role === 'manager',
      isOwner: form.user_id === req.user.userId,
      userId: req.user.userId,
      formUserId: form.user_id,
      hasPermission
    });
    
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: '无权限查看凭证' });
    }
    
    // 获取凭证列表 - 修复：只获取与当前报销单记录实际关联的凭证
    // 首先获取当前报销单下的所有记录ID
    const currentRecordIds = db.prepare(`
      SELECT id FROM reimbursements
      WHERE form_id = ?
    `).all(formId).map(r => r.id);

    let vouchers = [];
    if (currentRecordIds.length > 0) {
      // 通过记录-凭证关联表获取实际关联的凭证（与ZIP下载逻辑保持一致）
      const placeholders = currentRecordIds.map(() => '?').join(',');
      vouchers = db.prepare(`
        SELECT DISTINCT v.id, v.original_name, v.file_name, v.file_path, v.file_size, v.file_type, v.uploaded_by, v.created_at
        FROM vouchers v
        INNER JOIN reimbursement_record_vouchers rrv ON v.id = rrv.voucher_id
        WHERE rrv.record_id IN (${placeholders})
          AND v.reimbursement_form_id = ?
        ORDER BY v.created_at DESC
      `).all(...currentRecordIds, formId);
    }
    
    console.log('凭证列表:', vouchers);
    console.log('=== 凭证API调试结束 ===');
    
    res.json(vouchers);
  } catch (error) {
    console.error('获取凭证列表失败:', error);
    res.status(500).json({ success: false, message: '获取凭证列表失败', detail: error.message });
  }
});

// 获取报销单的记录-凭证关联映射
router.get('/reimbursement-forms/:id/record-voucher-links', verifyToken, (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const db = require('../db');
    
    // 验证报销单是否存在且用户有权限访问
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: '报销单不存在' });
    }
    
    // 权限检查：只有报销单所有者、财务、总经理和管理员可以查看关联
    const userId = req.user.id || req.user.userId;
    if (req.user.role !== 'admin' && req.user.role !== 'finance' && req.user.role !== 'manager' && form.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权限查看凭证关联' });
    }
    
    // 首先确保reimbursement_record_vouchers表存在
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reimbursement_record_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER NOT NULL,
        voucher_id INTEGER NOT NULL,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (record_id) REFERENCES reimbursements(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
      )
    `).run();
    
    // 获取当前报销单下所有记录的ID
    const recordIds = db.prepare(`
      SELECT id FROM reimbursements 
      WHERE form_id = ?
    `).all(formId).map(r => r.id);
    
    if (recordIds.length === 0) {
      return res.json([]);
    }
    
    // 获取这些记录的凭证关联
    const placeholders = recordIds.map(() => '?').join(',');
    const links = db.prepare(`
      SELECT record_id, voucher_id, created_by, created_at
      FROM reimbursement_record_vouchers 
      WHERE record_id IN (${placeholders})
      ORDER BY record_id, created_at
    `).all(...recordIds);
    
    res.json(links);
  } catch (error) {
    console.error('获取记录-凭证关联失败:', error);
    res.status(500).json({ success: false, message: '获取记录-凭证关联失败', detail: error.message });
  }
});

// 上传凭证到报销单
router.post('/reimbursement-forms/:id/vouchers', verifyToken, (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const db = require('../db');
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');
    
    // 验证报销单是否存在且用户有权限访问
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: '报销单不存在' });
    }
    
    // 权限检查：只有报销单所有者可以上传凭证
    const userId = req.user.id || req.user.userId;
    if (form.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权限上传凭证' });
    }
    
    // 配置文件上传 - 使用年月日分组的目录结构
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        // 修复：使用正确的基础路径 backend/uploads 而不是 backend/src/uploads
        const uploadsPath = path.join(__dirname, `../../uploads/vouchers/${year}/${month}/form_${formId}`);

        console.log('创建上传目录:', uploadsPath);
        if (!fs.existsSync(uploadsPath)) {
          fs.mkdirSync(uploadsPath, { recursive: true });
        }
        cb(null, uploadsPath);
      },
      filename: (req, file, cb) => {
        // 生成唯一文件名，格式与数据库中的记录保持一致
        const timestamp = Date.now();
        const randomStr1 = Math.random().toString(36).substr(2, 12);
        const randomStr2 = Math.random().toString(36).substr(2, 8);
        const ext = path.extname(file.originalname);
        const fileName = `${timestamp}_${randomStr1}_${randomStr2}${ext}`;
        cb(null, fileName);
      }
    });
    
    const upload = multer({ 
      storage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB限制
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('只允许上传图片、PDF和Office文档'));
        }
      }
    }).single('voucher');
    
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      
      if (!req.file) {
        return res.status(400).json({ success: false, message: '请选择要上传的文件' });
      }
      
      try {
        // 构建相对路径（相对于uploads目录）
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const relativePath = `vouchers/${year}/${month}/form_${formId}/${req.file.filename}`;

        console.log('保存凭证到数据库:', {
          formId,
          originalName: req.file.originalname,
          fileName: req.file.filename,
          relativePath,
          fileSize: req.file.size,
          fileType: req.file.mimetype
        });

        // 保存凭证信息到数据库
        const voucher = db.prepare(`
          INSERT INTO vouchers (reimbursement_form_id, original_name, file_name, file_path, file_size, file_type, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          formId,
          req.file.originalname,
          req.file.filename,
          relativePath,
          req.file.size,
          req.file.mimetype,
          userId
        );
        
        const newVoucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(voucher.lastInsertRowid);
        
        res.json({
          success: true,
          message: '凭证上传成功',
          data: newVoucher
        });
      } catch (dbError) {
        // 如果数据库保存失败，删除已上传的文件
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('删除文件失败:', unlinkError);
        }
        throw dbError;
      }
    });
  } catch (error) {
    console.error('上传凭证失败:', error);
    res.status(500).json({ success: false, message: '上传凭证失败', detail: error.message });
  }
});

// 获取记录关联的凭证
router.get('/reimbursement-records/:id/vouchers', verifyToken, (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const db = require('../db');
    
    console.log('=== 获取记录凭证API ===');
    console.log('recordId:', recordId);
    console.log('用户角色:', req.user.role, '用户ID:', req.user.userId || req.user.id);
    
    // 验证记录是否存在
    const record = db.prepare('SELECT * FROM reimbursements WHERE id = ?').get(recordId);
    console.log('找到记录:', record);
    if (!record) {
      console.log('记录不存在');
      return res.status(404).json({ success: false, message: '报销记录不存在' });
    }
    
    // 验证用户权限（通过报销单）
    console.log('记录中的form_id:', record.form_id);
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(record.form_id);
    console.log('找到报销单:', form);
    if (!form) {
      console.log('报销单不存在');
      return res.status(404).json({ success: false, message: '报销单不存在' });
    }
    
    const userId = req.user.id || req.user.userId;
    if (req.user.role !== 'admin' && req.user.role !== 'finance' && req.user.role !== 'manager' && form.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权限查看凭证' });
    }
    
    // 确保关联表存在
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reimbursement_record_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER NOT NULL,
        voucher_id INTEGER NOT NULL,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (record_id) REFERENCES reimbursements(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
      )
    `).run();
    
    // 获取关联的凭证
    const vouchers = db.prepare(`
      SELECT v.*, rrv.created_at as linked_at
      FROM vouchers v
      INNER JOIN reimbursement_record_vouchers rrv ON v.id = rrv.voucher_id
      WHERE rrv.record_id = ?
      ORDER BY rrv.created_at DESC
    `).all(recordId);
    
    res.json(vouchers);
  } catch (error) {
    console.error('获取记录凭证失败:', error);
    res.status(500).json({ success: false, message: '获取记录凭证失败', detail: error.message });
  }
});

// 关联凭证到记录
router.post('/reimbursement-records/:recordId/vouchers/:voucherId/link', verifyToken, (req, res) => {
  try {
    const recordId = parseInt(req.params.recordId);
    const voucherId = parseInt(req.params.voucherId);
    const db = require('../db');
    const userId = req.user.id || req.user.userId;
    
    // 验证记录和凭证是否存在
    const record = db.prepare('SELECT * FROM reimbursements WHERE id = ?').get(recordId);
    const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(voucherId);
    
    if (!record) {
      return res.status(404).json({ success: false, message: '报销记录不存在' });
    }
    if (!voucher) {
      return res.status(404).json({ success: false, message: '凭证不存在' });
    }
    
    // 验证凭证属于同一个报销单
    if (voucher.reimbursement_form_id !== record.reimbursement_form_id) {
      return res.status(400).json({ success: false, message: '凭证和记录不属于同一个报销单' });
    }
    
    // 验证用户权限
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(record.reimbursement_form_id);
    if (form.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权限操作' });
    }
    
    // 确保关联表存在
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reimbursement_record_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER NOT NULL,
        voucher_id INTEGER NOT NULL,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (record_id) REFERENCES reimbursements(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
        UNIQUE(record_id, voucher_id)
      )
    `).run();
    
    // 检查是否已经关联
    const existing = db.prepare('SELECT * FROM reimbursement_record_vouchers WHERE record_id = ? AND voucher_id = ?').get(recordId, voucherId);
    if (existing) {
      return res.status(400).json({ success: false, message: '凭证已经关联到该记录' });
    }
    
    // 创建关联
    db.prepare('INSERT INTO reimbursement_record_vouchers (record_id, voucher_id, created_by) VALUES (?, ?, ?)').run(recordId, voucherId, userId);
    
    res.json({ success: true, message: '凭证关联成功' });
  } catch (error) {
    console.error('关联凭证失败:', error);
    res.status(500).json({ success: false, message: '关联凭证失败', detail: error.message });
  }
});

// 取消凭证关联
router.delete('/reimbursement-records/:recordId/vouchers/:voucherId', verifyToken, (req, res) => {
  try {
    const recordId = parseInt(req.params.recordId);
    const voucherId = parseInt(req.params.voucherId);
    const db = require('../db');
    const userId = req.user.id || req.user.userId;
    
    // 验证记录和凭证是否存在
    const record = db.prepare('SELECT * FROM reimbursements WHERE id = ?').get(recordId);
    const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(voucherId);
    
    if (!record) {
      return res.status(404).json({ success: false, message: '报销记录不存在' });
    }
    if (!voucher) {
      return res.status(404).json({ success: false, message: '凭证不存在' });
    }
    
    // 验证用户权限
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(record.reimbursement_form_id);
    if (form.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权限操作' });
    }
    
    // 删除关联
    const result = db.prepare('DELETE FROM reimbursement_record_vouchers WHERE record_id = ? AND voucher_id = ?').run(recordId, voucherId);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: '关联不存在' });
    }
    
    res.json({ success: true, message: '取消关联成功' });
  } catch (error) {
    console.error('取消凭证关联失败:', error);
    res.status(500).json({ success: false, message: '取消凭证关联失败', detail: error.message });
  }
});

// 删除凭证
router.delete('/reimbursement-forms/:id/vouchers/:voucherId', verifyToken, (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const voucherId = parseInt(req.params.voucherId);
    const db = require('../db');
    const fs = require('fs');
    const path = require('path');
    const userId = req.user.id || req.user.userId;

    // 验证报销单是否存在
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: '报销单不存在' });
    }

    // 验证用户权限：只有报销单所有者可以删除凭证
    if (form.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权限删除凭证' });
    }

    // 状态检查：只有草稿状态的报销单可以删除凭证
    if (form.status !== '草稿') {
      return res.status(400).json({ success: false, message: '只有草稿状态的报销单可以删除凭证' });
    }

    // 验证凭证是否存在
    const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ? AND reimbursement_form_id = ?').get(voucherId, formId);
    if (!voucher) {
      return res.status(404).json({ success: false, message: '凭证不存在' });
    }
    
    // 开始事务
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // 删除所有关联
      db.prepare('DELETE FROM reimbursement_record_vouchers WHERE voucher_id = ?').run(voucherId);
      
      // 删除凭证记录
      db.prepare('DELETE FROM vouchers WHERE id = ?').run(voucherId);
      
      // 删除文件
      const filePath = path.join(__dirname, '../../uploads', voucher.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      db.prepare('COMMIT').run();
      
      res.json({ success: true, message: '凭证删除成功' });
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('删除凭证失败:', error);
    res.status(500).json({ success: false, message: '删除凭证失败', detail: error.message });
  }
});



// 下载凭证文件
router.get('/reimbursement-forms/:id/vouchers/:voucherId/file', verifyToken, (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const voucherId = parseInt(req.params.voucherId);
    const db = require('../db');
    const path = require('path');
    const fs = require('fs');
    
    console.log('=== 凭证文件下载API ===');
    console.log('formId:', formId, 'voucherId:', voucherId);
    console.log('用户角色:', req.user.role, '用户ID:', req.user.userId || req.user.id);
    
    // 验证凭证是否存在
    const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ? AND reimbursement_form_id = ?').get(voucherId, formId);
    console.log('找到凭证:', voucher);
    if (!voucher) {
      console.log('凭证不存在');
      return res.status(404).json({ success: false, message: '凭证不存在' });
    }
    
    // 验证用户权限
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    const userId = req.user.id || req.user.userId;
    
    console.log('权限检查:', {
      userRole: req.user.role,
      userId: userId,
      formUserId: form.user_id,
      isOwner: form.user_id === userId,
      isPrivileged: ['admin', 'finance', 'manager'].includes(req.user.role)
    });
    
    if (req.user.role !== 'admin' && req.user.role !== 'finance' && req.user.role !== 'manager' && form.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权限下载凭证' });
    }
    
    // 构建文件路径 - 支持多种路径格式
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

    // 从file_name中提取原始文件名（去掉时间戳和随机前缀）
    const extractOriginalName = (fileName) => {
      if (!fileName) return null;
      // 匹配格式：timestamp_randomhex_originalname.ext
      const match = fileName.match(/^\d+_[a-f0-9]+_(.+)$/);
      return match ? match[1] : fileName;
    };

    const originalFileName = extractOriginalName(voucher.file_name);

    // 统一使用 backend/uploads 作为基础路径（不是 backend/src/uploads）
    const uploadsBase = path.join(__dirname, '../../uploads');

    const possiblePaths = [
      // 1. 数据库记录的完整路径
      voucher.file_path ? path.join(uploadsBase, voucher.file_path) : null,
      // 2. 直接在uploads根目录下使用完整file_name
      path.join(uploadsBase, voucher.file_name),
      // 3. 直接在uploads根目录下使用原始文件名
      originalFileName ? path.join(uploadsBase, originalFileName) : null,
      // 4. 按当前年月日分组的路径
      path.join(uploadsBase, `vouchers/${currentYear}/${currentMonth}/form_${formId}`, voucher.file_name),
      // 5. 按创建时年月分组的路径
      voucher.created_at ? (() => {
        const createdDate = new Date(voucher.created_at);
        const year = createdDate.getFullYear();
        const month = String(createdDate.getMonth() + 1).padStart(2, '0');
        return path.join(uploadsBase, `vouchers/${year}/${month}/form_${formId}`, voucher.file_name);
      })() : null,
      // 6. 直接在vouchers目录下（旧格式）
      path.join(uploadsBase, 'vouchers', voucher.file_name),
      // 7. 如果file_path是绝对路径，直接使用
      voucher.file_path && path.isAbsolute(voucher.file_path) ? voucher.file_path : null,
      // 8. 尝试从file_path中提取目录结构
      voucher.file_path ? path.join(uploadsBase, path.dirname(voucher.file_path), voucher.file_name) : null,
      // 9. 备用：2024年的路径格式
      path.join(uploadsBase, `vouchers/2024/${currentMonth}/form_${formId}`, voucher.file_name)
    ].filter(Boolean);

    console.log('=== 文件路径查找 ===');
    console.log('voucher.file_path:', voucher.file_path);
    console.log('voucher.file_name:', voucher.file_name);

    let filePath = null;
    for (let i = 0; i < possiblePaths.length; i++) {
      const testPath = possiblePaths[i];
      console.log(`尝试路径 ${i + 1}: ${testPath}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        console.log(`✅ 找到文件: ${filePath}`);
        break;
      } else {
        console.log(`❌ 文件不存在`);
      }
    }

    if (!filePath) {
      console.log('❌ 所有可能路径都不存在文件');
      return res.status(404).json({ success: false, message: '文件不存在' });
    }
    
    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(voucher.original_name)}"`);
    res.setHeader('Content-Type', voucher.file_type || 'application/octet-stream');
    
    // 发送文件
    res.sendFile(filePath);
  } catch (error) {
    console.error('下载凭证失败:', error);
    res.status(500).json({ success: false, message: '下载凭证失败', detail: error.message });
  }
});

// 预览凭证文件
router.get('/reimbursement-forms/:id/vouchers/:voucherId/preview', verifyToken, (req, res) => {
  try {
    const formId = parseInt(req.params.id);
    const voucherId = parseInt(req.params.voucherId);
    const db = require('../db');
    const path = require('path');
    const fs = require('fs');
    
    console.log('=== 凭证预览API ===');
    console.log('formId:', formId, 'voucherId:', voucherId);
    
  // 使用 verifyToken 注入的 req.user
  const user = req.user;
  console.log('用户角色:', user?.role, '用户ID:', user?.userId || user?.id);
    
    // 验证凭证是否存在
    const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ? AND reimbursement_form_id = ?').get(voucherId, formId);
    if (!voucher) {
      console.log('凭证不存在');
      return res.status(404).json({ success: false, message: '凭证不存在' });
    }
    
    console.log('找到凭证:', voucher);
    
    // 验证用户权限
    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    const userId = user.id || user.userId;
    
    console.log('预览权限检查:', {
      userRole: user.role,
      userId: userId,
      formUserId: form.user_id,
      isOwner: form.user_id === userId,
      isPrivileged: ['admin', 'finance', 'manager'].includes(user.role)
    });
    
    if (user.role !== 'admin' && user.role !== 'finance' && user.role !== 'manager' && form.user_id !== userId) {
      console.log('权限不足');
      return res.status(403).json({ success: false, message: '无权限预览凭证' });
    }

    // 构建文件路径 - 支持多种路径格式（与下载功能保持一致）
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

    // 从file_name中提取原始文件名（去掉时间戳和随机前缀）
    const extractOriginalName = (fileName) => {
      if (!fileName) return null;
      // 匹配格式：timestamp_randomhex_originalname.ext
      const match = fileName.match(/^\d+_[a-f0-9]+_(.+)$/);
      return match ? match[1] : fileName;
    };

    const originalFileName = extractOriginalName(voucher.file_name);

    // 统一使用 backend/uploads 作为基础路径（不是 backend/src/uploads）
    const uploadsBase = path.join(__dirname, '../../uploads');

    const possiblePaths = [
      // 1. 数据库记录的完整路径
      voucher.file_path ? path.join(uploadsBase, voucher.file_path) : null,
      // 2. 直接在uploads根目录下使用完整file_name
      path.join(uploadsBase, voucher.file_name),
      // 3. 直接在uploads根目录下使用原始文件名
      originalFileName ? path.join(uploadsBase, originalFileName) : null,
      // 4. 按当前年月日分组的路径
      path.join(uploadsBase, `vouchers/${currentYear}/${currentMonth}/form_${formId}`, voucher.file_name),
      // 5. 按创建时年月分组的路径
      voucher.created_at ? (() => {
        const createdDate = new Date(voucher.created_at);
        const year = createdDate.getFullYear();
        const month = String(createdDate.getMonth() + 1).padStart(2, '0');
        return path.join(uploadsBase, `vouchers/${year}/${month}/form_${formId}`, voucher.file_name);
      })() : null,
      // 6. 直接在vouchers目录下（旧格式）
      path.join(uploadsBase, 'vouchers', voucher.file_name),
      // 7. 如果file_path是绝对路径，直接使用
      voucher.file_path && path.isAbsolute(voucher.file_path) ? voucher.file_path : null,
      // 8. 尝试从file_path中提取目录结构
      voucher.file_path ? path.join(uploadsBase, path.dirname(voucher.file_path), voucher.file_name) : null,
      // 9. 备用：2024年的路径格式
      path.join(uploadsBase, `vouchers/2024/${currentMonth}/form_${formId}`, voucher.file_name)
    ].filter(Boolean);

    console.log('=== 预览文件路径查找 ===');
    console.log('voucher.file_path:', voucher.file_path);
    console.log('voucher.file_name:', voucher.file_name);

    let filePath = null;
    for (let i = 0; i < possiblePaths.length; i++) {
      const testPath = possiblePaths[i];
      console.log(`尝试路径 ${i + 1}: ${testPath}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        console.log(`✅ 找到文件: ${filePath}`);
        break;
      } else {
        console.log(`❌ 文件不存在`);
      }
    }

    if (!filePath) {
      console.log('❌ 所有可能路径都不存在文件');
      return res.status(404).json({ success: false, message: '文件不存在' });
    }
    
    // 根据文件类型设置响应头
    const mimeType = voucher.file_type || 'application/octet-stream';
    console.log('文件类型:', mimeType);
    
    // 设置响应头，用于预览而不是下载
    res.setHeader('Content-Type', mimeType);
    
    // 对于图片文件，设置为inline显示
    if (mimeType.startsWith('image/')) {
      res.setHeader('Content-Disposition', 'inline');
    } else if (mimeType === 'application/pdf') {
      res.setHeader('Content-Disposition', 'inline');
    } else {
      // 其他文件类型也尝试内联显示
      res.setHeader('Content-Disposition', 'inline');
    }
    
    console.log('开始发送文件');
    // 发送文件用于预览
    res.sendFile(filePath);
  } catch (error) {
    console.error('预览凭证失败:', error);
    res.status(500).json({ success: false, message: '预览凭证失败', detail: error.message });
  }
});

// 财务专用：按报销单打包下载该单的所有凭证
router.get('/reimbursement-forms/:id/vouchers/zip', verifyToken, async (req, res) => {
  try {
    // 角色限制：finance 或 admin
    if (!['finance', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '无权限下载此报销单的所有凭证' });
    }
    const formId = parseInt(req.params.id);
    const db = require('../db');
    const path = require('path');
    const fs = require('fs');
    const archiver = require('archiver');

    const form = db.prepare('SELECT * FROM reimbursement_forms WHERE id = ?').get(formId);
    if (!form) return res.status(404).json({ success: false, message: '报销单不存在' });

    // 修复：只获取当前报销单中实际存在的记录所关联的凭证
    // 首先获取当前报销单中的所有记录ID
    const currentRecordIds = db.prepare('SELECT id FROM reimbursements WHERE form_id = ?').all(formId).map(r => r.id);

    let vouchers = [];
    if (currentRecordIds.length > 0) {
      // 通过记录-凭证关联表获取实际关联的凭证
      const placeholders = currentRecordIds.map(() => '?').join(',');
      vouchers = db.prepare(`
        SELECT DISTINCT v.*
        FROM vouchers v
        INNER JOIN reimbursement_record_vouchers rrv ON v.id = rrv.voucher_id
        WHERE rrv.record_id IN (${placeholders})
          AND v.reimbursement_form_id = ?
        ORDER BY v.created_at ASC
      `).all(...currentRecordIds, formId);
    }
    // 兼容旧数据：若 vouchers 表为空，则尝试从 attachments 表回退打包
    let attachments = [];
    if (!vouchers.length) {
      try {
        attachments = db.prepare(`
          SELECT a.file_path, a.file_name, a.original_name
          FROM attachments a
          JOIN reimbursements r ON a.reimbursement_id = r.id
          WHERE r.form_id = ?
          ORDER BY a.created_at ASC
        `).all(formId);
      } catch (_) { attachments = []; }
      // 若无任何凭证（含旧附件），改为返回一个包含说明文件的ZIP，避免前端出现404体验不佳
      if (!attachments.length) {
        const archiver = require('archiver');
        const zipName = `form_${form.form_number || formId}_vouchers_${Date.now()}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => { try { console.error('zip error:', err); } catch(_){} res.status(500).end(); });
        archive.pipe(res);
        archive.append('该报销单暂无任何凭证可下载。\n如需导出ZIP，请先在明细中上传凭证。', { name: 'README.txt' });
        await archive.finalize();
        return; // 已将说明ZIP作为响应返回
      }
    }

    const zipName = `form_${form.form_number || formId}_vouchers_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { try { console.error('zip error:', err); } catch(_){} res.status(500).end(); });
    archive.pipe(res);

    // 将所有凭证加入 ZIP（按记录或文件名组织）
    const added = new Set();
    console.log('=== ZIP下载调试信息 ===');
    console.log('报销单ID:', formId);
    console.log('找到的凭证数量:', vouchers.length);
    console.log('凭证详情:', vouchers.map(v => ({
      id: v.id,
      file_path: v.file_path,
      original_name: v.original_name,
      file_name: v.file_name
    })));

    for (const v of vouchers) {
      // 修复路径问题：正确构建文件路径
      const filePath = path.join(__dirname, '../../uploads', v.file_path);
      console.log('检查凭证文件:', {
        voucher_id: v.id,
        file_path: v.file_path,
        full_path: filePath,
        exists: fs.existsSync(filePath)
      });

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const name = v.original_name || v.file_name || path.basename(filePath);
        console.log('添加文件到ZIP:', {
          name: name,
          size: stats.size,
          path: filePath
        });

        if (!added.has(filePath)) {
          archive.file(filePath, { name });
          added.add(filePath);
        }
      } else {
        console.error('凭证文件不存在:', filePath);
      }
    }
    // 回退：把旧附件也打进压缩包（避免重复）
    for (const a of attachments) {
      const filePath = path.join(__dirname, '../uploads', a.file_path);
      if (fs.existsSync(filePath) && !added.has(filePath)) {
        const name = a.original_name || a.file_name || path.basename(filePath);
        archive.file(filePath, { name });
        added.add(filePath);
      }
    }

    await archive.finalize();
  } catch (error) {
    try { console.error('打包下载凭证失败:', error); } catch(_){}
    if (!res.headersSent) res.status(500).json({ success: false, message: '打包下载凭证失败', detail: error.message });
  }
});

// 获取已审核的报销单列表（用于打款）
router.get('/', verifyToken, (req, res) => {
  try {
    const { userId, status } = req.query;
    const db = require('../db');
    
    // 权限检查：只有财务可以查看待打款列表
    if (req.user.role !== 'finance' && req.user.role !== 'admin') {
      return res.status(403).json({ msg: '无权限查看待打款列表' });
    }
    
    let query = 'SELECT * FROM reimbursement_forms WHERE 1=1';
    const params = [];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(parseInt(userId));
    }
    
    if (status) {
      // 仅接受中文参数；'已审核' 表示已通过审批的表单集合
      if (status === '已审核') {
        query += ` AND status IN (${STATUS_GROUPS.APPROVED_REIMBURSEMENTS.map(() => '?').join(', ')})`;
        params.push(...STATUS_GROUPS.APPROVED_REIMBURSEMENTS);
      } else {
        query += ' AND status = ?';
        params.push(status);
      }
    }
    
    query += ' ORDER BY created_at DESC';
    
    const forms = db.prepare(query).all(...params);
    res.json(forms);
    
  } catch (error) {
    console.error('获取报销单列表失败:', error);
    res.status(500).json({ msg: '获取报销单列表失败', error: error.message });
  }
});

// 获取已审核的报销单列表（备用路径）
router.get('/reimbursement', verifyToken, (req, res) => {
  try {
    const { userId, status } = req.query;
    const db = require('../db');
    
    // 权限检查：只有财务可以查看待打款列表
    if (req.user.role !== 'finance' && req.user.role !== 'admin') {
      return res.status(403).json({ msg: '无权限查看待打款列表' });
    }
    
    let query = 'SELECT * FROM reimbursement_forms WHERE 1=1';
    const params = [];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(parseInt(userId));
    }
    
    if (status) {
      // 仅接受中文参数；'已审核' 表示已通过审批的表单集合
      if (status === '已审核') {
        query += ` AND status IN (${STATUS_GROUPS.APPROVED_REIMBURSEMENTS.map(() => '?').join(', ')})`;
        params.push(...STATUS_GROUPS.APPROVED_REIMBURSEMENTS);
      } else {
        query += ' AND status = ?';
        params.push(status);
      }
    }
    
    query += ' ORDER BY created_at DESC';
    
    const forms = db.prepare(query).all(...params);
    res.json(forms);
    
  } catch (error) {
    console.error('获取报销单列表失败:', error);
    res.status(500).json({ msg: '获取报销单列表失败', error: error.message });
  }
});

// 获取用户可用的借款列表
router.get('/users/:userId/available-loans', verifyToken, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const db = require('../db');
    
    // 权限检查：只有本人、财务、总经理和管理员可以查看
    const requestUserId = req.user.id || req.user.userId;
    if (req.user.role !== 'admin' && req.user.role !== 'finance' && req.user.role !== 'manager' && userId !== requestUserId) {
      return res.status(403).json({ msg: '无权限查看借款信息' });
    }
    
    // 获取用户的可用借款（已打款或部分已还且有余额的借款）
    const loans = db.prepare(`
      SELECT 
        id,
        amount,
        remaining_amount,
        purpose,
        created_at
      FROM loans 
      WHERE user_id = ? 
        AND status IN (${STATUS_GROUPS.AVAILABLE_LOANS.map(() => '?').join(', ')})
        AND remaining_amount > 0
      ORDER BY created_at DESC
    `).all(userId, ...STATUS_GROUPS.AVAILABLE_LOANS);
    
    res.json(loans);
    
  } catch (error) {
    console.error('获取可用借款失败:', error);
    res.status(500).json({ msg: '获取可用借款失败', error: error.message });
  }
});

// 🆕 基于被驳回的报销单创建新报销单
router.post('/reimbursement-forms/:id/create-from-rejected', verifyToken, async (req, res) => {
  try {
    const rejectedFormId = parseInt(req.params.id);
    const { items, statusFlag = '草稿' } = req.body;

    const result = await createFormFromRejected(rejectedFormId, req.user, items, statusFlag);
    res.json({
      success: true,
      formId: result.formId,
      form_number: result.formNumber,  // 前端期望的字段名
      formNumber: result.formNumber,   // 保持兼容性
      totalAmount: result.totalAmount,
      reimbursementIds: result.reimbursementIds,
      source_form_id: result.source_form_id,
      source_form_number: result.source_form_number
    });
  } catch (error) {
    console.error('基于被驳回报销单创建新单失败:', error);
    if (error.message === 'REJECTED_FORM_NOT_FOUND') {
      return res.status(404).json({ error: '被驳回的报销单不存在' });
    }
    if (error.message === 'FORM_NOT_REJECTED') {
      return res.status(400).json({ error: '该报销单未被驳回，无法基于其创建新单' });
    }
    if (error.message === 'CANNOT_CREATE_FROM_REJECTED') {
      return res.status(400).json({ error: '该报销单不允许基于其创建新单' });
    }
    if (error.message === 'FORBIDDEN') {
      return res.status(403).json({ error: '无权限操作此报销单' });
    }
    res.status(500).json({ error: '创建新报销单失败' });
  }
});

module.exports = router;

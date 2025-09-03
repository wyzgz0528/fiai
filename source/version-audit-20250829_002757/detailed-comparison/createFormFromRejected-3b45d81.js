async function createFormFromRejected(rejectedFormId, user, items = null, statusFlag = '草稿') {
  const rejectedForm = db.prepare('SELECT * FROM reimbursement_forms WHERE id=?').get(rejectedFormId);
  if (!rejectedForm) throw new Error('REJECTED_FORM_NOT_FOUND');

  // 权限检查：只有报销单的创建者可以基于其创建新单
  if (parseInt(rejectedForm.user_id) !== parseInt(user.userId)) throw new Error('FORBIDDEN');

  // 检查是否为被驳回的报销单
  const norm = normalizeFormStatus(rejectedForm.status);
  if (!['finance_rejected', 'manager_rejected'].includes(norm)) {
    throw new Error('FORM_NOT_REJECTED');
  }

  // 检查是否允许基于此单创建新单
  if (rejectedForm.can_create_new_from_rejected === false) {
    throw new Error('CANNOT_CREATE_FROM_REJECTED');
  }

  // 如果没有提供新明细，则复制原明细（包括所有发票字段和附件）
  let newItems = items;
  if (!newItems) {
    console.log(`🔍 [DEBUG] 开始复制被驳回报销单 ${rejectedFormId} 的明细`);
    const originalRecords = db.prepare('SELECT * FROM reimbursements WHERE form_id=?').all(rejectedFormId);
    console.log(`🔍 [DEBUG] 找到 ${originalRecords.length} 条原始记录`);

    newItems = await Promise.all(originalRecords.map(async (record) => {
      console.log(`🔍 [DEBUG] 处理记录 ${record.id}:`, {
        amount: record.amount,
        purpose: record.purpose,
        invoice_number: record.invoice_number,
        invoice_date: record.invoice_date,
        buyer_name: record.buyer_name,
        service_name: record.service_name
      });
      // 获取该记录关联的凭证
      const vouchers = db.prepare(`
        SELECT v.* FROM vouchers v
        JOIN reimbursement_record_vouchers rrv ON v.id = rrv.voucher_id
        WHERE rrv.record_id = ?
      `).all(record.id);

      console.log(`🔍 [DEBUG] 记录 ${record.id} 找到 ${vouchers.length} 个凭证:`, vouchers.map(v => v.original_name));

      // 复制凭证文件到临时目录，以便后续处理
      const attachments = [];
      for (const voucher of vouchers) {
        try {
          const originalPath = path.join(UPLOAD_DIR, voucher.file_path);
          console.log(`🔍 [DEBUG] 检查原始文件路径: ${originalPath}`);
          if (fs.existsSync(originalPath)) {
            console.log(`✅ [DEBUG] 文件存在，开始复制: ${voucher.original_name}`);
            // 生成唯一的临时文件名
            const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${voucher.original_name}`;

            // 创建临时文件记录
            const tempInfo = db.prepare(`
              INSERT INTO temp_attachments (user_id, file_path, file_type, file_size, uploaded_at)
              VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
            `).run(user.userId, tempFileName, voucher.file_type, voucher.file_size);

            // 复制文件到临时目录
            const tempPath = path.join(UPLOAD_DIR, tempFileName);
            fs.copyFileSync(originalPath, tempPath);

            attachments.push({
              temp_id: tempInfo.lastInsertRowid,
              name: voucher.original_name,
              size: voucher.file_size,
              type: voucher.file_type
            });
            console.log(`✅ [DEBUG] 附件添加成功: ${voucher.original_name}, temp_id: ${tempInfo.lastInsertRowid}`);
          } else {
            console.warn(`❌ [DEBUG] 文件不存在: ${originalPath}`);
          }
        } catch (error) {
          console.error(`❌ [DEBUG] 复制凭证文件失败: ${voucher.original_name}`, error.message);
        }
      }

      const newItem = {
        amount: record.amount,
        purpose: record.purpose,
        type: record.type,
        remark: `重新申请：${record.remark || ''}`,
        invoice_number: record.invoice_number,
        // 复制所有发票扩展字段
        invoice_date: record.invoice_date,
        buyer_name: record.buyer_name,
        service_name: record.service_name,
        // 包含附件信息
        attachments: attachments
      };

      console.log(`🔍 [DEBUG] 生成新项目:`, {
        invoice_fields: {
          invoice_number: newItem.invoice_number,
          invoice_date: newItem.invoice_date,
          buyer_name: newItem.buyer_name,
          service_name: newItem.service_name
        },
        attachments_count: newItem.attachments.length
      });

      return newItem;
    }));
  }

  console.log(`🔍 [DEBUG] 最终传递给createFormAutoGenerate的数据:`, {
    items_count: newItems.length,
    items: newItems.map(item => ({
      amount: item.amount,
      purpose: item.purpose,
      invoice_number: item.invoice_number,
      invoice_date: item.invoice_date,
      buyer_name: item.buyer_name,
      service_name: item.service_name,
      attachments_count: item.attachments ? item.attachments.length : 0
    }))
  });

  // 创建新报销单（排除被驳回的原报销单，允许复用其发票号）
  const newFormResult = createFormAutoGenerate(user, newItems, statusFlag, rejectedFormId);

  // 记录关联关系
  try {
    db.prepare(`
      INSERT INTO reimbursement_form_relations
      (rejected_form_id, new_form_id, relation_type, created_by, created_at)
      VALUES (?, ?, 'created_from_rejected', ?, datetime('now', 'localtime'))
    `).run(rejectedFormId, newFormResult.formId, user.userId);

    logAction({
      userId: user.userId,
      action: 'form_create_from_rejected',
      detail: `rejected_form=${rejectedFormId};new_form=${newFormResult.formId}`
    });
  } catch (e) {
    console.warn('记录报销单关联关系失败:', e.message);
  }

  return {
    ...newFormResult,
    source_form_id: rejectedFormId,
    source_form_number: rejectedForm.form_number
  };
}

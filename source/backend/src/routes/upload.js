const express = require('express');
const { verifyToken } = require('../middlewares/auth');
const { hasPermission } = require('../auth/permissions');
const router = express.Router();


const path = require('path');
const fs = require('fs');
const db = require('../db');
const multer = require('multer');
// 统一上传目录到 backend/uploads （之前使用 ../uploads 实际指向 backend/src/uploads，导致与 OCR 查找的 backend/uploads 不一致）
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 使用自定义 storage 以保留原始扩展名，避免临时文件丢失扩展名导致后续识别/下载失败
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const unique = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    cb(null, unique + ext.toLowerCase());
  }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// 上传附件到临时区（仅登录用户）
router.post('/upload-temp', verifyToken, upload.single('file'), (req, res) => {
  // 允许上传的角色场景：
  // - 员工新建/编辑 (forms.create / forms.update.own)
  // - 财务/经理在审核过程中追加或替换凭证 (forms.read.department)
  // - 管理员 (forms.read.all)
  // 之前逻辑忽略了 finance/manager，导致其上传时报 403
  const role = req.user.role;
  const canUpload = (
    hasPermission(role, 'forms.create') ||
    hasPermission(role, 'forms.update.own') ||
    hasPermission(role, 'forms.read.department') ||
    hasPermission(role, 'forms.read.all')
  );
  if (!canUpload) {
    return res.status(403).json({ msg: '无权限' });
  }
  if (!req.file) return res.status(400).json({ msg: '未上传文件' });
  // 直接保存文件名（storage 已经定位在统一目录）
  const file_path = req.file.filename;
  // 记录时保留扩展名，便于后续 OCR / 下载精确定位
  db.prepare('INSERT INTO temp_attachments(user_id, file_path, file_type, file_size) VALUES (?,?,?,?)')
    .run(req.user.userId, file_path, req.file.mimetype, req.file.size);
  const tempId = db.prepare('SELECT last_insert_rowid() as id').get().id;
  res.json({
    success: true,
    id: tempId,
    file_path,
    message: '文件上传成功'
  });
});

// 列举我的临时附件
router.get('/temp-attachments', verifyToken, (req, res) => {
  const list = db.prepare('SELECT id, file_path, file_type, file_size, uploaded_at FROM temp_attachments WHERE user_id=? ORDER BY uploaded_at DESC').all(req.user.userId);
  res.json(list);
});

// 下载临时附件
router.get('/temp-attachments/:id', verifyToken, (req, res) => {
  try {
    const att = db.prepare('SELECT * FROM temp_attachments WHERE id=?').get(req.params.id);
    if (!att) return res.status(404).json({msg: '未找到文件'});

    // 权限检查：只有文件上传者或有权限的用户可以下载
    if (att.user_id !== req.user.userId && !hasPermission(req.user.role,'forms.read.department') && !hasPermission(req.user.role,'forms.read.all')) {
      return res.status(403).json({msg: '无权限'});
    }

    const absPath = path.resolve(UPLOAD_DIR, att.file_path);
    if (!absPath.startsWith(UPLOAD_DIR)) {
      return res.status(400).json({msg: '非法文件路径'});
    }

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({msg: '文件不存在'});
    }

    // 设置响应头
    res.setHeader('Content-Type', att.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.file_path)}"`);

    // 发送文件
    res.sendFile(absPath);
  } catch (error) {
    console.error('下载临时附件失败:', error);
    res.status(500).json({msg: '下载失败'});
  }
});

// 删除我的某个临时附件
router.delete('/temp-attachments/:id', verifyToken, (req, res) => {
  const att = db.prepare('SELECT * FROM temp_attachments WHERE id=?').get(req.params.id);
  if (!att) return res.status(404).json({msg: '未找到文件'});
  if (att.user_id !== req.user.userId && !hasPermission(req.user.role,'forms.delete.any')) {
    return res.status(403).json({msg: '无权限'});
  }
  const absPath = path.resolve(UPLOAD_DIR, att.file_path);
  if (!absPath.startsWith(UPLOAD_DIR)) {
    return res.status(400).json({msg: '非法文件路径'});
  }
  fs.unlink(absPath, () => {});
  db.prepare('DELETE FROM temp_attachments WHERE id=?').run(att.id);
  res.json({msg: '附件已删除'});
});

// 下载附件
router.get('/:id', verifyToken, (req, res) => {
  try {
    const attachmentId = req.params.id;
    const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachmentId);
    
    if (!attachment) {
      return res.status(404).json({ msg: '附件不存在' });
    }
    
    // 检查权限：只有相关用户或管理员可以下载
  if (!(hasPermission(req.user.role,'forms.read.department') || hasPermission(req.user.role,'forms.read.all'))) {
      // 检查是否是用户自己的报销单附件
      const reimbursement = db.prepare('SELECT user_id FROM reimbursements WHERE id = ?').get(attachment.reimbursement_id);
      if (!reimbursement || reimbursement.user_id !== req.user.userId) {
        return res.status(403).json({ msg: '无权限下载此附件' });
      }
    }
    
    const filePath = path.join(UPLOAD_DIR, attachment.file_path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ msg: '文件不存在' });
    }
    
    // 设置下载响应头
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.original_name || `attachment_${attachmentId}`)}"`);
    res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
    
    // 发送文件
    res.sendFile(filePath);
  } catch (error) {
    console.error('下载附件失败:', error);
    res.status(500).json({ msg: '下载附件失败' });
  }
});

module.exports = router;

const express = require('express');
const path = require('path');
const fs = require('fs');
const { verifyToken, requireRole } = require('../middlewares/auth');
const exportService = require('../services/exportService');
const csvExportService = require('../services/csvExportService');

const router = express.Router();

/**
 * POST /api/export/financial-ledger
 * 导出财务台账（包含发票信息）
 * 权限：财务、管理员
 */
router.post('/financial-ledger', verifyToken, requireRole(['finance', 'admin']), async (req, res) => {
  try {
    const filters = {
      user_id: req.body.user_id ? parseInt(req.body.user_id) : null,
      status: req.body.status,
      start_date: req.body.start_date,
      end_date: req.body.end_date,
      has_invoice: req.body.has_invoice,
      limit: req.body.limit ? parseInt(req.body.limit) : null
    };

    const options = {
      format: req.body.format || 'csv', // 默认改为CSV
      includeInvoiceInfo: req.body.includeInvoiceInfo !== false
    };

    console.log(`财务台账导出请求 - 用户: ${req.user.username}, 过滤条件:`, filters);

    // 根据格式选择导出服务
    const result = options.format === 'csv'
      ? await csvExportService.exportFinancialLedger(filters)
      : await exportService.exportFinancialLedger(filters, options);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: '导出失败',
        error: result.error
      });
    }

    res.json({
      success: true,
      message: '财务台账导出成功',
      data: {
        filename: result.filename,
        recordCount: result.recordCount,
        fileSize: result.fileSize,
        downloadUrl: `/api/export/download/${result.filename}`
      }
    });

  } catch (error) {
    console.error('财务台账导出错误:', error);
    res.status(500).json({
      success: false,
      message: '导出失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/export/reimbursement-list
 * 导出报销记录列表
 * 权限：财务、管理员、经理
 */
router.post('/reimbursement-list', verifyToken, requireRole(['finance', 'admin', 'manager']), async (req, res) => {
  try {
    const filters = {
      user_id: req.body.user_id ? parseInt(req.body.user_id) : null,
      status: req.body.status,
      start_date: req.body.start_date,
      end_date: req.body.end_date,
      has_invoice: req.body.has_invoice,
      limit: req.body.limit ? parseInt(req.body.limit) : null
    };

    // 经理只能导出自己部门的数据（这里简化为自己的数据）
    if (req.user.role === 'manager' && !filters.user_id) {
      filters.user_id = req.user.userId;
    }

    console.log(`报销记录导出请求 - 用户: ${req.user.username}, 过滤条件:`, filters);

    const result = await exportService.exportReimbursementList(filters);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: '导出失败',
        error: result.error
      });
    }

    res.json({
      success: true,
      message: '报销记录导出成功',
      data: {
        filename: result.filename,
        recordCount: result.recordCount,
        fileSize: result.fileSize,
        downloadUrl: `/api/export/download/${result.filename}`
      }
    });

  } catch (error) {
    console.error('报销记录导出错误:', error);
    res.status(500).json({
      success: false,
      message: '导出失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/export/download/:filename
 * 下载导出文件
 */
router.get('/download/:filename', verifyToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // 安全检查：允许下载xlsx和csv文件，防止路径遍历攻击
    if ((!filename.endsWith('.xlsx') && !filename.endsWith('.csv')) || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        success: false,
        message: '无效的文件名'
      });
    }

    const filepath = path.join(__dirname, '..', '..', 'exports', filename);

    // 检查文件是否存在
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    console.log(`文件下载请求 - 用户: ${req.user.username}, 文件: ${filename}`);

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    // 发送文件
    res.sendFile(filepath);

  } catch (error) {
    console.error('文件下载错误:', error);
    res.status(500).json({
      success: false,
      message: '下载失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/export/files
 * 获取导出文件列表
 * 权限：财务、管理员
 */
router.get('/files', verifyToken, requireRole(['finance', 'admin']), async (req, res) => {
  try {
    console.log(`获取导出文件列表请求 - 用户: ${req.user.username}`);

    const result = exportService.getExportFiles();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: '获取文件列表失败',
        error: result.error
      });
    }

    res.json({
      success: true,
      data: result.files.map(file => ({
        filename: file.filename,
        size: file.size,
        created: file.created,
        age: file.age,
        downloadUrl: `/api/export/download/${file.filename}`
      }))
    });

  } catch (error) {
    console.error('获取导出文件列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取文件列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/export/cleanup
 * 清理过期的导出文件
 * 权限：管理员
 */
router.delete('/cleanup', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const maxAgeHours = req.query.maxAge ? parseInt(req.query.maxAge) : 24;

    console.log(`清理导出文件请求 - 用户: ${req.user.username}, 最大保留时间: ${maxAgeHours}小时`);

    const result = exportService.cleanupOldExports(maxAgeHours);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: '清理失败',
        error: result.error
      });
    }

    res.json({
      success: true,
      message: `清理完成，删除了 ${result.deletedCount} 个过期文件`,
      data: {
        deletedCount: result.deletedCount
      }
    });

  } catch (error) {
    console.error('清理导出文件错误:', error);
    res.status(500).json({
      success: false,
      message: '清理失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/export/status
 * 获取导出服务状态
 */
router.get('/status', verifyToken, async (req, res) => {
  try {
    const fileListResult = exportService.getExportFiles();
    
    res.json({
      success: true,
      data: {
        exportDirExists: fs.existsSync(path.join(__dirname, '..', '..', 'exports')),
        totalFiles: fileListResult.success ? fileListResult.files.length : 0,
        xlsxSupported: true,
        permissions: {
          canExportFinancialLedger: ['finance', 'admin'].includes(req.user.role),
          canExportReimbursementList: ['finance', 'admin', 'manager'].includes(req.user.role),
          canViewFiles: ['finance', 'admin'].includes(req.user.role),
          canCleanup: req.user.role === 'admin'
        }
      }
    });

  } catch (error) {
    console.error('获取导出服务状态错误:', error);
    res.status(500).json({
      success: false,
      message: '获取状态失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

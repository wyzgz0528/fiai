const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ocrService = require('../services/ocrService');
const invoiceService = require('../services/invoiceService');
const { verifyToken } = require('../middlewares/auth');

const router = express.Router();

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/ocr_temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const uniqueName = `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/tiff', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件格式，请上传 JPG、PNG、BMP、TIFF 或 PDF 格式的文件'));
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  }
});

/**
 * POST /api/ocr/invoice
 * 识别发票图片中的发票号
 */
router.post('/invoice', verifyToken, upload.single('invoice_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传发票文件（支持图片和PDF格式）'
      });
    }

    console.log(`OCR识别请求 - 用户: ${req.user.username}, 文件: ${req.file.filename}`);

    // 调用OCR服务识别发票号
    const result = await ocrService.recognizeInvoiceNumber(req.file.path);

    // 清理临时文件
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.warn('清理临时文件失败:', cleanupError.message);
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'OCR识别失败'
      });
    }

    // 验证发票号格式
    const validation = ocrService.validateInvoiceNumber(result.invoiceNumber);

    res.json({
      success: true,
      data: {
        invoiceNumber: result.invoiceNumber,
        confidence: result.confidence,
        validation: validation,
        suggestion: validation.isValid ? validation.cleanNumber : result.invoiceNumber,
        mode: result.mode || (result.fallback ? 'mock-fallback' : (ocrService.isEnabled ? 'production' : 'mock')),
        fallback: !!result.fallback,
        debug: {
          allText: result.allText,
          boundingBox: result.boundingBox,
          rawError: result.error || undefined
        }
      }
    });

  } catch (error) {
    console.error('OCR接口错误:', error);

    // 清理临时文件
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn('清理临时文件失败:', cleanupError.message);
      }
    }

    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/ocr/recognize-temp
 * 识别临时文件中的发票号
 */
router.post('/recognize-temp', verifyToken, upload.none(), async (req, res) => {
  try {
  // 兼容前端不同命名：temp_id / tempId
  const temp_id = req.body.temp_id || req.body.tempId || req.body.id;
    
    console.log('OCR recognize-temp 请求:', {
      user: req.user?.username,
      temp_id,
      body: req.body
    });
    
    if (!temp_id) {
      console.log('错误: 缺少临时文件ID');
      return res.status(400).json({ 
        success: false, 
        message: '缺少临时文件ID' 
      });
    }
    
    // 从临时附件表获取文件路径
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, '..', 'db.sqlite'));
    
  const tempFile = db.prepare('SELECT * FROM temp_attachments WHERE id = ?').get(temp_id);
    db.close();
    
    console.log('查找临时文件结果:', tempFile ? `找到文件路径: ${tempFile.file_path}` : '文件不存在');
    
    if (!tempFile) {
      return res.status(404).json({ 
        success: false, 
        message: '临时文件不存在' 
      });
    }
    
    let filePath = path.join(__dirname, '..', '..', 'uploads', tempFile.file_path);
    
    // 如果文件不存在且没有扩展名，尝试匹配同 hash 前缀的文件（历史遗留：早期未保存扩展名）
    if (!fs.existsSync(filePath)) {
      const ext = path.extname(tempFile.file_path);
      if (!ext) {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        try {
          const candidates = fs.readdirSync(uploadDir).filter(f => f.startsWith(tempFile.file_path));
          if (candidates.length > 0) {
            filePath = path.join(uploadDir, candidates[0]);
            console.log('自动匹配到带扩展名的文件:', candidates[0]);
          }
        } catch (_) {}
      }
    }
    
    // 最终仍不存在则报错
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }
    
    console.log(`临时文件OCR识别请求 - 用户: ${req.user.username}, 文件: ${tempFile.file_path}`);
    
    // 调用OCR服务识别发票号
    const result = await ocrService.recognizeInvoiceNumber(filePath);
    
    console.log('OCR服务原始返回结果:', JSON.stringify(result, null, 2));
    
    console.log('OCR识别结果:', JSON.stringify(result, null, 2));
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'OCR识别失败'
      });
    }
    
    // 验证发票号格式
    // 处理不同的字段名格式：invoiceNumber 或 invoice_number
    const invoiceNumber = result.invoiceNumber || result.invoice_number || '';
    const validation = ocrService.validateInvoiceNumber(invoiceNumber);
    
    res.json({
      success: true,
      invoice_numbers: [{
        number: invoiceNumber,
        confidence: result.confidence,
        validation: validation,
        suggestion: validation.isValid ? validation.cleanNumber : invoiceNumber
      }],
      debug: {
        allText: result.allText || result.all_text,
        boundingBox: result.boundingBox || result.bounding_box
      }
    });
    
  } catch (error) {
    console.error('临时文件OCR识别错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '识别失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/ocr/batch
 * 批量识别多张发票图片
 */
router.post('/batch', verifyToken, upload.array('invoice_images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请上传至少一张发票图片'
      });
    }

    console.log(`批量OCR识别请求 - 用户: ${req.user.username}, 文件数: ${req.files.length}`);

    const imagePaths = req.files.map(file => file.path);
    const results = await ocrService.batchRecognize(imagePaths);

    // 清理临时文件
    req.files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.warn('清理临时文件失败:', cleanupError.message);
      }
    });

    // 处理结果
    const processedResults = results.map((result, index) => {
      const validation = result.success ? 
        ocrService.validateInvoiceNumber(result.invoiceNumber) : 
        { isValid: false, type: 'unknown', cleanNumber: '' };

      return {
        filename: req.files[index].originalname,
        success: result.success,
        invoiceNumber: result.invoiceNumber || null,
        confidence: result.confidence || 0,
        validation,
        suggestion: validation.isValid ? validation.cleanNumber : result.invoiceNumber,
        error: result.error || null
      };
    });

    res.json({
      success: true,
      data: {
        totalFiles: req.files.length,
        successCount: processedResults.filter(r => r.success).length,
        results: processedResults
      }
    });

  } catch (error) {
    console.error('批量OCR接口错误:', error);

    // 清理临时文件
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.warn('清理临时文件失败:', cleanupError.message);
        }
      });
    }

    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/ocr/health
 * 健康检查（无需认证）
 */
router.get('/health', async (req, res) => {
  try {
    const ocrStatus = ocrService.getStatus();
    res.json({
      success: true,
      service: 'OCR识别服务',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      ocr: ocrStatus
    });
  } catch (error) {
    console.error('OCR健康检查错误:', error);
    res.status(500).json({
      success: false,
      message: 'OCR服务健康检查失败'
    });
  }
});

/**
 * GET /api/ocr/status
 * 检查OCR服务状态
 */
router.get('/status', verifyToken, async (req, res) => {
  try {
    // 获取OCR服务状态
    const ocrStatus = ocrService.getStatus();

    res.json({
      success: true,
      ...ocrStatus,
      supportedFormats: ['JPG', 'PNG', 'BMP', 'TIFF', 'PDF'],
      maxFileSize: '10MB',
      features: [
        'Azure智能文档识别',
        '发票号码识别',
        '多字段识别',
        '高精度金额计算',
        '批量处理'
      ]
    });
  } catch (error) {
    console.error('OCR状态检查错误:', error);
    res.status(500).json({
      success: false,
      message: 'OCR服务状态检查失败'
    });
  }
});

/**
 * POST /api/ocr/recognize-multifield
 * 识别发票图片中的多个字段（发票号、金额、日期、公司名、服务名）
 */
router.post('/recognize-multifield', verifyToken, upload.single('invoice_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传发票图片'
      });
    }

    console.log(`OCR多字段识别请求 - 用户: ${req.user.username}, 文件: ${req.file.filename}`);

    // 调用OCR服务识别多字段
    const result = await ocrService.recognizeInvoiceMultiField(req.file.path);

    // 清理临时文件
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.warn('清理临时文件失败:', cleanupError.message);
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'OCR多字段识别失败'
      });
    }

    res.json({
      success: true,
      data: {
        invoice_number: result.invoice_number,
        amount: result.amount,
        invoice_date: result.invoice_date,
        buyer_name: result.buyer_name,
        service_name: result.service_name,
        overall_confidence: result.confidence,
        mode: result.mode || 'production'
      },
      debug: {
        allText: result.all_text,
        rawResult: process.env.NODE_ENV === 'development' ? result : undefined
      }
    });

  } catch (error) {
    console.error('多字段OCR识别错误:', error);
    res.status(500).json({
      success: false,
      message: '多字段识别失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/ocr/recognize-temp-multifield
 * 识别临时上传文件中的多个发票字段
 */
router.post('/recognize-temp-multifield', verifyToken, async (req, res) => {
  try {
    const { temp_id } = req.body;

    if (!temp_id) {
      return res.status(400).json({
        success: false,
        message: '缺少临时文件ID'
      });
    }

    // 从临时附件表获取文件路径
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, '..', 'db.sqlite'));

    const tempFile = db.prepare('SELECT * FROM temp_attachments WHERE id = ?').get(temp_id);
    db.close();

    if (!tempFile) {
      return res.status(404).json({
        success: false,
        message: '临时文件不存在'
      });
    }

    let filePath = path.join(__dirname, '..', '..', 'uploads', tempFile.file_path);

    // 如果文件不存在且没有扩展名，尝试匹配同 hash 前缀的文件
    if (!fs.existsSync(filePath)) {
      const ext = path.extname(tempFile.file_path);
      if (!ext) {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        try {
          const candidates = fs.readdirSync(uploadDir).filter(f => f.startsWith(tempFile.file_path));
          if (candidates.length > 0) {
            filePath = path.join(uploadDir, candidates[0]);
          }
        } catch (_) {}
      }
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }

    console.log(`临时文件多字段OCR识别请求 - 用户: ${req.user.username}, 文件: ${tempFile.file_path}`);

    // 调用OCR服务识别多字段
    const result = await ocrService.recognizeInvoiceMultiField(filePath);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'OCR多字段识别失败'
      });
    }

    res.json({
      success: true,
      data: {
        invoice_number: result.invoice_number,
        amount: result.amount,
        invoice_date: result.invoice_date,
        buyer_name: result.buyer_name,
        service_name: result.service_name,
        overall_confidence: result.overall_confidence || result.confidence || 0.8,
        mode: result.mode || 'production'
      },
      debug: {
        allText: result.all_text
      }
    });

  } catch (error) {
    console.error('临时文件多字段OCR识别错误:', error);
    res.status(500).json({
      success: false,
      message: '多字段识别失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/ocr/save-invoice-info
 * 保存OCR识别的发票信息到报销记录
 */
router.post('/save-invoice-info', verifyToken, async (req, res) => {
  try {
    const { reimbursementId, ocrResult, mode = 'production' } = req.body;

    if (!reimbursementId || !ocrResult) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：reimbursementId 和 ocrResult'
      });
    }

    console.log(`保存发票信息请求 - 用户: ${req.user.username}, 报销记录ID: ${reimbursementId}`);

    const result = await invoiceService.saveInvoiceInfo(reimbursementId, ocrResult, mode);

    res.json({
      success: true,
      message: '发票信息保存成功',
      data: result
    });

  } catch (error) {
    console.error('保存发票信息错误:', error);
    res.status(500).json({
      success: false,
      message: '保存发票信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/ocr/invoice-info/:reimbursementId
 * 获取报销记录的发票信息
 */
router.get('/invoice-info/:reimbursementId', verifyToken, async (req, res) => {
  try {
    const { reimbursementId } = req.params;

    if (!reimbursementId || isNaN(reimbursementId)) {
      return res.status(400).json({
        success: false,
        message: '无效的报销记录ID'
      });
    }

    const result = await invoiceService.getInvoiceInfo(parseInt(reimbursementId));

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('获取发票信息错误:', error);
    res.status(500).json({
      success: false,
      message: '获取发票信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/ocr/invoice-batch
 * 批量获取发票信息（用于台账导出）
 */
router.get('/invoice-batch', verifyToken, async (req, res) => {
  try {
    const filters = {
      user_id: req.query.user_id ? parseInt(req.query.user_id) : null,
      status: req.query.status,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      has_invoice: req.query.has_invoice === 'true',
      limit: req.query.limit ? parseInt(req.query.limit) : null
    };

    // 权限检查：普通用户只能查看自己的记录
    if (req.user.role === 'employee' && !filters.user_id) {
      filters.user_id = req.user.userId;
    } else if (req.user.role === 'employee' && filters.user_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: '权限不足：只能查看自己的报销记录'
      });
    }

    console.log(`批量获取发票信息请求 - 用户: ${req.user.username}, 过滤条件:`, filters);

    const result = await invoiceService.getInvoiceInfoBatch(filters);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      filters: filters
    });

  } catch (error) {
    console.error('批量获取发票信息错误:', error);
    res.status(500).json({
      success: false,
      message: '批量获取发票信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/ocr/check-duplicate/:invoiceNumber
 * 检查发票号是否重复
 */
router.get('/check-duplicate/:invoiceNumber', verifyToken, async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { excludeId } = req.query;

    if (!invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: '缺少发票号参数'
      });
    }

    const result = await invoiceService.checkInvoiceDuplicate(
      invoiceNumber,
      excludeId ? parseInt(excludeId) : null
    );

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      isDuplicate: result.isDuplicate,
      duplicates: result.duplicates
    });

  } catch (error) {
    console.error('检查发票号重复错误:', error);
    res.status(500).json({
      success: false,
      message: '检查发票号重复失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

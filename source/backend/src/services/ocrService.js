const azureOcrService = require('./azureOcrService');

/**
 * OCR识别服务 - 仅支持Azure Document Intelligence
 * 已移除Python OCR依赖，专注于Azure云服务
 */
class OCRService {
  constructor() {
    console.log('OCR服务: 初始化Azure OCR服务（已移除Python依赖）');
    
    // 仅支持Azure OCR，不再使用Python引擎
    this.isEnabled = false; // Python OCR已禁用
    this.isModelWarmedUp = true; // Azure无需预热
    this.preferredEngine = 'azure'; // 固定使用Azure
  }

  /**
   * Python OCR已移除，此方法保留兼容性
   */
  checkPythonAvailability() {
    return false;
  }

  /**
   * 模型预热（Azure无需预热）
   */
  async warmupModel() {
    console.log('OCR服务: Azure OCR无需预热');
    return { success: true, message: 'Azure OCR无需预热' };
  }

  /**
   * 主要OCR识别接口 - 仅使用Azure
   */
  async recognizeInvoiceMultiField(imagePath) {
    try {
      console.log('OCR服务: 使用Azure Document Intelligence识别');
      
      // 直接调用Azure OCR服务
      const azureResult = await azureOcrService.recognizeInvoiceMultiField(imagePath);
      
      if (azureResult.success) {
        console.log('OCR服务: Azure识别成功');
        return azureResult;
      } else {
        console.log('OCR服务: Azure识别失败');
        throw new Error('Azure OCR识别失败');
      }
    } catch (error) {
      console.error('OCR服务: 识别异常:', error.message);
      return {
        success: false,
        error: error.message,
        mode: 'azure_error'
      };
    }
  }

  /**
   * 智能OCR识别 - 仅使用Azure（保留兼容性）
   */
  async recognizeInvoiceMultiFieldSmart(imagePath) {
    return this.recognizeInvoiceMultiField(imagePath);
  }

  /**
   * 发票号识别 - 仅使用Azure（保留兼容性）
   */
  async recognizeInvoiceNumberSmart(imagePath) {
    return this.recognizeInvoiceMultiField(imagePath);
  }

  /**
   * 获取OCR服务状态
   */
  getStatus() {
    const azureStatus = azureOcrService.getStatus();
    
    return {
      isEnabled: false, // Python OCR已禁用
      mode: 'azure_only',
      preferredEngine: 'azure',
      availableEngines: ['azure'],
      isModelWarmedUp: true,
      pythonPath: 'N/A (已移除)',
      azure: azureStatus,
      message: 'Python OCR已移除，仅支持Azure Document Intelligence'
    };
  }

  /**
   * 检查服务可用性
   */
  async checkServiceHealth() {
    try {
      const azureStatus = azureOcrService.getStatus();
      
      return {
        success: true,
        azure: {
          available: azureStatus.isConfigured,
          status: azureStatus.isConfigured ? 'ready' : 'not_configured'
        },
        python: {
          available: false,
          status: 'removed'
        },
        overall: azureStatus.isConfigured ? 'healthy' : 'azure_not_configured'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        overall: 'error'
      };
    }
  }
}

// 导出服务实例
const serviceInstance = new OCRService();

module.exports = serviceInstance;

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Azure智能文档服务 (Form Recognizer)
 * 提供高精度的发票识别能力
 */
class AzureOCRService {
  constructor() {
    // Azure Form Recognizer配置
    this.endpoint = process.env.AZURE_FORM_RECOGNIZER_ENDPOINT;
    this.apiKey = process.env.AZURE_FORM_RECOGNIZER_KEY;
    this.apiVersion = process.env.AZURE_API_VERSION || '2022-08-31';
    this.customModelId = process.env.AZURE_CUSTOM_MODEL_ID;
    this.useDocumentIntelligence = process.env.AZURE_USE_DOCUMENT_INTELLIGENCE === 'true';

    // 检查配置
    this.isConfigured = !!(this.endpoint && this.apiKey);

    if (!this.isConfigured) {
      console.log('Azure OCR服务: 未配置Azure凭据，将使用模拟模式');
    } else {
      const apiType = this.useDocumentIntelligence ? 'Document Intelligence' : 'Form Recognizer';
      console.log(`Azure OCR服务: 已配置，使用Azure ${apiType}`);
      if (this.customModelId) {
        console.log(`Azure OCR服务: 使用自定义训练模型 ${this.customModelId} (纯自定义字段识别)`);
        console.log(`Azure OCR服务: 只使用5个自定义字段 - company, number, date, amount, name`);
        console.log(`Azure OCR服务: 不使用原始文本解析，识别不到的字段返回空值`);
      } else {
        console.log('Azure OCR服务: 使用预构建发票模型');
      }
      console.log(`Azure OCR服务: API版本 ${this.apiVersion}`);
    }
  }

  /**
   * 识别发票多字段信息
   */
  async recognizeInvoiceMultiField(imagePath) {
    if (!this.isConfigured) {
      throw new Error('Azure Form Recognizer未配置，请设置AZURE_FORM_RECOGNIZER_ENDPOINT和AZURE_FORM_RECOGNIZER_KEY环境变量');
    }

    try {
      console.log(`Azure OCR: 开始识别发票 ${imagePath}`);

      // 第一步：提交文档进行分析
      // 如果有自定义模型，使用自定义模型；否则使用预构建发票模型
      const modelId = this.customModelId || 'prebuilt-invoice';

      // 根据配置选择API路径
      const apiPath = this.useDocumentIntelligence ? 'documentintelligence' : 'formrecognizer';
      const analyzeUrl = `${this.endpoint}${apiPath}/documentModels/${modelId}:analyze?${this.useDocumentIntelligence ? '_overload=analyzeDocument&' : ''}api-version=${this.apiVersion}`;

      console.log(`Azure OCR: 使用模型 ${modelId}，API版本 ${this.apiVersion}`);
      console.log(`Azure OCR: API路径 ${apiPath}`);

      const fileBuffer = fs.readFileSync(imagePath);

      const analyzeResponse = await axios.post(analyzeUrl, fileBuffer, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'application/octet-stream'
        },
        timeout: 30000 // 30秒超时
      });
      
      // 获取操作位置
      const operationLocation = analyzeResponse.headers['operation-location'];
      if (!operationLocation) {
        throw new Error('未获取到操作位置');
      }
      
      console.log('Azure OCR: 文档已提交，等待分析完成...');
      
      // 第二步：轮询获取结果
      const result = await this.pollForResult(operationLocation);
      
      // 第三步：解析结果
      return this.parseInvoiceResult(result);
      
    } catch (error) {
      console.error('Azure OCR识别失败:', error.message);
      
      // 如果Azure服务失败，返回错误信息但不崩溃
      return {
        success: false,
        error: `Azure OCR识别失败: ${error.message}`,
        mode: 'azure_error',
        invoice_number: { value: '', confidence: 0 },
        amount: { value: 0, confidence: 0 },
        invoice_date: { value: '', confidence: 0 },
        buyer_name: { value: '', confidence: 0 },
        service_name: { value: '', confidence: 0 },
        overall_confidence: 0
      };
    }
  }

  /**
   * 轮询获取分析结果
   */
  async pollForResult(operationLocation, maxAttempts = 30) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(operationLocation, {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey
          },
          timeout: 10000
        });
        
        const status = response.data.status;
        console.log(`Azure OCR: 分析状态 ${status} (${attempt + 1}/${maxAttempts})`);
        
        if (status === 'succeeded') {
          return response.data.analyzeResult;
        } else if (status === 'failed') {
          throw new Error('Azure分析失败');
        }
        
        // 等待2秒后重试
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error('Azure分析超时');
  }

  /**
   * 解析Azure Form Recognizer的发票结果
   */
  parseInvoiceResult(analyzeResult) {
    try {
      const documents = analyzeResult.documents || [];
      if (documents.length === 0) {
        throw new Error('未识别到发票文档');
      }
      
      const invoice = documents[0];
      const fields = invoice.fields || {};

      // 调试：输出所有识别到的字段
      console.log('Azure OCR: 识别到的所有字段:');
      Object.keys(fields).forEach(key => {
        const field = fields[key];
        console.log(`  ${key}:`, {
          type: field.type,
          value: field.valueString || field.valueNumber || field.valueDate || field.content,
          confidence: field.confidence
        });
      });

      // 提取关键字段 - 只使用自定义模型的5个字段
      const result = {
        success: true,
        mode: 'azure_production',
        invoice_number: this.extractInvoiceNumberField(fields.number),
        amount: this.extractTotalAmountField(fields, analyzeResult),
        invoice_date: this.extractDateField(fields.date),
        buyer_name: this.extractField(fields.company),
        service_name: this.extractServiceField(fields.name),
        overall_confidence: invoice.confidence || 0.9
      };
      
      console.log('Azure OCR: 识别完成', {
        invoice_number: result.invoice_number.value,
        amount: result.amount.value,
        invoice_date: result.invoice_date.value,
        buyer_name: result.buyer_name.value,
        service_name: result.service_name.value,
        confidence: result.overall_confidence
      });
      
      return result;
      
    } catch (error) {
      console.error('Azure结果解析失败:', error.message);
      throw new Error(`Azure结果解析失败: ${error.message}`);
    }
  }

  /**
   * 提取字段值和置信度
   */
  extractField(field) {
    if (!field) {
      return { value: '', confidence: 0 };
    }

    // 尝试多种可能的值字段
    let value = '';
    if (field.valueString !== undefined) {
      value = field.valueString;
    } else if (field.content !== undefined) {
      value = field.content;
    } else if (field.value !== undefined) {
      value = field.value;
    }

    // 如果值是undefined，转换为空字符串
    if (value === undefined || value === null) {
      value = '';
    }

    return {
      value: String(value || ''),
      confidence: field.confidence || 0
    };
  }

  /**
   * 提取发票号字段 - 清理多余的冒号和特殊字符
   */
  extractInvoiceNumberField(field) {
    const baseResult = this.extractField(field);

    if (baseResult.value) {
      // 清理发票号：移除开头/结尾的冒号、空格等特殊字符
      let cleanedValue = String(baseResult.value).trim();
      cleanedValue = cleanedValue.replace(/^[:：\s]+/, '');
      cleanedValue = cleanedValue.replace(/[:：\s]+$/, '');

      // 业务规范：仅保留后8位数字或字母
      const alphanumeric = cleanedValue.replace(/[^a-zA-Z0-9]/g, '');
      const normalized = alphanumeric.length <= 8 ? alphanumeric : alphanumeric.slice(-8);

      return {
        value: normalized,
        confidence: baseResult.confidence
      };
    }

    return baseResult;
  }

  /**
   * 提取含税总金额 - 只使用自定义模型的amount字段
   */
  extractTotalAmountField(fields, analyzeResult) {
    console.log('Azure OCR: 提取自定义模型amount字段');
    console.log('Azure OCR: amount字段详情:', fields.amount);

    // 只使用自定义模型的amount字段
    if (fields.amount) {
      const customAmount = this.extractAmountField(fields.amount);
      console.log('Azure OCR: 自定义amount字段结果:', customAmount);
      return customAmount;
    }

    console.log('Azure OCR: 自定义amount字段不存在，返回空值');
    return { value: 0, confidence: 0 };
  }

  /**
   * 提取金额字段 - 优化版，支持多种金额格式，避免精度损失
   */
  extractAmountField(field) {
    if (!field) {
      return { value: 0, confidence: 0 };
    }

    let amount = 0;
    let confidence = field.confidence || 0;

    console.log('Azure OCR: 提取金额字段:', {
      valueNumber: field.valueNumber,
      valueString: field.valueString,
      content: field.content
    });

    // 优先使用valueNumber，通常最准确
    if (field.valueNumber !== undefined && field.valueNumber > 0) {
      amount = field.valueNumber;
      console.log('Azure OCR: 使用valueNumber:', amount);
    }
    // 其次使用valueString
    else if (field.valueString) {
      const valueStr = field.valueString.trim();
      console.log('Azure OCR: 解析valueString:', valueStr);

      // 处理货币符号格式：¥63223.68, ¥59644. 98 (注意空格), ￥63223.68, 63223.68
      const currencyMatch = valueStr.match(/[¥￥]?\s*([\d,]+\.?\s*\d*)/);
      if (currencyMatch) {
        const numStr = currencyMatch[1].replace(/[,\s]/g, ''); // 移除逗号和空格
        amount = parseFloat(numStr);
        console.log('Azure OCR: 货币格式解析结果:', amount);
      }
      // 处理中文大写金额：柒佰叁拾肆圆整
      else if (valueStr.includes('圆') || valueStr.includes('元')) {
        console.log('Azure OCR: 检测到中文大写金额，跳过:', valueStr);
        amount = 0; // 让系统使用其他字段
      }
    }
    // 最后尝试content字段
    else if (field.content) {
      const contentStr = field.content.trim();
      console.log('Azure OCR: 解析content:', contentStr);

      const contentMatch = contentStr.match(/[¥￥]?\s*([\d,]+\.?\s*\d*)/);
      if (contentMatch) {
        const numStr = contentMatch[1].replace(/[,\s]/g, ''); // 移除逗号和空格
        amount = parseFloat(numStr);
        console.log('Azure OCR: content格式解析结果:', amount);
      }
    }

    // 确保金额精度正确（避免浮点数精度问题）
    if (amount > 0) {
      amount = Math.round(amount * 100) / 100;
    }

    console.log('Azure OCR: 最终金额:', amount, '置信度:', confidence);

    return {
      value: amount,
      confidence: confidence
    };
  }

  /**
   * 提取日期字段
   */
  extractDateField(field) {
    if (!field) {
      return { value: '', confidence: 0 };
    }
    
    let dateStr = '';
    if (field.valueDate) {
      dateStr = field.valueDate;
    } else if (field.valueString) {
      dateStr = field.valueString;
    }
    
    // 尝试格式化日期为YYYY-MM-DD
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        dateStr = date.toISOString().split('T')[0];
      }
    } catch (e) {
      // 保持原始字符串
    }
    
    return {
      value: dateStr,
      confidence: field.confidence || 0
    };
  }

  /**
   * 提取服务项目字段 - 只使用自定义模型的name字段
   */
  extractServiceField(nameField) {
    console.log('Azure OCR: name字段详情:', nameField);

    // 只处理自定义模型的name字段
    if (nameField) {
      const value = nameField.value || nameField.valueString || '';
      return {
        value: String(value).replace(/\n/g, ' ').trim(),
        confidence: nameField.confidence || 0
      };
    }

    console.log('Azure OCR: 自定义name字段不存在，返回空值');
    return { value: '', confidence: 0 };
  }



  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      isEnabled: this.isConfigured,
      isConfigured: this.isConfigured,
      mode: 'azure_production',
      service: 'Azure Form Recognizer',
      endpoint: this.isConfigured ? this.endpoint : null,
      apiVersion: this.apiVersion
    };
  }
}

module.exports = new AzureOCRService();

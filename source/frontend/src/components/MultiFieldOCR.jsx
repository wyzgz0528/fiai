import React, { useState } from 'react';
import { 
  Card, 
  Upload, 
  Button, 
  Spin, 
  Form, 
  Input, 
  InputNumber, 
  DatePicker, 
  message, 
  Row, 
  Col, 
  Typography, 
  Tag,
  Space,
  Divider
} from 'antd';
import { 
  UploadOutlined, 
  ScanOutlined, 
  CheckCircleOutlined, 
  ExclamationCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined
} from '@ant-design/icons';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

/**
 * 多字段OCR识别组件
 * 支持识别发票的多个字段：发票号、金额、日期、公司名、服务名
 */
const MultiFieldOCR = ({ 
  onRecognitionComplete, 
  initialData = {}, 
  disabled = false,
  showTitle = true 
}) => {
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [formKey, setFormKey] = useState(0); // 用于强制重新渲染表单
  const [form] = Form.useForm();

  // 受控表单字段状态
  const [formValues, setFormValues] = useState({
    invoice_number: '',
    amount: null,
    invoice_date: null,
    buyer_name: '',
    service_name: ''
  });

  // 初始化表单数据
  React.useEffect(() => {
    if (initialData) {
      const initialFormData = {
        invoice_number: initialData.invoice_number || '',
        amount: initialData.amount || null,
        invoice_date: initialData.invoice_date ? dayjs(initialData.invoice_date) : null,
        buyer_name: initialData.buyer_name || '',
        service_name: initialData.service_name || ''
      };

      form.setFieldsValue(initialFormData);
      setFormValues(initialFormData);
    }
  }, [initialData, form]);

  // 监听formValues变化，强制更新表单
  React.useEffect(() => {
    console.log('🔄 formValues变化:', formValues);
    form.setFieldsValue(formValues);
  }, [formValues, form]);

  // 文件上传处理
  const handleFileUpload = async (file) => {
    if (disabled) return false;

    const isValidType = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!isValidType) {
      message.error('只支持图片和PDF文件');
      return false;
    }

    const isValidSize = file.size / 1024 / 1024 < 10; // 10MB
    if (!isValidSize) {
      message.error('文件大小不能超过10MB');
      return false;
    }

    setUploadedFile({
      name: file.name,
      type: file.type,
      size: file.size,
      file: file
    });

    message.success(`${file.name} 上传成功，点击"开始识别"进行OCR识别`);
    return false; // 阻止默认上传
  };

  // 执行多字段OCR识别
  const handleMultiFieldRecognition = async () => {
    if (!uploadedFile) {
      message.warning('请先上传发票文件（支持图片和PDF格式）');
      return;
    }

    setLoading(true);
    try {
      // 先上传临时文件
      const formData = new FormData();
      formData.append('file', uploadedFile.file);
      
      const uploadResponse = await api.post('/api/upload/upload-temp', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadResponse.data.success) {
        throw new Error('文件上传失败');
      }

      const tempId = uploadResponse.data.id;

      // 调用多字段OCR识别
      const ocrResponse = await api.post('/api/ocr/recognize-temp-multifield', {
        temp_id: tempId
      });

      if (!ocrResponse.data.success) {
        throw new Error(ocrResponse.data.message || '多字段识别失败');
      }

      const result = ocrResponse.data.data;
      console.log('🔍 OCR识别结果:', result);
      setRecognitionResult(result);

      // 更新表单字段 - 修复版本
      const formFieldData = {
        invoice_number: result.invoice_number?.value || '',
        amount: result.amount?.value || 0,
        invoice_date: result.invoice_date?.value ? dayjs(result.invoice_date.value) : null,
        buyer_name: result.buyer_name?.value || '',
        service_name: result.service_name?.value || ''
      };

      // 特殊处理：如果dayjs转换失败，使用字符串
      if (result.invoice_date?.value && !formFieldData.invoice_date) {
        console.warn('dayjs转换失败，使用原始日期字符串:', result.invoice_date.value);
        formFieldData.invoice_date = result.invoice_date.value;
      }

      console.log('📝 表单字段数据:', formFieldData);

      // 🎯 新方案：同时更新Form和受控状态
      try {
        // 更新受控状态
        setFormValues(formFieldData);
        console.log('✅ 受控状态已更新');

        // 更新Form状态
        form.setFieldsValue(formFieldData);
        console.log('✅ Form状态已更新');

        // 强制重新渲染
        setFormKey(prev => prev + 1);
        console.log('✅ 强制重新渲染完成');

        // 手动触发onChange事件
        setTimeout(() => {
          console.log('🔧 手动触发onChange事件');

          // 手动调用onChange处理器
          if (formFieldData.invoice_number) {
            setFormValues(prev => ({...prev, invoice_number: formFieldData.invoice_number}));
          }
          if (formFieldData.amount) {
            setFormValues(prev => ({...prev, amount: formFieldData.amount}));
          }
          if (formFieldData.buyer_name) {
            setFormValues(prev => ({...prev, buyer_name: formFieldData.buyer_name}));
          }
          if (formFieldData.service_name) {
            setFormValues(prev => ({...prev, service_name: formFieldData.service_name}));
          }
          if (formFieldData.invoice_date) {
            setFormValues(prev => ({...prev, invoice_date: formFieldData.invoice_date}));
          }

          console.log('✅ 手动onChange完成');
        }, 200);

      } catch (error) {
        console.error('❌ 表单设置失败:', error);
      }

      // 验证表单字段是否真的被设置了
      setTimeout(() => {
        const currentValues = form.getFieldsValue();
        console.log('🔍 当前表单值:', currentValues);

        // 检查每个字段是否有值
        Object.keys(formFieldData).forEach(key => {
          const expectedValue = formFieldData[key];
          const actualValue = currentValues[key];
          console.log(`字段 ${key}: 期望=${expectedValue}, 实际=${actualValue}, 匹配=${expectedValue === actualValue}`);
        });
      }, 100);

      // 通知父组件识别完成
      if (onRecognitionComplete) {
        onRecognitionComplete({
          ...result,
          formData: {
            ...formFieldData,
            invoice_date: result.invoice_date?.value || null // 保持原始字符串格式
          }
        });
      }

      message.success(`多字段识别完成！发票号: ${result.invoice_number?.value}, 金额: ${result.amount?.value}元`);

    } catch (error) {
      console.error('多字段OCR识别失败:', error);
      message.error(error.message || '多字段识别失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 获取置信度颜色
  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'green';
    if (confidence >= 0.6) return 'orange';
    return 'red';
  };

  // 获取置信度标签
  const getConfidenceTag = (field) => {
    if (!recognitionResult || !field) return null;
    
    const confidence = field.confidence;
    if (confidence == null) return null;

    return (
      <Tag color={getConfidenceColor(confidence)} size="small">
        {(confidence * 100).toFixed(1)}%
      </Tag>
    );
  };

  return (
    <Card 
      title={showTitle ? (
        <Space>
          <ScanOutlined />
          多字段OCR识别
        </Space>
      ) : null}
      size="small"
    >
      {/* 文件上传区域 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Upload
            beforeUpload={handleFileUpload}
            showUploadList={false}
            accept="image/*,application/pdf"
            disabled={disabled}
          >
            <Button 
              icon={<UploadOutlined />} 
              disabled={disabled}
              block
            >
              上传发票图片/PDF
            </Button>
          </Upload>
        </Col>
        <Col span={12}>
          <Button
            type="primary"
            icon={<ScanOutlined />}
            onClick={handleMultiFieldRecognition}
            loading={loading}
            disabled={!uploadedFile || disabled}
            block
          >
            {loading ? '识别中...' : '开始识别'}
          </Button>
        </Col>
      </Row>

      {/* 上传文件信息 */}
      {uploadedFile && (
        <div style={{ marginBottom: 16, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
          <Space>
            {uploadedFile.type.startsWith('image/') ? <FileImageOutlined /> : <FilePdfOutlined />}
            <Text strong>{uploadedFile.name}</Text>
            <Text type="secondary">({(uploadedFile.size / 1024).toFixed(1)}KB)</Text>
          </Space>
        </div>
      )}

      {/* 识别结果表单 */}
      <Form
        key={formKey}
        form={form}
        layout="vertical"
        disabled={disabled}
        initialValues={formValues}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item 
              label={
                <Space>
                  发票号码
                  {getConfidenceTag(recognitionResult?.invoice_number)}
                </Space>
              }
              name="invoice_number"
            >
              <Input
                placeholder="发票号码"
                onChange={(e) => setFormValues(prev => ({...prev, invoice_number: e.target.value}))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item 
              label={
                <Space>
                  金额(含税)
                  {getConfidenceTag(recognitionResult?.amount)}
                </Space>
              }
              name="amount"
            >
              <InputNumber
                placeholder="金额"
                style={{ width: '100%' }}
                min={0}
                precision={2}
                addonAfter="元"
                onChange={(value) => setFormValues(prev => ({...prev, amount: value}))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item 
              label={
                <Space>
                  开票日期
                  {getConfidenceTag(recognitionResult?.invoice_date)}
                </Space>
              }
              name="invoice_date"
            >
              <DatePicker
                placeholder="开票日期"
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                onChange={(date) => setFormValues(prev => ({...prev, invoice_date: date}))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item 
              label={
                <Space>
                  购买方名称
                  {getConfidenceTag(recognitionResult?.buyer_name)}
                </Space>
              }
              name="buyer_name"
            >
              <Input
                placeholder="购买方名称"
                onChange={(e) => setFormValues(prev => ({...prev, buyer_name: e.target.value}))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item 
          label={
            <Space>
              服务名称/商品名称
              {getConfidenceTag(recognitionResult?.service_name)}
            </Space>
          }
          name="service_name"
        >
          <TextArea
            placeholder="服务名称或商品名称"
            rows={2}
            onChange={(e) => setFormValues(prev => ({...prev, service_name: e.target.value}))}
          />
        </Form.Item>
      </Form>

      {/* 识别结果统计 */}
      {recognitionResult && (
        <>
          <Divider />
          <div style={{ textAlign: 'center' }}>
            <Space>
              <CheckCircleOutlined style={{ color: 'green' }} />
              <Text type="secondary">
                整体置信度: {(recognitionResult.overall_confidence * 100).toFixed(1)}%
              </Text>
              <Text type="secondary">
                识别模式: {recognitionResult.mode === 'production' ? '生产模式' : '模拟模式'}
              </Text>
            </Space>
          </div>

          {/* 调试信息 */}
          <div style={{ marginTop: 16, padding: 12, background: '#f0f0f0', borderRadius: 4 }}>
            <Text strong>🔍 调试信息:</Text>
            <div style={{ marginTop: 8, fontSize: '12px' }}>
              <div>发票号: {recognitionResult.invoice_number?.value || '无'}</div>
              <div>金额: {recognitionResult.amount?.value || '无'}元</div>
              <div>日期: {recognitionResult.invoice_date?.value || '无'}</div>
              <div>购买方: {recognitionResult.buyer_name?.value || '无'}</div>
              <div>服务名: {recognitionResult.service_name?.value || '无'}</div>
            </div>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              <div>表单状态: invoice_number={formValues.invoice_number}, amount={formValues.amount}</div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

export default MultiFieldOCR;

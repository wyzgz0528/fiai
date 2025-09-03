import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { 
  Card, 
  Form, 
  Input, 
  InputNumber, 
  Select, 
  Button, 
  Table, 
  Upload, 
  Space, 
  Typography, 
  message, 
  Row, 
  Col,
  Statistic,
  Divider,
  Tag,
  Modal
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  InboxOutlined,
  SaveOutlined,
  SendOutlined,
  ArrowLeftOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  UploadOutlined,
  SearchOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// 报销类型可选项
// 旧的静态选项作为回退
const fallbackTypeOptions = [
  { value: '差旅费', label: '差旅费' },
  { value: '办公用品采购', label: '办公用品采购' },
  { value: '交通费', label: '交通费' },
  { value: '其他', label: '其他' },
];

function ReimbursementForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  
  // 明细数据状态
  const [items, setItems] = useState([
    { key: Date.now(), amount: '', purpose: '', type: '', remark: '', uploaded: [], invoice_number: '' }
  ]);
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [dynamicTypes, setDynamicTypes] = useState(fallbackTypeOptions);
  const [formStatus, setFormStatus] = useState(''); // 新增：当前报销单状态
  const [ocrLoading, setOcrLoading] = useState({}); // OCR识别加载状态

  // 预览相关状态
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  // 计算总金额
  const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  useEffect(() => {
    if (id) {
      setIsEdit(true);
      // 新增：加载已有报销单明细
      (async () => {
        try {
          const resp = await api.get(`/api/reimbursement/reimbursement-forms/${id}`);
          const data = resp.data;
          setFormStatus(data.status_zh || data.status || '');

          // 将 records 映射为编辑 items，并为每个记录加载其关联的凭证
          const mapped = await Promise.all((data.records || []).map(async (r) => {
            // 为每个记录单独加载其关联的凭证
            let recordVouchers = [];
            try {
              const recordVouchersResp = await api.get(`/api/reimbursement/reimbursement-records/${r.id}/vouchers`);
              recordVouchers = recordVouchersResp.data || [];
            } catch (e) {
              console.warn(`加载记录${r.id}的凭证失败:`, e);
            }

            return {
              key: `exist-${r.id}`,
              id: r.id,
              amount: r.amount,
              purpose: r.purpose,
              type: r.type,
              remark: r.remark,
              uploaded: [], // 新增附件列表（仅新增的临时附件）
              existingVouchers: recordVouchers, // 该记录关联的凭证列表
              existingVoucherCount: recordVouchers.length,
              invoice_number: r.invoice_number || '', // 发票号
              invoice_date: r.invoice_date || '', // 发票日期
              buyer_name: r.buyer_name || '', // 购买方
              service_name: r.service_name || '' // 服务名称
            };
          }));
            if (mapped.length) setItems(mapped);
        } catch (e) {
          message.error(e?.response?.data?.msg || '加载报销单失败');
        }
      })();
    }
  }, [id]);

  // 拉取启用中的报销类型
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await api.get('/api/reimbursement/expense-types');
        if (mounted && Array.isArray(resp.data) && resp.data.length) {
          setDynamicTypes(resp.data.map(r => ({ value: r.name, label: r.name })));
        }
      } catch (e) {
        // 失败保持回退，不打断流程
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 明细字段变更
  const handleItemChange = (key, field, value) => {
    setItems(prev => prev.map(item => 
      item.key === key ? { ...item, [field]: value } : item
    ));
  };

  // 添加明细行
  const handleAddItem = () => {
    const newItem = {
      key: Date.now(),
      amount: '',
      purpose: '',
      type: '',
      remark: '',
      uploaded: [],
      invoice_number: '',
      invoice_date: '',
      buyer_name: '',
      service_name: ''
    };
    setItems(prev => [...prev, newItem]);
  };

  // 删除明细行
  const handleRemoveItem = (key) => {
    if (items.length === 1) {
      message.warning('至少保留一条明细记录');
      return;
    }
    setItems(prev => prev.filter(item => item.key !== key));
  };

  // 文件上传处理
  const handleFileUpload = async (key, file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await api.post('/api/upload/upload-temp', formData, {
        headers: { 
          'Content-Type': 'multipart/form-data' 
        }
      });
      
      const fileInfo = {
        temp_id: response.data.id,
        url: `/api/upload/temp-attachments/${response.data.id}`,
  name: file.name,
  uid: file.uid,
  mime: file.type
      };

      setItems(prev => prev.map(item => 
        item.key === key 
          ? { ...item, uploaded: [...(item.uploaded || []), fileInfo] }
          : item
      ));
      
      message.success(`${file.name} 上传成功`);

      // 自动触发OCR（仅首个或刚上传的支持类型文件）
      const isOCRCapable = /image\//.test(file.type) || file.type === 'application/pdf';
      if (isOCRCapable) {
        // 延迟足够时间，确保状态更新完成
        setTimeout(() => handleOCRRecognition(key, { auto: true }), 500);
      }
      return false; // 阻止默认上传行为
    } catch (error) {
      message.error(`${file.name} 上传失败`);
      return false;
    }
  };

  // 删除已上传文件
  const handleRemoveFile = (itemKey, fileIndex) => {
    setItems(prev => prev.map(item =>
      item.key === itemKey
        ? { ...item, uploaded: item.uploaded.filter((_, index) => index !== fileIndex) }
        : item
    ));
  };

  // 预览文件
  const handlePreviewFile = (file) => {
    if (file.temp_id) {
      // 对于临时上传的文件，使用临时文件下载API作为预览
      const previewUrl = `/api/upload/temp-attachments/${file.temp_id}`;
      setPreviewFile(file);
      setPreviewUrl(previewUrl);
      setPreviewVisible(true);
    } else {
      message.error('无法预览该文件');
    }
  };

  // 关闭预览
  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewFile(null);
    setPreviewUrl('');
  };

  // 删除现有凭证（从记录-凭证关联中删除，而不是删除凭证文件）
  const handleDeleteExistingVoucher = async (key, voucherId) => {
    try {
      // 找到对应的记录ID
      const item = items.find(i => i.key === key);
      if (!item || !item.id) {
        message.error('无法找到对应的记录');
        return;
      }

      // 删除记录-凭证关联，而不是删除凭证文件
      await api.delete(`/api/reimbursement/reimbursement-records/${item.id}/vouchers/${voucherId}`);

      // 从状态中移除该凭证
      setItems(prev => prev.map(prevItem =>
        prevItem.key === key
          ? {
              ...prevItem,
              existingVouchers: prevItem.existingVouchers.filter(v => v.id !== voucherId),
              existingVoucherCount: Math.max(0, (prevItem.existingVoucherCount || 0) - 1)
            }
          : prevItem
      ));

      message.success('凭证关联已移除');
    } catch (error) {
      message.error('移除凭证关联失败');
    }
  };

  // 处理发票号，只保留后面的8位数字或字母
  const processInvoiceNumber = (invoiceNumber) => {
    if (!invoiceNumber || typeof invoiceNumber !== 'string') {
      return '';
    }

    // 提取所有数字和字母（移除特殊字符、空格等）
    const alphanumeric = invoiceNumber.replace(/[^a-zA-Z0-9]/g, '');

    // 如果没有数字或字母，返回空字符串
    if (!alphanumeric) {
      return '';
    }

    // 如果字符少于8位，返回所有字符
    if (alphanumeric.length <= 8) {
      return alphanumeric;
    }

    // 返回后8位字符
    return alphanumeric.slice(-8);
  };

  // 发票号变更处理
  const handleInvoiceNumberChange = async (key, value) => {
    // 处理发票号，只保留后8位数字
    const processedValue = processInvoiceNumber(value);

    // 更新发票号
    setItems(prev => prev.map(item =>
      item.key === key ? { ...item, invoice_number: processedValue } : item
    ));

    // 如果发票号不为空，进行实时查重验证
    if (processedValue && processedValue.trim()) {
      try {
        const response = await api.get(`/api/reimbursement/check-duplicate?invoice_number=${encodeURIComponent(processedValue.trim())}`);
        if (response.data.isDuplicate) {
          message.warning(`发票号 "${processedValue}" 已存在，请检查是否重复录入`);
        }
      } catch (error) {
        console.error('发票号查重失败:', error);
        // 不阻断用户输入，仅在控制台记录错误
      }
    }
  };

  // OCR多字段识别发票信息
  const handleOCRRecognition = async (itemKey, opts = {}) => {
    const item = items.find(i => i.key === itemKey);

    // 调试信息
    console.log('OCR识别检查:', {
      itemKey,
      item: item ? { key: item.key, uploadedCount: item.uploaded?.length || 0 } : null,
      opts
    });

    if (!item || !item.uploaded || item.uploaded.length === 0) {
      // 只在非自动模式下显示警告
      if (!opts.auto) {
        message.warning('请先上传发票文件（支持图片和PDF格式）');
      }
      return;
    }

    setOcrLoading(prev => ({ ...prev, [itemKey]: true }));

    try {
      // 使用第一张上传的图片进行多字段OCR识别
      const firstFile = item.uploaded[0];

      if (firstFile.temp_id) {
        console.log('发送多字段OCR识别请求，temp_id:', firstFile.temp_id, '文件信息:', firstFile);

        // 使用多字段OCR接口
        const response = await api.post('/api/ocr/recognize-temp-multifield', {
          temp_id: firstFile.temp_id
        });

        const result = response.data || {};
        console.log('多字段OCR识别响应:', result);

        // 获取OCR数据（可能在result.data中）
        const ocrData = result.data || result;

        // 数据清理函数
        const cleanOCRValue = (value, type = 'text') => {
          if (!value) return value;
          let cleaned = String(value).trim();

          if (type === 'invoice_number') {
            // 清理发票号：移除开头的冒号、空格等特殊字符
            cleaned = cleaned.replace(/^[:：\s]+/, '');
            // 移除结尾的特殊字符
            cleaned = cleaned.replace(/[:：\s]+$/, '');
          } else if (type === 'amount') {
            // 清理金额：移除非数字字符（保留小数点）
            cleaned = cleaned.replace(/[^\d.]/g, '');
            // 转换为数字
            const num = parseFloat(cleaned);
            return isNaN(num) ? value : num;
          } else if (type === 'date') {
            // 清理日期：标准化格式
            cleaned = cleaned.replace(/[年月]/g, '-').replace(/[日]/g, '');
          }

          return cleaned;
        };

        if (ocrData.invoice_number || ocrData.amount || ocrData.invoice_date) {
          // 更新表单字段
          const updates = {};

          // 发票号（清理多余字符）
          if (ocrData.invoice_number?.value) {
            const cleanedInvoiceNumber = cleanOCRValue(ocrData.invoice_number.value, 'invoice_number');
            updates.invoice_number = cleanedInvoiceNumber;
            await handleInvoiceNumberChange(itemKey, cleanedInvoiceNumber);
          }

          // 金额（清理并转换为数字）
          if (ocrData.amount?.value) {
            const cleanedAmount = cleanOCRValue(ocrData.amount.value, 'amount');
            updates.amount = cleanedAmount;
          }

          // 用途字段保持手动填写，不自动填充

          // 发票日期（清理格式）
          if (ocrData.invoice_date?.value) {
            const cleanedDate = cleanOCRValue(ocrData.invoice_date.value, 'date');
            updates.invoice_date = cleanedDate;
          }

          // 购买方名称
          if (ocrData.buyer_name?.value) {
            const cleanedBuyerName = cleanOCRValue(ocrData.buyer_name.value);
            updates.buyer_name = cleanedBuyerName;
          }

          // 服务名称
          if (ocrData.service_name?.value) {
            const cleanedServiceName = cleanOCRValue(ocrData.service_name.value);
            updates.service_name = cleanedServiceName;
          }

          // 批量更新明细项
          if (Object.keys(updates).length > 0) {
            setItems(prev => prev.map(prevItem =>
              prevItem.key === itemKey
                ? { ...prevItem, ...updates }
                : prevItem
            ));
          }

          // 自动保存OCR结果到数据库的逻辑
          const shouldSaveOCR = (isEdit && item.id) || // 编辑模式且有ID
                               (!isEdit && Object.keys(updates).length > 0); // 新建模式但有识别结果

          if (shouldSaveOCR && Object.keys(updates).length > 0) {
            // 如果是编辑模式且有ID，立即保存
            if (isEdit && item.id) {
              try {
                console.log('立即保存OCR结果到数据库，报销记录ID:', item.id);
                await api.post('/api/ocr/save-invoice-info', {
                  reimbursementId: item.id,
                  ocrResult: {
                    invoice_number: ocrData.invoice_number,
                    amount: ocrData.amount,
                    invoice_date: ocrData.invoice_date,
                    buyer_name: ocrData.buyer_name,
                    service_name: ocrData.service_name,
                    overall_confidence: ocrData.overall_confidence || 0.8
                  },
                  mode: 'auto_recognition'
                });
                console.log('OCR结果已立即保存到数据库');
              } catch (saveError) {
                console.error('立即保存OCR结果失败:', saveError);
              }
            } else {
              // 新建模式：存储OCR结果，等待报销单保存后再保存到数据库
              console.log('新建模式：存储OCR结果待后续保存', {
                itemKey: itemKey,
                ocrData: {
                  invoice_number: ocrData.invoice_number?.value,
                  amount: ocrData.amount?.value,
                  invoice_date: ocrData.invoice_date?.value,
                  buyer_name: ocrData.buyer_name?.value,
                  service_name: ocrData.service_name?.value
                }
              });

              // 将OCR结果存储到item中，等待报销单保存后处理
              setItems(prev => prev.map(prevItem =>
                prevItem.key === itemKey
                  ? {
                      ...prevItem,
                      pendingOcrResult: {
                        invoice_number: ocrData.invoice_number,
                        amount: ocrData.amount,
                        invoice_date: ocrData.invoice_date,
                        buyer_name: ocrData.buyer_name,
                        service_name: ocrData.service_name,
                        overall_confidence: ocrData.overall_confidence || 0.8
                      }
                    }
                  : prevItem
              ));
            }
          }

          // 显示识别结果
          const recognizedFields = [];
          if (ocrData.invoice_number?.value) recognizedFields.push(`发票号: ${ocrData.invoice_number.value}`);
          if (ocrData.amount?.value) recognizedFields.push(`金额: ¥${ocrData.amount.value}`);
          if (ocrData.invoice_date?.value) recognizedFields.push(`日期: ${ocrData.invoice_date.value}`);
          if (ocrData.buyer_name?.value) recognizedFields.push(`购买方: ${ocrData.buyer_name.value}`);
          if (ocrData.service_name?.value) recognizedFields.push(`服务: ${ocrData.service_name.value}`);

          message.success(`${opts.auto ? '自动' : ''}识别成功！${recognizedFields.join(', ')}`);
        } else {
          if (!opts.auto) message.warning('未能识别到发票信息，请手动输入');
        }
      } else {
        console.log('文件缺少temp_id:', firstFile);
        message.error('文件格式不支持OCR识别');
      }
    } catch (error) {
      console.error('OCR识别失败:', error);
      if (!opts.auto) message.error(error.response?.data?.msg || 'OCR识别失败，请手动输入');
    } finally {
      setOcrLoading(prev => ({ ...prev, [itemKey]: false }));
    }
  };

  // 提交表单
  const handleSubmit = async (status) => {
    // 验证明细数据
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.amount || !item.purpose || !item.type) {
        message.error(`第${i + 1}条明细：金额、用途和类型必填`);
        return;
      }
      if (Number(item.amount) <= 0) {
        message.error(`第${i + 1}条明细：金额需为正数`);
        return;
      }
    }

    setLoading(true);
    try {
      const details = items.map(item => ({
        id: item.id, // 编辑时可用
        amount: item.amount,
        purpose: item.purpose,
        type: item.type,
        remark: item.remark,
        invoice_number: item.invoice_number, // 发票号
        attachments: item.uploaded || [], // 新增的临时附件
        existingVouchers: item.existingVouchers || [] // 现有凭证（编辑时保留）
      }));

      let response;
      if (isEdit) {
        response = await api.put(`/api/reimbursement/reimbursement-forms/${id}`,
          { items: details, status }
        );
      } else {
        response = await api.post('/api/reimbursement/reimbursement-forms/auto-generate',
          { items: details, status }
        );
      }

      const action = status === '草稿' ? '保存' : '提交';
      message.success(`报销单${action}成功！正在跳转...`);
      const targetId = isEdit ? id : response.data.formId;

      // 处理待保存的OCR结果
      if (!isEdit && response.data.reimbursementIds) {
        console.log('处理新建报销单的待保存OCR结果...');
        const reimbursementIds = response.data.reimbursementIds;

        // 遍历所有有待保存OCR结果的项目
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const reimbursementId = reimbursementIds[i];

          if (item.pendingOcrResult && reimbursementId) {
            try {
              console.log(`保存第${i+1}项的OCR结果到报销记录 ${reimbursementId}`);
              await api.post('/api/ocr/save-invoice-info', {
                reimbursementId: reimbursementId,
                ocrResult: item.pendingOcrResult,
                mode: 'delayed_save'
              });
              console.log(`第${i+1}项OCR结果保存成功`);
            } catch (saveError) {
              console.error(`第${i+1}项OCR结果保存失败:`, saveError);
              // 不影响主流程，只记录错误
            }
          }
        }
      }

      setTimeout(() => {
        navigate(`/reimbursement-forms/${targetId}`);
      }, 800);
    } catch (error) {
      console.error('Submit error:', error);

      // 处理业务错误（如发票号重复）
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        if (errorData.code === 'INVOICE_DUPLICATE') {
          message.error(errorData.message);
        } else {
          message.error(errorData.message || '提交失败，请检查输入信息');
        }
      } else {
        // 处理其他错误
        message.error(error.response?.data?.msg || '操作失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 重新提交审批：调用独立提交接口，将草稿或已驳回状态改为待财务审核
  const handleResubmit = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const resp = await api.post(`/api/reimbursement/reimbursement-forms/${id}/submit`);
      message.success('已重新提交审批！正在跳转...');
      // 更新本地状态，避免再显示按钮
      setFormStatus(resp.data?.status || '待财务审核');
      // 跳转到详情页，与提交申请按钮保持一致的行为
      setTimeout(() => {
        navigate(`/reimbursement-forms/${id}`);
      }, 800);
    } catch (error) {
      console.error('Resubmit error:', error);
      if (error.response?.data?.error === 'FORM_LOCKED') {
        message.error('报销单已被锁定，无法重新提交。如需重新申请，请创建新的报销单。');
      } else {
        message.error(error.response?.data?.msg || '重新提交失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 是否可重新提交
  const isResubmittable = () => {
    const s = (formStatus || '').toLowerCase();
    return ['草稿','已驳回','draft','rejected'].some(k => s.includes(k));
  };



  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <Card>
        {/* 页面标题 */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {isEdit ? `编辑报销单 #${id}` : '新建报销申请'}
            </Title>
            {isEdit && formStatus && <Text type="secondary" style={{ fontSize: 12 }}>当前状态：{formStatus}</Text>}
          </Col>
          <Col>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate(-1)}
            >
              返回
            </Button>
          </Col>
        </Row>

        {/* 报销明细 */}
        <Card
          title="报销明细"
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddItem}
            >
              添加明细
            </Button>
          }
          style={{ marginBottom: 24 }}
        >
          {items.map((item, index) => (
            <Card
              key={item.key}
              size="small"
              title={`明细 ${index + 1}`}
              extra={
                items.length > 1 && (
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveItem(item.key)}
                  >
                    删除
                  </Button>
                )
              }
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                {/* 第一行：金额、用途、类型 */}
                <Col span={6}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                      金额 (¥)
                      <span style={{ color: 'red', marginLeft: 4, fontSize: '12px' }}>必填</span>
                    </label>
                    <InputNumber
                      value={item.amount}
                      onChange={(value) => handleItemChange(item.key, 'amount', value)}
                      min={0.01}
                      step={0.01}
                      precision={2}
                      placeholder="请输入金额"
                      style={{ width: '100%' }}
                    />
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                      用途
                      <span style={{ color: 'red', marginLeft: 4, fontSize: '12px' }}>必填</span>
                    </label>
                    <TextArea
                      value={item.purpose}
                      onChange={(e) => handleItemChange(item.key, 'purpose', e.target.value)}
                      placeholder="请输入报销用途"
                      rows={2}
                      maxLength={200}
                      showCount
                    />
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                      类型
                      <span style={{ color: 'red', marginLeft: 4, fontSize: '12px' }}>必填</span>
                    </label>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="选择类型"
                      value={item.type}
                      onChange={(v) => handleItemChange(item.key, 'type', v)}
                      options={dynamicTypes}
                      showSearch
                      filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
                    />
                  </div>
                </Col>
              </Row>

              <Row gutter={16}>
                {/* 第二行：发票信息 */}
                <Col span={6}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                      发票号
                    </label>
                    <Input
                      value={item.invoice_number}
                      onChange={(e) => handleInvoiceNumberChange(item.key, e.target.value)}
                      placeholder="仅填写后8位数字或字母"
                      maxLength={100}
                    />
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>发票日期</label>
                    <Input
                      value={item.invoice_date}
                      onChange={(e) => handleItemChange(item.key, 'invoice_date', e.target.value)}
                      placeholder="发票日期"
                      maxLength={50}
                    />
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>购买方</label>
                    <Input
                      value={item.buyer_name}
                      onChange={(e) => handleItemChange(item.key, 'buyer_name', e.target.value)}
                      placeholder="购买方名称"
                      maxLength={100}
                    />
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>服务名称</label>
                    <Input
                      value={item.service_name}
                      onChange={(e) => handleItemChange(item.key, 'service_name', e.target.value)}
                      placeholder="服务名称"
                      maxLength={100}
                    />
                  </div>
                </Col>
              </Row>

              <Row gutter={16}>
                {/* 第三行：备注、OCR识别、上传凭证 */}
                <Col span={8}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>备注</label>
                    <Input
                      value={item.remark}
                      onChange={(e) => handleItemChange(item.key, 'remark', e.target.value)}
                      placeholder="备注（可选）"
                      maxLength={100}
                    />
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>OCR识别</label>
                    <Button
                      type="dashed"
                      loading={ocrLoading[item.key]}
                      onClick={() => handleOCRRecognition(item.key)}
                      disabled={!item.uploaded || item.uploaded.length === 0}
                      style={{ width: '100%' }}
                      icon={<SearchOutlined />}
                    >
                      {ocrLoading[item.key] ? '识别中...' : 'OCR识别'}
                    </Button>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>报销凭证</label>

                    {/* 显示现有凭证 */}
                    {item.existingVouchers && item.existingVouchers.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ marginBottom: 4, color: '#555', fontSize: 12 }}>
                          现有凭证：{item.existingVouchers.length} 个
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {item.existingVouchers.map((voucher) => (
                            <div key={voucher.id} style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '4px 8px',
                              background: '#f0f0f0',
                              borderRadius: 4,
                              fontSize: 12
                            }}>
                              <span style={{ marginRight: 8 }}>{voucher.original_name}</span>
                              <Button
                                type="link"
                                size="small"
                                danger
                                onClick={() => handleDeleteExistingVoucher(item.key, voucher.id)}
                                style={{ padding: 0, height: 'auto', fontSize: 12 }}
                              >
                                删除
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <Upload
                      beforeUpload={(file) => handleFileUpload(item.key, file)}
                      showUploadList={false}
                      accept="image/*,application/pdf,.jpg,.jpeg,.png,.pdf"
                    >
                      <Button icon={<UploadOutlined />} style={{ width: '100%' }}>
                        上传新增凭证
                      </Button>
                    </Upload>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                      支持PDF或图片格式，每次只能上传1张
                    </div>
                    {item.uploaded && item.uploaded.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {item.uploaded.map((file, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ flex: 1, fontSize: 12, color: '#666' }}>
                              {file.name}
                            </span>
                            <Button
                              type="link"
                              size="small"
                              onClick={() => handlePreviewFile(file)}
                              style={{ padding: 0, height: 'auto', marginRight: 8 }}
                              title="预览文件"
                            >
                              预览
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              onClick={() => handleOCRRecognition(item.key, { fileIndex: idx })}
                              style={{ padding: 0, height: 'auto', marginRight: 8 }}
                              title="识别时间约10-20秒，请耐心等待"
                            >
                              OCR识别
                            </Button>
                            <Button
                              type="text"
                              size="small"
                              danger
                              onClick={() => handleRemoveFile(item.key, idx)}
                            >
                              删除
                            </Button>
                          </div>
                        ))}
                        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                          💡 点击"OCR识别"可自动提取发票信息（识别时间10-20秒）
                        </div>
                      </div>
                    )}
                  </div>
                </Col>
              </Row>
            </Card>
          ))}
        </Card>

        {/* 总金额统计 */}
        <Card style={{ marginBottom: 24 }}>
          <Row justify="center">
            <Col>
              <Statistic
                title="报销总金额"
                value={totalAmount}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#1890ff', fontSize: 24 }}
              />
            </Col>
          </Row>
        </Card>

        {/* 操作按钮 */}
        <Row justify="center" gutter={16}>
          <Col>
            <Button
              size="large"
              icon={<SaveOutlined />}
              loading={loading}
              onClick={() => handleSubmit('草稿')}
              style={{ width: 120 }}
            >
              保存草稿
            </Button>
          </Col>
          <Col>
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              loading={loading}
              onClick={() => handleSubmit('提交申请')}
              style={{ width: 120 }}
              title="保存修改并提交"
            >
              提交申请
            </Button>
          </Col>
          {isEdit && isResubmittable() && (
            <Col>
              <Button
                type="primary"
                size="large"
                loading={loading}
                onClick={handleResubmit}
                style={{ width: 120 }}
                title="不修改内容，直接重新提交"
              >
                重新提交
              </Button>
            </Col>
          )}
        </Row>
      </Card>

      {/* 文件预览弹窗 */}
      <Modal
        title={
          <div
            style={{ cursor: 'move', userSelect: 'none' }}
            onMouseDown={(e) => {
              const modal = e.target.closest('.ant-modal');
              if (!modal) return;

              const startX = e.clientX;
              const startY = e.clientY;
              const rect = modal.getBoundingClientRect();
              const offsetX = startX - rect.left;
              const offsetY = startY - rect.top;

              const handleMouseMove = (moveEvent) => {
                const newX = moveEvent.clientX - offsetX;
                const newY = moveEvent.clientY - offsetY;
                modal.style.transform = `translate(${newX}px, ${newY}px)`;
                modal.style.transformOrigin = 'top left';
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            📎 预览文件: {previewFile?.name || ''} (可拖拽移动)
          </div>
        }
        open={previewVisible}
        onCancel={handleClosePreview}
        footer={null}
        width={800}
        mask={false}
        style={{ top: 20 }}
      >
        {previewFile && previewUrl && (
          <div style={{ textAlign: 'center' }}>
            {previewFile.mime?.startsWith('image/') ? (
              <img
                src={previewUrl}
                alt={previewFile.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain'
                }}
              />
            ) : previewFile.mime === 'application/pdf' ? (
              <iframe
                src={previewUrl}
                title={previewFile.name}
                style={{
                  width: '100%',
                  height: '70vh',
                  border: 'none'
                }}
              />
            ) : (
              <div style={{ padding: 40, color: '#999' }}>
                <p>无法预览此文件类型</p>
                <p>文件名: {previewFile.name}</p>
                <p>文件类型: {previewFile.mime}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ReimbursementForm;

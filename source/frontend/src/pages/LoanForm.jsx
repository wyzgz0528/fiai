import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Button, Card, message, Spin } from 'antd';
import { DollarOutlined, FileTextOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '../utils/api';
import { useParams, useNavigate } from 'react-router-dom';

const { TextArea } = Input;

export default function LoanForm() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const { id } = useParams();
  const navigate = useNavigate();

  const isEdit = Boolean(id);

  useEffect(()=>{
    if (!isEdit) return;
    (async ()=>{
      setPageLoading(true);
      try {
        // 使用轻量级 API，只获取编辑需要的基本信息
        const res = await api.get(`/api/loans/${id}/basic`);
        const data = res.data;
        form.setFieldsValue({ amount: data.amount, purpose: data.purpose });
      } catch (error) {
        message.error('加载借款失败');
        console.error('Load loan error:', error);
      } finally {
        setPageLoading(false);
      }
    })();
  // eslint-disable-next-line
  }, [id]);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/api/loans/${id}`, values);
        message.success('保存成功');
        navigate('/loans?my=1'); // 跳转到我的借款页面
      } else {
        await api.post('/api/loans', values);
        message.success('借款申请已提交');
        navigate('/loans?my=1'); // 跳转到我的借款页面
      }
    } catch (error) {
      message.error(error.response?.data?.msg || '提交失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/loans?my=1'); // 返回到我的借款页面
  };

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <Card style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{ marginRight: 16 }}
          >
            返回
          </Button>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {isEdit ? '编辑借款' : '借款申请'}
          </h3>
        </div>

        <Spin spinning={pageLoading} tip="加载中...">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            autoComplete="off"
          >
          <Form.Item
            name="amount"
            label={
              <span>
                借款金额
                <span style={{ color: 'red', marginLeft: 4, fontSize: '12px' }}>必填</span>
              </span>
            }
            rules={[
              { required: true, message: '请输入借款金额' },
              { type: 'number', min: 0.01, message: '金额必须大于0' }
            ]}
          >
            <InputNumber
              prefix={<DollarOutlined />}
              placeholder="请输入借款金额"
              style={{ width: '100%' }}
              precision={2}
              min={0.01}
              step={0.01}
            />
          </Form.Item>

          <Form.Item
            name="purpose"
            label={
              <span>
                借款用途
                <span style={{ color: 'red', marginLeft: 4, fontSize: '12px' }}>必填</span>
              </span>
            }
            rules={[{ required: true, message: '请输入借款用途' }]}
          >
            <TextArea
              placeholder="请详细说明借款用途"
              rows={4}
              showCount
              maxLength={500}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<FileTextOutlined />}
              size="large"
              style={{ width: '100%' }}
            >
              {isEdit ? '保存' : '提交申请'}
            </Button>
          </Form.Item>
          </Form>
        </Spin>
      </Card>
    </div>
  );
}

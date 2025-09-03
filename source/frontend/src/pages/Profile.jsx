import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

export default function Profile() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user')) || {};

  // 设置初始值
  React.useEffect(() => {
    form.setFieldsValue({
      real_name: user.real_name || ''
    });
  }, [form, user.real_name]);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const response = await api.post('/api/user/update-profile', {
        real_name: values.real_name,
        old_password: values.old_password || '',
        new_password: values.new_password || '',
        confirm_password: values.confirm_password || ''
      });
      
      // 如果有新密码，自动登出并跳转登录页
      if (values.new_password) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        message.success('密码修改成功，请重新登录', 3);
        setTimeout(() => {
          navigate('/login');
        }, 1500);
        return;
      }
      
      message.success('个人信息修改成功');
      // 更新本地缓存
      localStorage.setItem('user', JSON.stringify({ ...user, real_name: values.real_name }));
      // 清空密码字段
      form.setFieldsValue({
        old_password: '',
        new_password: '',
        confirm_password: ''
      });
    } catch (error) {
      message.error(error.response?.data?.msg || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <Card style={{ maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginBottom: 24, fontSize: 18, fontWeight: 500 }}>个人信息修改</h3>
        
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="real_name"
            label="真实姓名"
            rules={[{ required: true, message: '请输入真实姓名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入真实姓名"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="old_password"
            label="原密码"
            extra="如不修改密码，请留空"
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入原密码"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="new_password"
            label="新密码"
            dependencies={['old_password']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (getFieldValue('old_password') && !value) {
                    return Promise.reject(new Error('请输入新密码'));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请确认新密码"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
              size="large"
              style={{ width: '100%' }}
            >
              保存修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined, EyeInvisibleOutlined, EyeTwoTone, MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../utils/api';

const { Title, Text } = Typography;

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setLoading(true);
    setError('');
    
    try {
      await userApi.register(values);
      // 注册成功后自动登录
      const loginRes = await userApi.login({
        username: values.username,
        password: values.password
      });
      
      localStorage.setItem('token', loginRes.token);
      localStorage.setItem('role', loginRes.role);
      localStorage.setItem('real_name', loginRes.real_name);
      if (loginRes.id !== undefined && loginRes.id !== null) {
        localStorage.setItem('user_id', loginRes.id);
      }
      navigate('/');
    } catch (err) {
  setError(err.response?.data?.msg || err.response?.data?.message || '注册失败，请检查输入信息');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '450px',
        position: 'relative'
      }}>
        {/* Logo区域 */}
        <div style={{
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)',
            borderRadius: '20px',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(24, 144, 255, 0.3)'
          }}>
            <UserOutlined style={{ fontSize: '32px', color: '#fff' }} />
          </div>
          <Title level={2} style={{
            color: '#fff',
            margin: 0,
            fontWeight: 600,
            textShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            企业财务管理系统V2.0版本
          </Title>
          <Text style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: '14px',
            display: 'block',
            marginTop: '8px'
          }}>
            加入我们，开启高效财务管理
          </Text>
        </div>

        {/* 注册表单 */}
        <Card
          style={{
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
            border: 'none',
            backdropFilter: 'blur(10px)',
            background: 'rgba(255,255,255,0.95)'
          }}
          bodyStyle={{ padding: '32px' }}
        >
          <Title level={3} style={{ 
            textAlign: 'center', 
            marginBottom: '32px',
            color: '#262626',
            fontWeight: 600
          }}>
            创建新账户
          </Title>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginBottom: '24px' }}
            />
          )}

          <Form
            name="register"
            onFinish={handleSubmit}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少3个字符' },
                { max: 20, message: '用户名不能超过20个字符' },
                { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' }
              ]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="请输入用户名"
                style={{
                  height: '48px',
                  borderRadius: '8px',
                  border: '1px solid #d9d9d9',
                  fontSize: '16px'
                }}
              />
            </Form.Item>

            <Form.Item
              name="real_name"
              rules={[
                { required: true, message: '请输入真实姓名' },
                { min: 2, message: '姓名至少2个字符' },
                { max: 20, message: '姓名不能超过20个字符' }
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="请输入真实姓名"
                style={{
                  height: '48px',
                  borderRadius: '8px',
                  border: '1px solid #d9d9d9',
                  fontSize: '16px'
                }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 8, message: '密码至少8个字符' },
                { max: 20, message: '密码不能超过20个字符' }
              ]}
              extra={<Text type="secondary">密码至少8位。建议包含字母和数字，避免使用常见弱口令。</Text>}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="请输入密码（至少8位）"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                style={{
                  height: '48px',
                  borderRadius: '8px',
                  border: '1px solid #d9d9d9',
                  fontSize: '16px'
                }}
              />
            </Form.Item>

            <Form.Item
              name="password2"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="请确认密码"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                style={{
                  height: '48px',
                  borderRadius: '8px',
                  border: '1px solid #d9d9d9',
                  fontSize: '16px'
                }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: '16px' }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                style={{
                  width: '100%',
                  height: '48px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
                }}
              >
                {loading ? '注册中...' : '立即注册'}
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ margin: '24px 0' }}>
            <Text style={{ color: '#8c8c8c', fontSize: '14px' }}>或</Text>
          </Divider>

          <div style={{
            textAlign: 'center',
            marginTop: '24px'
          }}>
            <Space>
              <Text style={{ color: '#8c8c8c' }}>已有账号？</Text>
              <Button 
                type="link" 
                onClick={() => navigate('/login')}
                style={{ 
                  padding: 0,
                  height: 'auto',
                  color: '#1890ff',
                  fontWeight: 500
                }}
              >
                立即登录
              </Button>
            </Space>
          </div>
        </Card>

        {/* 底部信息 */}
        <div style={{
          textAlign: 'center',
          marginTop: '32px'
        }}>
          <Text style={{ 
            color: 'rgba(255,255,255,0.6)', 
            fontSize: '12px' 
          }}>
            © 2024 企业财务管理系统. All rights reserved.
          </Text>
        </div>
      </div>
    </div>
  );
}

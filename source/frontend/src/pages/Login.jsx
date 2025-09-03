import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd';
import { UserOutlined, LockOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../utils/api';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setLoading(true);
    setError('');
    try {
      const res = await userApi.login(values);
      localStorage.setItem('token', res.token);
      if (res.user) {
        localStorage.setItem('role', res.user.role);
        localStorage.setItem('real_name', res.user.realName);
        localStorage.setItem('user_id', res.user.id);
        localStorage.setItem('username', res.user.username);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || '登录失败，请检查用户名和密码');
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
        maxWidth: '400px',
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
            安全、高效的财务管理平台
          </Text>
        </div>

        {/* 登录表单 */}
        <Card
          title={null}
          styles={{
            body: {
              padding: '40px 30px',
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
            }
          }}
        >
          {/* 公司名移动到内容区域，位置略下，居中显示 */}
          <Title level={2} style={{ textAlign: 'center', margin: '0 0 12px', color: '#1890ff' }}>
            兴万聚信息科技有限公司
          </Title>

          {/* "请登录您的账户" 移除 */}

          <Title level={3} style={{ 
            textAlign: 'center', 
            marginBottom: '32px',
            color: '#262626',
            fontWeight: 600
          }}>
            欢迎登录
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
            name="login"
            onFinish={handleSubmit}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 2, message: '用户名至少2个字符' }
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
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6个字符' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="请输入密码"
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
                {loading ? '登录中...' : '登录'}
              </Button>
            </Form.Item>
          </Form>

          <div style={{
            textAlign: 'center',
            marginTop: '24px',
            paddingTop: '24px',
            borderTop: '1px solid #f0f0f0'
          }}>
            <Space>
              <Text style={{ color: '#8c8c8c' }}>还没有账号？</Text>
              <Button 
                type="link" 
                onClick={() => navigate('/register')}
                style={{ 
                  padding: 0,
                  height: 'auto',
                  color: '#1890ff',
                  fontWeight: 500
                }}
              >
                立即注册
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
            © 2024 兴万聚信息科技有限公司. All rights reserved.
          </Text>
        </div>
      </div>
    </div>
  );
}

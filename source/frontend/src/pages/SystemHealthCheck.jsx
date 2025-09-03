import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag, Space, Button, Alert, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { userApi, loanApi, reimbursementApi } from '../utils/api';

const { Title, Text } = Typography;

export default function SystemHealthCheck() {
  const [status, setStatus] = useState({
    backend: 'loading',
    apis: {},
    frontend: 'loading'
  });
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState({});

  useEffect(() => {
    checkSystemHealth();
  }, []);

  const checkSystemHealth = async () => {
    setLoading(true);
    const results = {
      backend: 'unknown',
      apis: {},
      frontend: 'unknown'
    };
    const apiDetails = {};

    try {
      // 1. 检查用户登录API
      console.log('检查登录API...');
      try {
        await userApi.login({ username: 'finance', password: '123456' });
        results.apis.login = 'success';
        apiDetails.login = '登录API正常';
      } catch (error) {
        results.apis.login = 'error';
        apiDetails.login = `登录API错误: ${error.message}`;
      }

      // 2. 检查借款API
      console.log('检查借款API...');
      try {
        await loanApi.getAll();
        results.apis.loan = 'success';
        apiDetails.loan = '借款API正常';
      } catch (error) {
        results.apis.loan = 'error';
        apiDetails.loan = `借款API错误: ${error.message}`;
      }

      // 3. 检查报销API
      console.log('检查报销API...');
      try {
        await reimbursementApi.getAll();
        results.apis.reimbursement = 'success';
        apiDetails.reimbursement = '报销API正常';
      } catch (error) {
        results.apis.reimbursement = 'error';
        apiDetails.reimbursement = `报销API错误: ${error.message}`;
      }

      // 4. 总体状态评估
      const successCount = Object.values(results.apis).filter(s => s === 'success').length;
      const totalCount = Object.keys(results.apis).length;
      
      if (successCount === totalCount) {
        results.backend = 'success';
        results.frontend = 'success';
      } else if (successCount > 0) {
        results.backend = 'warning';
        results.frontend = 'warning';
      } else {
        results.backend = 'error';
        results.frontend = 'error';
      }

    } catch (error) {
      console.error('系统检查失败:', error);
      results.backend = 'error';
      results.frontend = 'error';
    }

    setStatus(results);
    setDetails(apiDetails);
    setLoading(false);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'warning': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      case 'error': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default: return <Spin size="small" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'success';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Card title="系统健康检查" style={{ margin: '24px 0' }}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>正在检查系统状态...</div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ margin: '24px 0' }}>
      <Card title="🔍 系统健康检查报告" style={{ marginBottom: '16px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 整体状态 */}
          <div>
            <Title level={4}>整体状态</Title>
            <Space>
              <Tag color={getStatusColor(status.backend)} icon={getStatusIcon(status.backend)}>
                后端服务: {status.backend}
              </Tag>
              <Tag color={getStatusColor(status.frontend)} icon={getStatusIcon(status.frontend)}>
                前端连接: {status.frontend}
              </Tag>
            </Space>
          </div>

          {/* API状态详情 */}
          <div>
            <Title level={4}>API接口状态</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              {Object.entries(status.apis).map(([api, apiStatus]) => (
                <div key={api} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text>{api.toUpperCase()} API</Text>
                  <Space>
                    <Tag color={getStatusColor(apiStatus)} icon={getStatusIcon(apiStatus)}>
                      {apiStatus}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {details[api]}
                    </Text>
                  </Space>
                </div>
              ))}
            </Space>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={checkSystemHealth} loading={loading}>
              重新检查
            </Button>
            <Button type="primary" onClick={() => window.location.href = '/login'}>
              返回登录
            </Button>
          </div>
        </Space>
      </Card>

      {/* 问题修复建议 */}
      {status.backend !== 'success' && (
        <Alert
          message="发现问题"
          description={
            <div>
              <p>系统检查发现以下问题：</p>
              <ul>
                {Object.entries(status.apis)
                  .filter(([api, apiStatus]) => apiStatus !== 'success')
                  .map(([api, apiStatus]) => (
                    <li key={api}>{details[api]}</li>
                  ))}
              </ul>
              <p><strong>建议：</strong></p>
              <ol>
                <li>确保后端服务正在运行 (端口3002)</li>
                <li>检查网络连接</li>
                <li>查看浏览器控制台错误信息</li>
              </ol>
            </div>
          }
          type="warning"
          showIcon
        />
      )}
    </div>
  );
}

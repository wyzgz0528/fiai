import React, { useState, useEffect } from 'react';
import { Card, Typography, Space, Button, Divider, Progress } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { isTokenExpired, isTokenExpiringSoon, getTokenTimeLeft, formatTimeLeft, clearAuthData } from '../utils/auth';
import { userApi } from '../utils/api';

const { Text } = Typography;

export default function TokenStatus() {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [isExpiring, setIsExpiring] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      setTimeLeft(getTokenTimeLeft());
      setIsExpired(isTokenExpired());
      setIsExpiring(isTokenExpiringSoon());
    };

    // 立即更新一次
    updateStatus();

    // 每分钟更新一次
    const interval = setInterval(updateStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      const response = await userApi.refreshToken();
      localStorage.setItem('token', response.token);
      
      // 更新状态
      setTimeLeft(getTokenTimeLeft());
      setIsExpired(false);
      setIsExpiring(false);
      
      alert('Token刷新成功！');
    } catch (error) {
      alert('Token刷新失败，请重新登录');
      clearAuthData();
      window.location.href = '/login';
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      clearAuthData();
      window.location.href = '/login';
    }
  };

  if (isExpired) {
    return (
      <Card size="small" style={{ margin: '8px 0' }}>
        <Space>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          <Text type="danger">登录已过期</Text>
          <Button size="small" type="primary" onClick={() => window.location.href = '/login'}>
            重新登录
          </Button>
        </Space>
      </Card>
    );
  }

  // 计算进度条百分比（基于7天总时长）
  const totalDuration = 7 * 24 * 60 * 60 * 1000; // 7天的毫秒数
  const progressPercent = Math.max(0, (timeLeft / totalDuration) * 100);

  return (
    <Card size="small" style={{ margin: '8px 0' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space>
          {isExpiring ? (
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          ) : (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          )}
          <ClockCircleOutlined />
          <Text>
            登录有效期剩余: <strong>{formatTimeLeft(timeLeft)}</strong>
          </Text>
        </Space>
        
        <Progress
          percent={progressPercent}
          size="small"
          status={isExpiring ? 'exception' : 'normal'}
          strokeColor={isExpiring ? '#faad14' : '#52c41a'}
        />
        
        <Space>
          {isExpiring && (
            <Button
              size="small"
              type="primary"
              loading={refreshing}
              onClick={handleRefreshToken}
              icon={<ClockCircleOutlined />}
            >
              刷新登录
            </Button>
          )}
          <Button size="small" onClick={handleLogout}>
            退出登录
          </Button>
        </Space>
      </Space>
    </Card>
  );
}

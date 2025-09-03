import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Button, Typography, Space, Divider } from 'antd';
import {
  UserOutlined, 
  LogoutOutlined, 
  ProfileOutlined, 
  FileTextOutlined, 
  PlusCircleOutlined, 
  AuditOutlined, 
  TeamOutlined, 
  CheckCircleOutlined,
  DashboardOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';
import { theme, customStyles } from '../theme';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const realName = localStorage.getItem('real_name');
  const role = localStorage.getItem('role');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    console.log('Dashboard: 检查token状态:', token ? '存在' : '不存在');
    if (!token) {
      console.log('Dashboard: token不存在，跳转到登录页面');
      navigate('/login');
    } else {
      console.log('Dashboard: token存在，继续正常流程');
    }
  }, [token, navigate]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  if (!token) return null;

  // 菜单配置
  const menuItems = [
    {
      key: 'personal',
      label: '个人工作台',
      icon: <DashboardOutlined />,
      children: [
        {
          key: '/loans',
          label: '我的借款',
          icon: <FileTextOutlined />,
          roles: ['employee', 'finance', 'manager']
        },
        {
          key: '/loans/new',
          label: '借款申请',
          icon: <PlusCircleOutlined />,
          roles: ['employee', 'finance', 'manager']
        },
        {
          key: '/reimbursement-forms?my=1',
          label: '我的报销单',
          icon: <ProfileOutlined />,
          roles: ['employee', 'finance', 'manager']
        },
        {
          key: '/reimbursement-forms/new',
          label: '报销申请',
          icon: <AuditOutlined />,
          roles: ['employee', 'finance', 'manager']
        },
        {
          key: '/profile',
          label: '个人信息',
          icon: <UserOutlined />,
          roles: ['employee', 'finance', 'manager', 'admin']
        }
      ]
    },
    {
      key: 'management',
      label: '管理功能',
      icon: <SettingOutlined />,
      roles: ['finance', 'manager'],
      children: [
        {
          key: '/loans?todo=1',
          label: '借款审批',
          icon: <TeamOutlined />,
          roles: ['finance', 'manager']
        },
        {
          key: '/reimbursement-forms?todo=1',
          label: '报销审核',
          icon: <CheckCircleOutlined />,
          roles: ['finance', 'manager']
        },
        {
          key: '/management-analytics',
          label: '统计分析',
          icon: <DashboardOutlined />,
          roles: ['finance', 'manager', 'admin']
        }
      ]
    },
    // Admin 独有菜单
    ...(role === 'admin' ? [{
      key: 'admin',
      label: '系统管理',
      icon: <SettingOutlined />,
      children: [
        { key: '/admin', label: 'Admin 面板', icon: <SettingOutlined />, roles: ['admin'] }
      ]
    }] : [])
  ];

  // 过滤菜单项
  const filteredMenuItems = menuItems.filter(item => {
    if (item.roles && !item.roles.includes(role)) return false;
    if (item.children) {
      item.children = item.children.filter(child => 
        !child.roles || child.roles.includes(role)
      );
      return item.children.length > 0;
    }
    return true;
  });

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  // 用户菜单（移除系统设置）
  const userMenu = (
    <Menu>
      <Menu.Item key="profile" icon={<UserOutlined />}>
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 500 }}>{realName || '未知用户'}</div>
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>{role || '未知角色'}</div>
          </div>
        </Space>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="logout" icon={<LogoutOutlined />} onClick={handleLogout}>
        退出登录
      </Menu.Item>
    </Menu>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: customStyles.background.layout }}>
      {/* 侧边栏 */}
      <Sider 
        width={customStyles.layout.siderWidth}
        collapsed={collapsed}
        collapsedWidth={customStyles.layout.siderCollapsedWidth}
        style={{
          background: customStyles.background.primary,
          boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
          position: 'fixed',
          height: '100vh',
          left: 0,
          top: 0,
          zIndex: 1000
        }}
      >
        {/* Logo区域 */}
        <div style={{
          height: customStyles.layout.headerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 24px',
          borderBottom: `1px solid ${customStyles.border.secondary}`,
          background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)',
          color: '#fff'
        }}>
          {!collapsed && (
            <div
              onClick={() => navigate('/')}
              title="返回首页"
              style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FileTextOutlined style={{ color: '#fff', fontSize: '16px' }} />
              </div>
              <Title level={4} style={{ color: '#fff', margin: 0, fontWeight: 600 }}>
                深圳兴万聚
              </Title>
            </div>
          )}
          {collapsed && (
            <div
              onClick={() => navigate('/')}
              title="返回首页"
              style={{
                width: '32px',
                height: '32px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <FileTextOutlined style={{ color: '#fff', fontSize: '16px' }} />
            </div>
          )}
        </div>

        {/* 菜单 */}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={filteredMenuItems}
          onClick={handleMenuClick}
          style={{
            border: 'none',
            background: 'transparent',
            marginTop: '16px'
          }}
          theme="light"
        />
      </Sider>

      {/* 主内容区域 */}
      <Layout style={{ 
        marginLeft: collapsed ? customStyles.layout.siderCollapsedWidth : customStyles.layout.siderWidth,
        transition: 'margin-left 0.2s'
      }}>
        {/* 顶部导航栏 */}
        <Header style={{
          background: customStyles.background.primary,
          padding: '0 24px',
          height: customStyles.layout.headerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          position: 'sticky',
          top: 0,
          zIndex: 999
        }}>
          {/* 左侧：折叠按钮和面包屑 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: '16px',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
            <Divider type="vertical" style={{ height: '24px' }} />
            <Text style={{ fontSize: '16px', fontWeight: 500, color: customStyles.text.primary }}>
              欢迎使用企业财务管理系统V2.0版本
            </Text>
          </div>

          {/* 右侧：用户信息（移除通知） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* 用户信息 */}
            <Dropdown menu={{ items: userMenu.props.children.map(item => ({
              key: item.key,
              icon: item.props.icon,
              label: item.props.children,
              onClick: item.props.onClick
            })) }} placement="bottomRight" trigger={['click']}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: '6px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = customStyles.background.tertiary}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Avatar 
                  size="small" 
                  icon={<UserOutlined />}
                  style={{ background: customStyles.status.info }}
                />
                {!collapsed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 180, whiteSpace: 'nowrap' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {realName || '未知用户'}
                    </Text>
                    <Text style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                      {role || '未知角色'}
                    </Text>
                  </div>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        {/* 内容区域 */}
        <Content style={{
          margin: '24px',
          padding: '24px',
          background: customStyles.background.primary,
          borderRadius: '12px',
          boxShadow: customStyles.card.boxShadow,
          minHeight: 'calc(100vh - 112px)',
          overflow: 'auto'
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}


import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Tabs, 
  Typography, 
  Space, 
  Row, 
  Col,
  Statistic,
  Alert,
  Button,
  message
} from 'antd';
import { 
  ScanOutlined, 
  ExportOutlined, 
  DashboardOutlined,
  FileTextOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import MultiFieldOCR from '../components/MultiFieldOCR';
import FinancialExport from '../components/FinancialExport';
import api from '../utils/api';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

/**
 * 财务工具页面
 * 集成多字段OCR识别和财务台账导出功能
 */
const FinancialTools = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [exportStatus, setExportStatus] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  // 加载初始数据
  const loadInitialData = async () => {
    try {
      // 获取用户信息
      const userResponse = await api.get('/api/user/profile');
      if (userResponse.data.success) {
        setUserInfo(userResponse.data.data);
      }

      // 获取OCR服务状态
      const ocrResponse = await api.get('/api/ocr/status');
      if (ocrResponse.data.success) {
        setOcrStatus(ocrResponse.data.data);
      }

      // 获取导出服务状态
      const exportResponse = await api.get('/api/export/status');
      if (exportResponse.data.success) {
        setExportStatus(exportResponse.data.data);
      }

      // 获取统计信息
      const statsResponse = await api.get('/api/ocr/invoice-batch?limit=1');
      if (statsResponse.data.success) {
        setStatistics({
          totalRecords: statsResponse.data.total
        });
      }

    } catch (error) {
      console.error('加载初始数据失败:', error);
      message.error('加载页面数据失败');
    } finally {
      setLoading(false);
    }
  };

  // OCR识别完成回调
  const handleOCRComplete = (result) => {
    console.log('OCR识别完成:', result);
    message.success('多字段识别完成，可以将结果应用到报销单中');
  };

  // 获取用户角色显示名称
  const getRoleDisplayName = (role) => {
    const roleMap = {
      'employee': '员工',
      'finance': '财务',
      'manager': '经理',
      'admin': '管理员'
    };
    return roleMap[role] || role;
  };

  // 获取OCR引擎显示名称
  const getOCREngineDisplayName = (engine) => {
    const engineMap = {
      'multifield': 'PaddleOCR多字段',
      'optimized': 'PaddleOCR优化版',
      'easyocr': 'EasyOCR',
      'original': 'PaddleOCR原版'
    };
    return engineMap[engine] || engine;
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>
          <Space>
            <DashboardOutlined />
            财务工具中心
          </Space>
        </Title>
        <Text type="secondary">
          多字段OCR识别和财务台账导出工具
        </Text>
      </div>

      {/* 状态概览 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="当前用户"
              value={userInfo?.real_name || userInfo?.username || '未知'}
              prefix={<FileTextOutlined />}
              suffix={`(${getRoleDisplayName(userInfo?.role)})`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="OCR引擎"
              value={getOCREngineDisplayName(ocrStatus?.preferredEngine)}
              prefix={<ScanOutlined />}
              valueStyle={{ 
                color: ocrStatus?.isEnabled ? '#3f8600' : '#cf1322',
                fontSize: '16px'
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="导出权限"
              value={exportStatus?.permissions?.canExportFinancialLedger ? '完整权限' : '受限权限'}
              prefix={<ExportOutlined />}
              valueStyle={{ 
                color: exportStatus?.permissions?.canExportFinancialLedger ? '#3f8600' : '#d46b08',
                fontSize: '16px'
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="报销记录"
              value={statistics?.totalRecords || 0}
              prefix={<BarChartOutlined />}
              suffix="条"
            />
          </Card>
        </Col>
      </Row>

      {/* 功能选项卡 */}
      <Tabs defaultActiveKey="ocr" size="large">
        <TabPane 
          tab={
            <Space>
              <ScanOutlined />
              多字段OCR识别
            </Space>
          } 
          key="ocr"
        >
          <div style={{ marginBottom: 16 }}>
            <Alert
              message="多字段OCR识别功能"
              description="上传发票图片或PDF文件，自动识别发票号码、金额、开票日期、购买方名称、服务名称等多个字段。识别结果可以直接应用到报销单中。"
              type="info"
              showIcon
              closable
            />
          </div>

          {/* OCR服务状态提示 */}
          {ocrStatus && (
            <div style={{ marginBottom: 16 }}>
              {ocrStatus.isEnabled ? (
                <Alert
                  message={`OCR服务正常运行 - ${getOCREngineDisplayName(ocrStatus.preferredEngine)}`}
                  description={`可用引擎: ${ocrStatus.availableEngines.map(getOCREngineDisplayName).join(', ')}`}
                  type="success"
                  showIcon
                />
              ) : (
                <Alert
                  message="OCR服务运行在模拟模式"
                  description="当前使用模拟数据进行演示，实际部署时请配置OCR引擎"
                  type="warning"
                  showIcon
                />
              )}
            </div>
          )}

          <MultiFieldOCR 
            onRecognitionComplete={handleOCRComplete}
            showTitle={false}
          />
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <ExportOutlined />
              财务台账导出
            </Space>
          } 
          key="export"
        >
          <div style={{ marginBottom: 16 }}>
            <Alert
              message="财务台账导出功能"
              description="导出包含发票信息的完整财务台账，支持按用户、状态、日期范围等条件筛选。导出的Excel文件包含报销记录和对应的发票信息。"
              type="info"
              showIcon
              closable
            />
          </div>

          {/* 导出权限提示 */}
          {exportStatus && (
            <div style={{ marginBottom: 16 }}>
              {exportStatus.permissions.canExportFinancialLedger ? (
                <Alert
                  message="拥有完整导出权限"
                  description="可以导出财务台账和报销记录列表"
                  type="success"
                  showIcon
                />
              ) : exportStatus.permissions.canExportReimbursementList ? (
                <Alert
                  message="拥有部分导出权限"
                  description="可以导出报销记录列表，但无法导出完整财务台账"
                  type="warning"
                  showIcon
                />
              ) : (
                <Alert
                  message="权限不足"
                  description="当前用户无导出权限，请联系管理员"
                  type="error"
                  showIcon
                />
              )}
            </div>
          )}

          <FinancialExport userRole={userInfo?.role} />
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <BarChartOutlined />
              使用说明
            </Space>
          } 
          key="help"
        >
          <Card title="功能说明" size="small">
            <div style={{ lineHeight: '1.8' }}>
              <Title level={4}>多字段OCR识别</Title>
              <ul>
                <li><strong>支持格式</strong>：JPG、PNG、PDF等常见格式</li>
                <li><strong>识别字段</strong>：发票号码、金额(含税)、开票日期、购买方名称、服务名称</li>
                <li><strong>置信度</strong>：每个字段都有置信度评分，绿色表示高置信度，橙色表示中等，红色表示低置信度</li>
                <li><strong>使用方法</strong>：上传发票图片 → 点击"开始识别" → 检查识别结果 → 手动修正错误字段</li>
              </ul>

              <Title level={4}>财务台账导出</Title>
              <ul>
                <li><strong>财务台账</strong>：包含完整的报销记录和发票信息，带统计汇总（需要财务或管理员权限）</li>
                <li><strong>报销记录</strong>：简化的报销记录列表（财务、管理员、经理可用）</li>
                <li><strong>筛选条件</strong>：支持按用户、状态、日期范围、是否有发票等条件筛选</li>
                <li><strong>文件格式</strong>：导出为Excel格式，包含多个工作表</li>
              </ul>

              <Title level={4}>权限说明</Title>
              <ul>
                <li><strong>员工</strong>：可以使用OCR识别功能，无导出权限</li>
                <li><strong>经理</strong>：可以使用OCR识别和导出报销记录列表</li>
                <li><strong>财务</strong>：拥有所有功能权限，包括财务台账导出</li>
                <li><strong>管理员</strong>：拥有所有功能权限，包括文件管理</li>
              </ul>
            </div>
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default FinancialTools;

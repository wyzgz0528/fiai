import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Select, 
  DatePicker, 
  Button, 
  Space, 
  Typography, 
  message, 
  Row, 
  Col,
  Statistic,
  Table,
  Tag,
  Modal,
  List,
  Divider
} from 'antd';
import { 
  DownloadOutlined, 
  ExportOutlined, 
  FileExcelOutlined,
  CalendarOutlined,
  UserOutlined,
  DollarOutlined,
  FileTextOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

/**
 * 财务台账导出组件
 * 支持导出包含发票信息的报销记录
 */
const FinancialExport = ({ userRole = 'employee' }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [exportFiles, setExportFiles] = useState([]);
  const [filesVisible, setFilesVisible] = useState(false);
  const [users, setUsers] = useState([]);

  // 权限检查
  const canExportFinancialLedger = ['finance', 'admin'].includes(userRole);
  const canExportReimbursementList = ['finance', 'admin', 'manager'].includes(userRole);
  const canViewFiles = ['finance', 'admin'].includes(userRole);

  useEffect(() => {
    // 加载用户列表（如果有权限）
    if (canExportFinancialLedger || canExportReimbursementList) {
      loadUsers();
    }
  }, [canExportFinancialLedger, canExportReimbursementList]);

  // 加载用户列表
  const loadUsers = async () => {
    try {
      const response = await api.get('/api/user/users');
      if (response.data.success) {
        setUsers(response.data.data || []);
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
    }
  };

  // 预览数据
  const handlePreview = async () => {
    const values = form.getFieldsValue();
    const filters = buildFilters(values);

    setLoading(true);
    try {
      const response = await api.get('/api/ocr/invoice-batch', {
        params: {
          ...filters,
          limit: 10 // 预览只显示前10条
        }
      });

      if (response.data.success) {
        setPreviewData({
          data: response.data.data,
          total: response.data.total,
          filters: filters
        });
        setPreviewVisible(true);
      } else {
        message.error('预览数据失败');
      }
    } catch (error) {
      console.error('预览数据失败:', error);
      message.error('预览数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 导出财务台账
  const handleExportFinancialLedger = async () => {
    if (!canExportFinancialLedger) {
      message.error('权限不足：只有财务和管理员可以导出财务台账');
      return;
    }

    const values = form.getFieldsValue();
    const filters = buildFilters(values);

    setLoading(true);
    try {
      const response = await api.post('/api/export/financial-ledger', filters);

      if (response.data.success) {
        const { filename, recordCount, downloadUrl } = response.data.data;
        message.success(`财务台账导出成功！共 ${recordCount} 条记录`);
        
        // 自动下载文件
        const link = document.createElement('a');
        link.href = `${api.defaults.baseURL}${downloadUrl}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        message.error(response.data.message || '导出失败');
      }
    } catch (error) {
      console.error('导出财务台账失败:', error);
      message.error(error.response?.data?.message || '导出失败');
    } finally {
      setLoading(false);
    }
  };

  // 导出报销记录列表
  const handleExportReimbursementList = async () => {
    if (!canExportReimbursementList) {
      message.error('权限不足：只有财务、管理员和经理可以导出报销记录');
      return;
    }

    const values = form.getFieldsValue();
    const filters = buildFilters(values);

    setLoading(true);
    try {
      const response = await api.post('/api/export/reimbursement-list', filters);

      if (response.data.success) {
        const { filename, recordCount, downloadUrl } = response.data.data;
        message.success(`报销记录导出成功！共 ${recordCount} 条记录`);
        
        // 自动下载文件
        const link = document.createElement('a');
        link.href = `${api.defaults.baseURL}${downloadUrl}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        message.error(response.data.message || '导出失败');
      }
    } catch (error) {
      console.error('导出报销记录失败:', error);
      message.error(error.response?.data?.message || '导出失败');
    } finally {
      setLoading(false);
    }
  };

  // 查看导出文件
  const handleViewFiles = async () => {
    if (!canViewFiles) {
      message.error('权限不足');
      return;
    }

    try {
      const response = await api.get('/api/export/files');
      if (response.data.success) {
        setExportFiles(response.data.data);
        setFilesVisible(true);
      } else {
        message.error('获取文件列表失败');
      }
    } catch (error) {
      console.error('获取文件列表失败:', error);
      message.error('获取文件列表失败');
    }
  };

  // 构建过滤条件
  const buildFilters = (values) => {
    const filters = {};
    
    if (values.user_id) {
      filters.user_id = values.user_id;
    }
    
    if (values.status) {
      filters.status = values.status;
    }
    
    if (values.dateRange && values.dateRange.length === 2) {
      filters.start_date = values.dateRange[0].format('YYYY-MM-DD');
      filters.end_date = values.dateRange[1].format('YYYY-MM-DD');
    }
    
    if (values.has_invoice) {
      filters.has_invoice = values.has_invoice === 'true';
    }
    
    if (values.limit) {
      filters.limit = values.limit;
    }

    return filters;
  };

  // 预览表格列定义
  const previewColumns = [
    {
      title: '报销记录ID',
      dataIndex: ['reimbursement', 'id'],
      key: 'id',
      width: 100
    },
    {
      title: '用户',
      dataIndex: ['reimbursement', 'user_name'],
      key: 'user_name',
      width: 100
    },
    {
      title: '报销金额',
      dataIndex: ['reimbursement', 'amount'],
      key: 'amount',
      width: 100,
      render: (amount) => `¥${amount || 0}`
    },
    {
      title: '发票号码',
      dataIndex: ['invoice', 'invoice_number'],
      key: 'invoice_number',
      width: 150,
      render: (number) => number || <Text type="secondary">无</Text>
    },
    {
      title: '发票金额',
      dataIndex: ['invoice', 'invoice_amount'],
      key: 'invoice_amount',
      width: 100,
      render: (amount) => amount ? `¥${amount}` : <Text type="secondary">无</Text>
    },
    {
      title: '状态',
      dataIndex: ['reimbursement', 'status'],
      key: 'status',
      width: 80,
      render: (status) => <Tag>{status}</Tag>
    }
  ];

  return (
    <Card 
      title={
        <Space>
          <ExportOutlined />
          财务台账导出
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          dateRange: [dayjs().subtract(1, 'month'), dayjs()],
          has_invoice: 'all',
          limit: 1000
        }}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="用户" name="user_id">
              <Select placeholder="选择用户（可选）" allowClear>
                {users.map(user => (
                  <Option key={user.id} value={user.id}>
                    {user.real_name || user.username}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="状态" name="status">
              <Select placeholder="选择状态（可选）" allowClear>
                <Option value="草稿">草稿</Option>
                <Option value="已提交">已提交</Option>
                <Option value="财务审核">财务审核</Option>
                <Option value="经理审批">经理审批</Option>
                <Option value="已打款">已打款</Option>
                <Option value="已驳回">已驳回</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="发票筛选" name="has_invoice">
              <Select>
                <Option value="all">全部记录</Option>
                <Option value="true">仅有发票的记录</Option>
                <Option value="false">仅无发票的记录</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="日期范围" name="dateRange">
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="导出限制" name="limit">
              <Select>
                <Option value={100}>100条</Option>
                <Option value={500}>500条</Option>
                <Option value={1000}>1000条</Option>
                <Option value={5000}>5000条</Option>
                <Option value={null}>不限制</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Divider />

      <Row gutter={16}>
        <Col span={6}>
          <Button 
            icon={<FileTextOutlined />}
            onClick={handlePreview}
            loading={loading}
            block
          >
            预览数据
          </Button>
        </Col>
        <Col span={6}>
          <Button 
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={handleExportFinancialLedger}
            loading={loading}
            disabled={!canExportFinancialLedger}
            block
          >
            导出财务台账
          </Button>
        </Col>
        <Col span={6}>
          <Button 
            icon={<DownloadOutlined />}
            onClick={handleExportReimbursementList}
            loading={loading}
            disabled={!canExportReimbursementList}
            block
          >
            导出报销记录
          </Button>
        </Col>
        <Col span={6}>
          <Button 
            icon={<ClockCircleOutlined />}
            onClick={handleViewFiles}
            disabled={!canViewFiles}
            block
          >
            历史文件
          </Button>
        </Col>
      </Row>

      {/* 权限提示 */}
      {!canExportFinancialLedger && !canExportReimbursementList && (
        <div style={{ marginTop: 16, padding: 16, background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
          <Text type="warning">
            当前用户权限不足，无法使用导出功能。请联系管理员获取相应权限。
          </Text>
        </div>
      )}

      {/* 数据预览弹窗 */}
      <Modal
        title="数据预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={1000}
        footer={null}
      >
        {previewData && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Statistic title="总记录数" value={previewData.total} />
                <Statistic title="预览记录数" value={previewData.data.length} />
              </Space>
            </div>
            <Table
              columns={previewColumns}
              dataSource={previewData.data}
              rowKey={(record) => record.reimbursement.id}
              pagination={false}
              scroll={{ x: 800 }}
              size="small"
            />
          </>
        )}
      </Modal>

      {/* 历史文件弹窗 */}
      <Modal
        title="导出文件历史"
        open={filesVisible}
        onCancel={() => setFilesVisible(false)}
        width={600}
        footer={null}
      >
        <List
          dataSource={exportFiles}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Button 
                  type="link" 
                  icon={<DownloadOutlined />}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = `${api.defaults.baseURL}${file.downloadUrl}`;
                    link.download = file.filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                >
                  下载
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={<FileExcelOutlined style={{ fontSize: 24, color: '#52c41a' }} />}
                title={file.filename}
                description={
                  <Space>
                    <Text type="secondary">{(file.size / 1024).toFixed(1)}KB</Text>
                    <Text type="secondary">{file.age}小时前</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </Card>
  );
};

export default FinancialExport;

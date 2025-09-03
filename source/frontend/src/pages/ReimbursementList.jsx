import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Card, Space, Select, Input, Tag, Typography, Row, Col, Spin, Modal, message, Checkbox } from 'antd';
import { SearchOutlined, DownloadOutlined, CheckOutlined, CloseOutlined, EyeOutlined, FileTextOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, loanApi, reimbursementApi } from '../utils/api';
import { mapLoanStatusToZh } from '../types/loanStatus';
import { exportToCsv } from '../utils/csvExport';

const { Title, Text } = Typography;
const { Option } = Select;

// 状态映射
const statusMap = {
  'submitted': '已提交',
  'finance_approved': '财务已审核', 
  'manager_approved': '总经理已审批',
  'paid': '已打款',
  'rejected': '已驳回',
  // 支持中文状态
  '待财务审核': '待财务审核',
  '财务已审核': '财务已审核',
  '总经理已审批': '总经理已审批',
  '已打款': '已打款',
  '已驳回': '已驳回'
};

// 状态颜色配置
const getStatusColor = (status) => {
  switch (status) {
    case 'submitted': 
    case '待财务审核': return 'processing';
    case 'finance_approved': 
    case '财务已审核': return 'warning'; 
    case 'manager_approved': 
    case '总经理已审批': return 'success';
    case 'paid': 
    case '已打款': return 'success';
    case 'rejected': 
    case '已驳回': return 'error';
    default: return 'default';
  }
};

// 获取用户信息函数
const getUserRole = () => {
  try {
    return JSON.parse(localStorage.getItem('user'))?.role || localStorage.getItem('role') || '';
  } catch {
    return localStorage.getItem('role') || '';
  }
};

// 统一角色命名（中文->英文键）仅用于前端判断
const normalizeRole = (r) => {
  if (r === '财务') return 'finance';
  if (r === '总经理') return 'manager';
  if (r === '管理员') return 'admin';
  return r || '';
};

const getUserId = () => {
  try {
    return JSON.parse(localStorage.getItem('user'))?.id || localStorage.getItem('userId') || '';
  } catch {
    return localStorage.getItem('userId') || '';
  }
};

const ReimbursementList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = normalizeRole(getUserRole());
  const userId = getUserId();

  // 判断当前页面类型
  const isApprovalArea = location.search.includes('todo=1') || location.search.includes('all=1') || userRole === 'finance';
  const isPersonalArea = !isApprovalArea;

  // 标签页配置
  const TABS = [
    { key: 'todo', label: '待办审批', count: 0 },
    { key: 'all', label: '全部申请', count: 0 }
  ];

  const [activeTab, setActiveTab] = useState(() => {
    if (location.search.includes('todo=1')) return 'todo';
    if (location.search.includes('all=1')) return 'all';
    return 'todo';
  });

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [forms, setForms] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');

  // 个人表单状态
  const [myForms, setMyForms] = useState([]);
  const [myLoading, setMyLoading] = useState(false);

  // 混合审批状态
  const [mixedApprovalVisible, setMixedApprovalVisible] = useState(false);
  const [currentForm, setCurrentForm] = useState(null);
  const [formRecords, setFormRecords] = useState([]);
  const [selectedApproved, setSelectedApproved] = useState([]);
  const [selectedRejected, setSelectedRejected] = useState([]);
  const [approvalComment, setApprovalComment] = useState('');

  // 确认打款弹窗相关
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payingForm, setPayingForm] = useState(null);
  const [paymentNote, setPaymentNote] = useState('');
  const [payLoanLinks, setPayLoanLinks] = useState([]); // [{loan_id, offset_amount}]
  const [availableLoans, setAvailableLoans] = useState([]);
  const [repayLoans, setRepayLoans] = useState([]);
  const [cashRepayLoanId, setCashRepayLoanId] = useState('');
  const [cashRepayAmount, setCashRepayAmount] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const handleTabChange = (key) => {
    setActiveTab(key);
    setPage(1);
    const params = new URLSearchParams();
    params.set(key, '1');
    navigate(`?${params.toString()}`);
  };

  // 导出报销记录为Excel
  const exportReimbursementToExcel = async () => {
    try {
      alert('导出功能测试 - 开始执行');

      // 获取所有报销记录（不分页）
      const response = await api.get('/api/reimbursement/reimbursement-forms?all=1');
      const allForms = response.data || [];

      alert(`获取到 ${allForms.length} 条报销记录`);

      // 简化的Excel数据
      const excelData = [];

      allForms.forEach(form => {
        if (form.records && form.records.length > 0) {
          form.records.forEach((record, index) => {
            excelData.push({
              '报销单ID': form.id,
              '申请人': form.real_name || form.username,
              '明细金额': record.amount,
              '明细用途': record.purpose,
              '明细类型': record.type || '',
              '状态': form.status,
              '申请时间': form.created_at || ''
            });
          });
        } else {
          excelData.push({
            '报销单ID': form.id,
            '申请人': form.real_name || form.username,
            '明细金额': '',
            '明细用途': '',
            '明细类型': '',
            '状态': form.status,
            '申请时间': form.created_at || ''
          });
        }
      });

      // 导出为CSV格式
      const fileName = `报销记录_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}`;
      exportToCsv(excelData, fileName);

      alert(`导出成功！共导出 ${excelData.length} 条报销记录`);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败：' + error.message);
    }
  };

  // 获取数据
  const fetchForms = useCallback(async () => {
    if (isPersonalArea) return;
    
    setLoading(true);
    try {
      const params = {
        page,
        pageSize,
        search,
        status: statusFilter,
        real_name: nameFilter
      };

      if (activeTab === 'todo') {
        params.todo = '1';
      }

      const response = await api.get('/api/reimbursement/reimbursement-forms', { params });
      
      if (response.data && Array.isArray(response.data)) {
        // 后端直接返回数组
        setForms(response.data || []);
        setTotal(response.data.length || 0);
      } else if (response.data?.success) {
        setForms(response.data.data || []);
        setTotal(response.data.total || 0);
      } else {
        setForms(response.data || []);
        setTotal(response.data?.length || 0);
      }
    } catch (error) {
      console.error('获取报销表单失败:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, nameFilter, activeTab, isPersonalArea]);

  // 获取个人数据
  const fetchMyForms = useCallback(async () => {
    if (!isPersonalArea) return;
    
    setMyLoading(true);
    try {
      const response = await api.get('/api/reimbursement/my-reimbursement-forms');
      if (response.data?.success) {
        setMyForms(response.data.data || []);
      } else {
        message.error('获取个人数据失败');
      }
    } catch (error) {
      console.error('获取个人报销表单失败:', error);
      message.error('获取个人数据失败');
    } finally {
      setMyLoading(false);
    }
  }, [isPersonalArea]);

  useEffect(() => {
    if (isApprovalArea) {
      fetchForms();
    } else {
      fetchMyForms();
    }
  }, [fetchForms, fetchMyForms, isApprovalArea]);

  // 审批操作
  const handleApproval = async (record, action) => {
    try {
      let response;
      if (action === 'approve') {
        response = await api.post(`/api/reimbursement/reimbursement-forms/${record.id}/approve`, {
          comment: ''
        });
      } else {
        response = await api.post(`/api/reimbursement/reimbursement-forms/${record.id}/reject`, {
          comment: ''
        });
      }
      
      console.log('审批响应:', response.data);
      
      if (response.data?.success || response.status === 200) {
        message.success(`${action === 'approve' ? '同意' : '驳回'}操作成功`);
        await fetchForms();
      } else {
        message.error(response.data?.message || response.data?.msg || '操作失败');
      }
    } catch (error) {
      console.error('审批操作失败:', error);
      message.error(error.response?.data?.msg || '操作失败，请重试');
    }
  };

  // 混合审批功能
  const handleMixedApproval = async (record) => {
    try {
      // 获取表单详情和明细
      const response = await api.get(`/api/reimbursement/reimbursement-forms/${record.id}`);
      if (response.data?.success) {
        const formData = response.data.data;
        setCurrentForm(formData);
        
        // 解析表单记录
        let records = [];
        try {
          records = JSON.parse(formData.records || '[]');
        } catch (e) {
          console.error('解析表单记录失败:', e);
          records = [];
        }
        
        setFormRecords(records);
        setSelectedApproved([]);
        setSelectedRejected([]);
        setApprovalComment('');
        setMixedApprovalVisible(true);
      }
    } catch (error) {
      console.error('获取表单详情失败:', error);
      message.error('获取表单详情失败');
    }
  };

  const handleMixedApprovalSubmit = async () => {
    try {
      if (selectedApproved.length === 0 && selectedRejected.length === 0) {
        message.warning('请至少选择一项进行审批');
        return;
      }

      console.log('提交混合审批:', {
        formId: currentForm.id,
        approvedIds: selectedApproved.map(id => parseInt(id)),
        rejectedIds: selectedRejected.map(id => parseInt(id)),
        comment: approvalComment
      });

      const response = await api.post(`/api/reimbursement/reimbursement-forms/${currentForm.id}/mixed-approve`, {
        approvedIds: selectedApproved.map(id => parseInt(id)),
        rejectedIds: selectedRejected.map(id => parseInt(id)),
        comment: approvalComment
      });

      if (response.data?.success) {
        message.success('混合审批操作成功');
        setMixedApprovalVisible(false);
        await fetchForms();
      } else {
        message.error(response.data?.message || '操作失败');
      }
    } catch (error) {
      console.error('混合审批失败:', error);
      message.error('操作失败，请重试');
    }
  };

  // PDF下载
  const handleDownloadPDF = async (record) => {
    try {
      const response = await api.get(`/api/reimbursement/reimbursement-forms/${record.id}/pdf`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `报销单_${record.form_number || record.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF下载失败:', error);
      message.error('PDF下载失败');
    }
  };

  // 表格列定义 - 审批区域
  const approvalColumns = [
    {
      title: '表单编号',
      dataIndex: 'form_number',
      key: 'form_number',
      width: 140,
      render: (text) => text || '待生成'
    },
    {
      title: '申请人',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 100
    },
    {
      title: '申请事由',
      dataIndex: 'purpose',
      key: 'purpose',
      width: 200,
      ellipsis: true
    },
    {
      title: '借款金额',
      dataIndex: 'loan_amount',
      key: 'loan_amount',
      width: 100,
      render: (amount) => amount ? `¥${amount}` : '-'
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 100,
      render: (amount) => `¥${amount}`
    },
    {
      title: '净付金额',
      dataIndex: 'net_payment',
      key: 'net_payment',
      width: 100,
      render: (amount) => `¥${amount || 0}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {statusMap[status] || status}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (time) => dayjs(time).format('MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      width: 300,
      fixed: 'right',
      render: (_, record) => {
        // 财务人员可以审批：待财务审核状态
        const canFinanceApprove = userRole === 'finance' && record.status === '待财务审核';
        
        // 总经理可以审批：财务已审核状态
        const canManagerApprove = userRole === 'manager' && record.status === '财务已审核';
        
  // 财务可执行打款：总经理已审批
  const canFinancePay = userRole === 'finance' && (record.status === '总经理已审批' || record.status === 'manager_approved');

  // 综合判断是否可以审批
        const canApprove = canFinanceApprove || canManagerApprove;
        
        // 调试信息
        console.log('审批权限检查:', {
          recordId: record.id,
          userRole,
          recordStatus: record.status,
          canFinanceApprove,
          canManagerApprove,
          canApprove
        });
        
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/reimbursement/detail/${record.id}`)}
            >
              查看
            </Button>
            
            {canApprove && (
              <>
                <Button
                  type="link"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => handleApproval(record, 'approve')}
                  style={{ color: '#52c41a' }}
                >
                  同意
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => handleApproval(record, 'reject')}
                  danger
                >
                  驳回
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleMixedApproval(record)}
                  style={{ color: '#1890ff' }}
                >
                  混合审批
                </Button>
              </>
            )}

            {canFinancePay && (
              <Button
                type="link"
                size="small"
                onClick={async () => {
                  // 打开弹窗并预拉该用户可冲抵借款
                  setPayingForm(record);
                  setPaymentNote('');
                  setPayLoanLinks([]);
                  setCashRepayLoanId('');
                  setCashRepayAmount('');
                  setPayModalVisible(true);
                  try {
                    let uid = record.user_id;
                    if (!uid) {
                      const detail = await api.get(`/api/reimbursement/reimbursement-forms/${record.id}`);
                      uid = detail.data?.user_id;
                    }
                    if (uid) {
                      // 可冲抵的借款列表
                      const res = await api.get(`/api/reimbursement/users/${uid}/available-loans`);
                      setAvailableLoans(res.data || []);
                      // 现金还款可选的借款（财务可查指定用户所有贷款，过滤待归还/部分还款 + 有余额）
                      const resAll = await api.get(`/api/loans?userId=${uid}`);
                      const listAll = resAll.data?.loans || resAll.data || [];
                      const eligible = listAll.filter(l => ['paid','partial_repaid','待归还','部分还款'].includes(l.status) && (l.remaining_amount || 0) > 0);
                      setRepayLoans(eligible);
                    } else {
                      setAvailableLoans([]);
                      setRepayLoans([]);
                    }
                  } catch (e) {
                    setAvailableLoans([]);
                    setRepayLoans([]);
                  }
                }}
                style={{ color: '#52c41a' }}
              >
                确认打款
              </Button>
            )}
            
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownloadPDF(record)}
            >
              PDF
            </Button>
          </Space>
        );
      }
    }
  ];

  // 表格列定义 - 个人区域
  const personalColumns = [
    {
      title: '表单编号',
      dataIndex: 'form_number',
      key: 'form_number',
      width: 140,
      render: (text) => text || '待生成'
    },
    {
      title: '申请事由',
      dataIndex: 'purpose',
      key: 'purpose',
      width: 200,
      ellipsis: true
    },
    {
      title: '借款金额',
      dataIndex: 'loan_amount',
      key: 'loan_amount',
      width: 100,
      render: (amount) => amount ? `¥${amount}` : '-'
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 100,
      render: (amount) => `¥${amount}`
    },
    {
      title: '净付金额',
      dataIndex: 'net_payment',
      key: 'net_payment',
      width: 100,
      render: (amount) => `¥${amount || 0}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {statusMap[status] || status}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (time) => dayjs(time).format('MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/reimbursement/detail/${record.id}`)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadPDF(record)}
          >
            PDF
          </Button>
        </Space>
      )
    }
  ];

  // 筛选控件
  const renderFilters = () => (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={6}>
        <Input
          placeholder="搜索表单编号或事由"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => setPage(1)}
        />
      </Col>
      <Col span={4}>
        <Select
          placeholder="状态筛选"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          style={{ width: '100%' }}
        >
          {['草稿','待财务审核','财务已审核','总经理已审批','已打款','已驳回'].map(v => (
            <Option key={v} value={v}>{v}</Option>
          ))}
        </Select>
      </Col>
      {isApprovalArea && (
        <Col span={4}>
          <Input
            placeholder="申请人姓名"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </Col>
      )}
      <Col span={6}>
        <Space>
          <Button type="primary" onClick={() => setPage(1)}>
            搜索
          </Button>
          <Button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setNameFilter('');
              setPage(1);
            }}
          >
            重置
          </Button>

          {/* 测试按钮 - 显示当前角色 */}
          <button
            onClick={() => alert(`当前角色: "${userRole}", 原始角色: "${getUserRole()}", 是否finance: ${userRole === 'finance'}`)}
            style={{
              padding: '6px 12px',
              background: '#ff4d4f',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '14px',
              marginLeft: '8px'
            }}
          >
            测试角色
          </button>

          {/* 财务人员可导出Excel */}
          {userRole === 'finance' && (
            <button
              onClick={exportReimbursementToExcel}
              style={{
                padding: '6px 12px',
                background: '#52c41a',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '14px',
                marginLeft: '8px'
              }}
            >
              📊 导出报销记录
            </button>
          )}

          {/* 强制显示的导出按钮 - 无条件 */}
          <button
            onClick={exportReimbursementToExcel}
            style={{
              padding: '6px 12px',
              background: '#1890ff',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '14px',
              marginLeft: '8px'
            }}
          >
            🔧 强制导出
          </button>
        </Space>
      </Col>
    </Row>
  );

  if (isPersonalArea) {
    return (
      <div style={{ padding: '24px' }}>
        <Title level={2}>我的报销申请</Title>



        {renderFilters()}

        <Card>
          <Table
            columns={personalColumns}
            dataSource={myForms}
            loading={myLoading}
            rowKey="id"
            scroll={{ x: 1200 }}
            pagination={false}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* 顶部测试区域 */}
      <div style={{ marginBottom: 16, padding: 8, background: '#f0f0f0', border: '1px solid #ccc' }}>
        <strong>调试信息：</strong> userRole="{userRole}", getUserRole()="{getUserRole()}"
        <br />
        <button
          onClick={() => alert(`角色信息: userRole="${userRole}", getUserRole()="${getUserRole()}", 判断结果: ${userRole === 'finance'}`)}
          style={{ marginTop: 8, padding: '4px 8px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: 4 }}
        >
          点击查看角色
        </button>
        <button
          onClick={exportReimbursementToExcel}
          style={{ marginTop: 8, marginLeft: 8, padding: '4px 8px', background: '#52c41a', color: '#fff', border: 'none', borderRadius: 4 }}
        >
          强制导出测试
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2}>报销申请审批</Title>
        <Space>
          {TABS.map(tab => (
            <Button
              key={tab.key}
              type={activeTab === tab.key ? 'primary' : 'default'}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label} {tab.count > 0 && `(${tab.count})`}
            </Button>
          ))}
        </Space>
      </div>

      {renderFilters()}

      <Card>
        <Table
          columns={approvalColumns}
          dataSource={forms}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1400 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            onChange: setPage
          }}
        />
      </Card>

      {/* 混合审批对话框 */}
      <Modal
        title="混合审批"
        open={mixedApprovalVisible}
        onCancel={() => setMixedApprovalVisible(false)}
        onOk={handleMixedApprovalSubmit}
        width={800}
        okText="提交审批"
        cancelText="取消"
      >
        {currentForm && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text strong>表单编号：</Text>{currentForm.form_number || '待生成'}
              <br />
              <Text strong>申请人：</Text>{currentForm.real_name}
              <br />
              <Text strong>申请事由：</Text>{currentForm.purpose}
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <Text strong>报销明细：</Text>
              <Table
                size="small"
                columns={[
                  {
                    title: '选择',
                    width: 80,
                    render: (_, record, index) => (
                      <div>
                        <div>
                          <Checkbox
                            checked={selectedApproved.includes(index)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedApproved([...selectedApproved, index]);
                                setSelectedRejected(selectedRejected.filter(id => id !== index));
                              } else {
                                setSelectedApproved(selectedApproved.filter(id => id !== index));
                              }
                            }}
                          >
                            同意
                          </Checkbox>
                        </div>
                        <div>
                          <Checkbox
                            checked={selectedRejected.includes(index)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRejected([...selectedRejected, index]);
                                setSelectedApproved(selectedApproved.filter(id => id !== index));
                              } else {
                                setSelectedRejected(selectedRejected.filter(id => id !== index));
                              }
                            }}
                          >
                            驳回
                          </Checkbox>
                        </div>
                      </div>
                    )
                  },
                  { title: '费用类型', dataIndex: 'type', width: 100 },
                  { title: '金额', dataIndex: 'amount', width: 80, render: (amount) => `¥${amount}` },
                  { title: '备注', dataIndex: 'description', ellipsis: true }
                ]}
                dataSource={formRecords}
                pagination={false}
                rowKey={(record, index) => index}
              />
            </div>
            
            <div>
              <Text strong>审批意见：</Text>
              <Input.TextArea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="请输入审批意见（可选）"
                rows={3}
                style={{ marginTop: 8 }}
              />
            </div>
          </div>
        )}
      </Modal>
      {/* 确认打款弹窗：借款冲抵 + 现金还款入口 */}
      <Modal
        open={payModalVisible}
        title={payingForm ? `确认打款 - ${payingForm.real_name || ''}（编号：${payingForm.form_number || payingForm.id}）` : '确认打款'}
        onCancel={() => setPayModalVisible(false)}
        onOk={async () => {
          try {
            setSubmittingPay(true);
            // 可选先执行一次现金还款
            if (cashRepayLoanId && Number(cashRepayAmount) > 0) {
              await loanApi.repay(cashRepayLoanId, { amount: Number(cashRepayAmount) });
            }
            // 确认打款并携带借款冲抵
            const payload = { payment_note: paymentNote };
            const links = (payLoanLinks || [])
              .filter(l => l.loan_id && Number(l.offset_amount) > 0)
              .map(l => ({ loan_id: Number(l.loan_id), offset_amount: Number(l.offset_amount) }));
            if (links.length > 0) payload.loan_links = links;
            await reimbursementApi.confirmPayment(payingForm.id, payload);
            message.success('打款确认成功');
            setPayModalVisible(false);
            setPayingForm(null);
            setAvailableLoans([]);
            await fetchForms();
          } catch (e) {
            message.error(e?.response?.data?.msg || '确认打款失败');
          } finally {
            setSubmittingPay(false);
          }
        }}
        okButtonProps={{ loading: submittingPay }}
        width={720}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text strong>打款备注：</Text>
            <Input.TextArea value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="可填写打款流水、备注等" rows={2} />
          </div>
          <div>
            <Text strong>借款冲抵：</Text>
            <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
              {(payLoanLinks || []).map((link, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <Select
                    style={{ width: 300 }}
                    placeholder="选择借款"
                    value={link.loan_id}
                    onChange={(v) => {
                      const next = [...payLoanLinks];
                      next[idx] = { ...next[idx], loan_id: v };
                      setPayLoanLinks(next);
                    }}
                    options={(availableLoans || []).map(l => ({
                      label: `#${l.id} 余额¥${l.remaining_amount}（${mapLoanStatusToZh(l.status)}） ${l.purpose || ''}`,
                      value: l.id
                    }))}
                  />
                  <Input
                    style={{ width: 180 }}
                    type="number"
                    placeholder="冲抵金额"
                    value={link.offset_amount}
                    onChange={e => {
                      const next = [...payLoanLinks];
                      next[idx] = { ...next[idx], offset_amount: e.target.value };
                      setPayLoanLinks(next);
                    }}
                  />
                  <Button danger onClick={() => setPayLoanLinks(payLoanLinks.filter((_, i) => i !== idx))}>删除</Button>
                </div>
              ))}
              <Button type="dashed" onClick={() => setPayLoanLinks([...(payLoanLinks || []), { loan_id: '', offset_amount: '' }])}>+ 添加一条冲抵</Button>
            </div>
          </div>
          <div>
            <Text strong>现金还款（可选，独立于本次打款）：</Text>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <Select
                style={{ width: 300 }}
                placeholder="选择借款"
                value={cashRepayLoanId}
                onChange={setCashRepayLoanId}
                options={(repayLoans.length ? repayLoans : availableLoans).map(l => ({
                  label: `#${l.id} 余额¥${l.remaining_amount}（${mapLoanStatusToZh(l.status)}） ${l.purpose || ''}`,
                  value: l.id
                }))}
              />
              <Input
                style={{ width: 180 }}
                type="number"
                placeholder="还款金额"
                value={cashRepayAmount}
                onChange={e => setCashRepayAmount(e.target.value)}
              />
              <span style={{ color: '#888' }}>将调用借款“现金还款”接口</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ReimbursementList;

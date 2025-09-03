import React, { useEffect, useState } from 'react';
import { Table, Button, Card, Tag, Space, message, DatePicker } from 'antd'; // 修复日期格式显示问题
import { EyeOutlined, EditOutlined, FileTextOutlined, ReloadOutlined, AuditOutlined, DollarOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, reimbursementApi } from '../utils/api';
// 新增：打款弹窗相关组件
import { Modal, Checkbox, InputNumber, Form, Typography, Divider, List, Tooltip } from 'antd';

import { exportToCsv } from '../utils/csvExport';
// 显示文本映射
const statusMap = {
  '草稿': '草稿',
  '待财务审核': '待财务审核',
  '已驳回': '已驳回',
  '财务已审核': '财务已审核',
  '总经理已审批': '总经理已审批',
  '已打款': '已打款',
  // 英文兼容
  'submitted': '已提交',
  'finance_approved': '财务已审核',
  'manager_approved': '总经理已审批',
  'paid': '已打款',
  'rejected': '已驳回'
};

const getStatusColor = (status) => {
  switch (status) {
    case '草稿': return 'default';
    case '待财务审核':
    case 'submitted': return 'processing';
    case '已驳回':
    case 'rejected': return 'error';
    case '财务已审核':
    case 'finance_approved': return 'warning';
    case '总经理已审批':
    case 'manager_approved': return 'success';
    case '已打款':
    case 'paid': return 'success';
    default: return 'default';
  }
};

export default function ReimbursementFormList() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'todo' | 'all'
  const [nameFilter, setNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 使用中文状态值筛选
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [onlyExportable, setOnlyExportable] = useState(false);
  // 新增：筛选相关（报销审核统一使用，todo 列表本地过滤）
  const [formNumberKeyword, setFormNumberKeyword] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState(''); // 新增开始日期 (YYYY-MM-DD)
  const [endDate, setEndDate] = useState('');     // 新增结束日期 (YYYY-MM-DD)
  // 新增：打款弹窗状态
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentFormDetail, setPaymentFormDetail] = useState(null); // 报销单详情
  const [availableLoans, setAvailableLoans] = useState([]); // 可冲抵借款
  const [useCash, setUseCash] = useState(true);
  const [useOffset, setUseOffset] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [loanOffsets, setLoanOffsets] = useState({}); // { loan_id: amount }

  const navigate = useNavigate();
  const location = useLocation();

  const isReviewMode = location.search.includes('todo=1');
  const isMyMode = location.search.includes('my=1');
  const userRole = localStorage.getItem('role');
  const isReviewer = ['finance', 'manager', 'admin'].includes(userRole || '');
  // 当前登录用户ID，用于判定是否可“重新编辑”
  const currentUserId = (() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.id || localStorage.getItem('user_id');
    } catch {
      return localStorage.getItem('user_id');
    }
  })();
  // 个人视图（my=1）下不展示审批操作
  const showReviewAction = !isMyMode && isReviewer && (activeTab === 'todo' || isReviewMode);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const params = {};
      if (isMyMode) {
        params.my = 1;
      } else if (activeTab === 'todo') {
        params.todo = 1; // 待办统一由后端按角色筛选基础集合，后续本地再细分
      } else {
        if (nameFilter) params.real_name = nameFilter;
        if (statusFilter) params.status = statusFilter;
      }
      const res = await api.get('/api/reimbursement/reimbursement-forms', { params });
      let data = res.data || [];
      // 待办模式下的本地过滤（后端不支持姓名/金额等扩展参数）
      if (activeTab === 'todo') {
        data = data.filter(item => {
          if (formNumberKeyword && !(item.form_number||'').includes(formNumberKeyword.trim())) return false;
          if (nameFilter && !(item.real_name||'').includes(nameFilter.trim())) return false;
          if (statusFilter) {
            const s = item.status_en || item.status;
            const zh = statusMap[s] || statusMap[item.status] || item.status;
            if (!(zh === statusFilter || item.status === statusFilter)) return false;
          }
          if (minAmount && Number(item.total_amount || 0) < Number(minAmount)) return false;
          if (maxAmount && Number(item.total_amount || 0) > Number(maxAmount)) return false;
          if (startDate || endDate) {
            const t = item.created_at ? dayjs(item.created_at) : null;
            if (t) {
              if (startDate && t.isBefore(dayjs(startDate).startOf('day'))) return false;
              if (endDate && t.isAfter(dayjs(endDate).endOf('day'))) return false;
            }
          }
          return true;
        });
      } else {
        // 全部视图服务器端基础筛选后再做可导出/金额/日期本地过滤
        if (minAmount || maxAmount || startDate || endDate) {
          data = data.filter(item => {
            const amt = Number(item.total_amount || 0);
            if (minAmount && amt < Number(minAmount)) return false;
            if (maxAmount && amt > Number(maxAmount)) return false;
            if (startDate || endDate) {
              const t = item.created_at ? dayjs(item.created_at) : null;
              if (t) {
                if (startDate && t.isBefore(dayjs(startDate).startOf('day'))) return false;
                if (endDate && t.isAfter(dayjs(endDate).endOf('day'))) return false;
              }
            }
            return true;
          });
        }
      }
      if (onlyExportable) {
        data = data.filter(item => {
          const s = item.status_en || item.status;
          return ['finance_approved','manager_approved','paid','rejected','财务已审核','总经理已审批','已打款','已驳回'].includes(s);
        });
      }
      setForms(Array.isArray(data) ? data : []);
      setSelectedRowKeys([]);
    } catch (e) {
      message.error(e.response?.data?.msg || '获取报销单失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除报销单
  const handleDeleteForm = async (formId) => {
    if (!window.confirm('确定删除该报销单？删除后无法恢复。')) return;

    try {
      await api.delete(`/api/reimbursement/reimbursement-forms/${formId}`);
      message.success('删除成功');
      fetchForms();
    } catch (e) {
      message.error(e?.response?.data?.message || e?.response?.data?.msg || '删除失败');
    }
  };

  // URL 模式与标签联动：?todo=1 => 待办；?my=1 => 个人区仅显示“全部”（我的）
  useEffect(() => {
    if (isReviewMode && activeTab !== 'todo') setActiveTab('todo');
    if (isMyMode && activeTab !== 'all') setActiveTab('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewMode, isMyMode]);

  // 自动拉取数据
  useEffect(() => {
    fetchForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, nameFilter, statusFilter, location.search, onlyExportable, formNumberKeyword, minAmount, maxAmount, startDate, endDate]);

    const columns = [
      // 将标题从纯字符串改为元素，避免 antd 在可排序表头上自动注入空 title 属性
      ...(isReviewer ? [{ title: <span>报销人</span>, dataIndex: 'real_name', key: 'real_name', width: 140, render: (v) => v || '—' }] : []),
      { title: <span>报销单号</span>, dataIndex: 'form_number', key: 'form_number', width: 160 },
      { title: <span>总金额</span>, dataIndex: 'total_amount', key: 'total_amount', width: 120, render: (a) => `¥${a || 0}` },
      { title: <span>状态</span>, dataIndex: 'status_en', key: 'status', width: 140, render: (s, record) => {
        const zh = statusMap[s] || statusMap[record.status];
        const label = zh || record.status || s || '-';
        const color = getStatusColor(s || record.status);
        return <Tag color={color}>{label}</Tag>;
      } },
      { title: <span>创建时间</span>, dataIndex: 'created_at', key: 'created_at', width: 160, render: (t) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '' },
      {
        title: '操作', key: 'action', width: 260,
        render: (_, record) => {
          const isOwner = String(record.user_id) === String(currentUserId || '');
          const statusEn = record.status_en || record.status;
          const isFinance = (userRole === 'finance');
          const canPay = isFinance && (statusEn === 'manager_approved' || record.status === '总经理已审批' || statusEn === 'approved');
          return (
            <Space size="small">
              {showReviewAction ? (
                canPay ? (
                  <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openPaymentModal(record)}>
                    打款
                  </Button>
                ) : (
                  <Button size="small" type="primary" icon={<AuditOutlined />} onClick={() => navigate(`/reimbursement-forms/${record.id}`)}>审核</Button>
                )
              ) : (
                <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/reimbursement-forms/${record.id}`)}>详情</Button>
              )}
              {/* 显式入口：待财务审核可撤回 */}
              {!showReviewAction && isOwner && (statusEn === 'submitted' || record.status === '待财务审核') && (
                <Button
                  size="small"
                  onClick={async () => {
                    if (!window.confirm('确定撤回该报销单？')) return;
                    try {
                      await api.post(`/api/reimbursement/reimbursement-forms/${record.id}/withdraw`);
                      message.success('已撤回为草稿');
                      fetchForms();
                    } catch (e) {
                      message.error(e?.response?.data?.msg || '撤回失败');
                    }
                  }}
                >撤回</Button>
              )}
              {!showReviewAction && isOwner && (record.status === 'rejected' || record.status === '已驳回' || record.status === '草稿' || statusEn === 'draft') && (
                <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => navigate(`/reimbursement-forms/edit/${record.id}`)} style={{ backgroundColor: '#faad14', borderColor: '#faad14' }}>重新编辑</Button>
              )}
              {/* 删除按钮：仅草稿状态可删除 */}
              {!showReviewAction && isOwner && (record.status === '草稿' || statusEn === 'draft') && (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteForm(record.id)}
                >
                  删除
                </Button>
              )}
              {/* 显式入口：仅已驳回可重新提交（草稿状态应该编辑后再提交） */}
              {!showReviewAction && isOwner && (['rejected','已驳回'].includes(String(statusEn)) || ['rejected','已驳回'].includes(String(record.status))) && (
                <Button
                  size="small"
                  type="primary"
                  onClick={async () => {
                    try {
                      await api.post(`/api/reimbursement/reimbursement-forms/${record.id}/submit`);
                      message.success('已提交至待财务审核');
                      fetchForms();
                    } catch (e) {
                      message.error(e?.response?.data?.msg || '重新提交失败');
                    }
                  }}
                >重新提交</Button>
              )}
              {!showReviewAction && (record.status === 'paid' || record.status === '已打款') && (
                <Button size="small" icon={<FileTextOutlined />} onClick={async () => {
                  try {
                    const response = await api.get(`/api/reimbursement/reimbursement-forms/${record.id}/pdf`, { responseType: 'blob' });
                    const blob = response.data;
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `reimbursement_form_${record.form_number}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  } catch (err) { message.error('下载失败'); }
                }}>下载PDF</Button>
              )}
            </Space>
          );
        }
      }
    ];

  // 新增：打开打款弹窗
  const openPaymentModal = async (record) => {
    try {
      // 拉取详情以获得净额/已抵扣金额
      const detailRes = await api.get(`/api/reimbursement/reimbursement-forms/${record.id}`);
      const detail = detailRes.data || {};
      // 拉取可用借款（按后端约束：财务已审核/总经理已审批 且 remaining_amount>0）
      const loansRes = await api.get(`/api/reimbursement/users/${detail.user_id}/available-loans`);
      const loans = Array.isArray(loansRes.data) ? loansRes.data : [];
      setPaymentFormDetail(detail);
      setAvailableLoans(loans);
      // 初始化：默认现金打款，金额=净额（若有）否则总额
      const net = detail?.summary?.net_payment_amount ?? detail?.total_amount ?? 0;
      setUseCash(true);
      setUseOffset(false);
      // 默认值改为报销单总额
      setCashAmount(Number(detail?.total_amount || 0));
      setLoanOffsets({});
      setPaymentVisible(true);
    } catch (e) {
      message.error(e.response?.data?.msg || '打开打款窗口失败');
    }
  };

  // 新增：提交打款
  const submitPayment = async () => {
    if (!paymentFormDetail) return;
    const formId = paymentFormDetail.id;
    const total = Number(paymentFormDetail?.total_amount || 0);
    const existedOffset = Number(paymentFormDetail?.loan_offset_amount || paymentFormDetail?.summary?.loan_offset_amount || 0);
    const netBefore = Number(paymentFormDetail?.summary?.net_payment_amount ?? (total - existedOffset));

    const links = Object.entries(loanOffsets)
      .map(([loan_id, amt]) => ({ loan_id: Number(loan_id), offset_amount: Number(amt) || 0 }))
      .filter(x => x.offset_amount > 0);

    const sumOffset = links.reduce((s, x) => s + x.offset_amount, 0);

    if (!useCash && !useOffset) {
      message.warning('请选择至少一种支付方式');
      return;
    }

    // 校验：冲抵金额不超过可用净额
    if (useOffset) {
      if (sumOffset <= 0) {
        message.warning('请输入冲抵金额');
        return;
      }
      if (sumOffset - 1e-6 > netBefore) {
        message.error('冲抵金额不能超过应付净额');
        return;
      }
      // 单笔校验：不得超过借款剩余
      for (const l of links) {
        const loan = availableLoans.find(x => Number(x.id) === Number(l.loan_id));
        if (!loan) { message.error(`借款 ${l.loan_id} 不可用`); return; }
        if (l.offset_amount - 1e-6 > Number(loan.remaining_amount || 0)) {
          message.error(`借款 ${l.loan_id} 冲抵金额超过剩余额度`);
          return;
        }
      }
    }

    // 现金金额仅记录在备注中用于审计（后端当前不验证现金金额）
    const cash = useCash ? Number(cashAmount || 0) : 0;
    if (useCash) {
      if (cash < 0) { message.error('现金打款金额不能为负'); return; }
    }

    setPaymentSubmitting(true);
    try {
      const noteParts = [];
      if (useCash) noteParts.push(`现金打款金额: ¥${cash.toFixed(2)}`);
      if (useOffset) noteParts.push(`借款冲抵合计: ¥${sumOffset.toFixed(2)}`);
      const payment_note = noteParts.join('；');

      await api.post(`/api/reimbursement/reimbursement-forms/${formId}/confirm-payment`, {
        payment_note,
        loan_links: useOffset ? links : []
      });
      message.success('打款确认成功');
      setPaymentVisible(false);
      // 刷新列表
      fetchForms();
    } catch (e) {
      message.error(e.response?.data?.msg || '打款失败');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // 计算建议现金金额（净额-冲抵）
  const computeSuggestedCash = () => {
    if (!paymentFormDetail) return 0;
    const total = Number(paymentFormDetail?.total_amount || 0);
    const existedOffset = Number(paymentFormDetail?.loan_offset_amount || paymentFormDetail?.summary?.loan_offset_amount || 0);
    const netBefore = Number(paymentFormDetail?.summary?.net_payment_amount ?? (total - existedOffset));
    const sumOffset = Object.values(loanOffsets).reduce((s, x) => s + (Number(x) || 0), 0);
    return Math.max(0, netBefore - sumOffset);
  };

  // 导出所有报销“记录”（逐条明细）为 Excel（仅财务/总经理/管理员）
  const exportReimbursementRecords = async () => {
    try {
      // 1. 先获取报销单列表
      const formsRes = await api.get('/api/reimbursement/reimbursement-forms', { params: { ...(activeTab==='todo'?{todo:1}:{}) } });
      const forms = Array.isArray(formsRes.data) ? formsRes.data : [];
      console.log('获取到的报销单数据:', forms);
      console.log('报销单数量:', forms.length);

      const rows = [];

      // 2. 为每个报销单获取详情（包含records）
      for (const form of forms) {
        try {
          console.log(`获取报销单 ${form.id} 的详情...`);
          const detailRes = await api.get(`/api/reimbursement/reimbursement-forms/${form.id}`);
          const detail = detailRes.data;
          const records = Array.isArray(detail.records) ? detail.records : [];
          console.log(`报销单 ${form.id} 的记录数量:`, records.length);

          // 3. 处理每条报销记录
          records.forEach((record, recordIndex) => {
            console.log(`处理记录 ${recordIndex + 1}:`, record);
            rows.push({
              // 报销记录的核心信息
              '记录ID': record.id || '',
              '记录金额': record.amount || 0,
              '记录用途': record.purpose || '',
              '记录类型': record.type || '',
              '记录备注': record.remark || '',

              // 发票相关信息
              '发票号': record.invoice_number || '',
              '发票日期': record.invoice_date || '',
              '发票金额': record.invoice_amount || '',

              // 业务相关信息
              '购买方': record.buyer_name || '',
              '服务名称': record.service_name || '',

              // 时间信息
              '记录创建时间': record.created_at ? dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss') : '',
              '记录更新时间': record.updated_at ? dayjs(record.updated_at).format('YYYY-MM-DD HH:mm:ss') : '',

              // 关联的报销单信息
              '所属报销单ID': form.id,
              '所属报销单号': form.form_number || '',
              '报销单申请人': detail.real_name || detail.username || form.real_name || '',
              '报销单总金额': form.total_amount || 0,
              '报销单状态': statusMap[form.status_en || form.status] || form.status || '',
              '报销单创建时间': form.created_at ? dayjs(form.created_at).format('YYYY-MM-DD HH:mm:ss') : ''
            });
          });
        } catch (detailError) {
          console.error(`获取报销单 ${form.id} 详情失败:`, detailError);
        }
      }
      if (rows.length === 0) {
        message.warning('没有找到报销记录明细数据');
        return;
      }

      // 导出为CSV格式
      exportToCsv(rows, `报销记录明细_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}`);
      message.success(`已导出 ${rows.length} 条报销记录明细`);
    } catch (e) {
      console.error(e);
      message.error(e.response?.data?.msg || '导出失败');
    }
  };

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {isMyMode ? '我的报销单' : (isReviewer ? '报销审核' : '我的报销单')}
            </h3>
            {/* 非审批视图下的提示条：显式指引撤回/重提 */}
            {!isReviewer && (
              <div style={{background:'#fffbe6',border:'1px solid #ffe58f',padding:'8px 12px',borderRadius:6,marginTop:10,color:'#614700',fontSize:13}}>
                待财务审核的报销单可以直接"撤回"为草稿；被驳回的报销单会自动锁定无法修改，员工需要基于原单创建新的报销申请；草稿状态的报销单可以进入编辑页修改后再提交。
              </div>
            )}
            {isReviewer && !isMyMode && (
              <div style={{ marginTop: 12, borderBottom: '1px solid #e8e8e8' }}>
                {['todo', 'all'].map(key => (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveTab(key);
                      // 同步 URL：todo 切换为带参，all 去掉查询参数，避免 isReviewMode 干扰
                      if (key === 'todo') {
                        navigate('/reimbursement-forms?todo=1');
                      } else {
                        navigate('/reimbursement-forms');
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      marginRight: 8,
                      border: 'none',
                      background: activeTab === key ? '#1890ff' : 'transparent',
                      color: activeTab === key ? '#fff' : '#666',
                      borderRadius: '4px 4px 0 0',
                      cursor: 'pointer'
                    }}
                  >
                    {key === 'todo' ? '待办审批' : '全部报销单'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<ReloadOutlined />} onClick={fetchForms} loading={loading}>刷新</Button>
            {(['finance','manager','admin'].includes(userRole || '')) && !isMyMode && (
              <>
                <Button onClick={exportReimbursementRecords}>导出报销记录</Button>
                <Button
                  type="primary"
                  disabled={!selectedRowKeys.length}
                  onClick={async () => {
                  try {
                    // 选择校验：如含有不可导出状态给出提示
                    const invalid = forms.filter(f => selectedRowKeys.includes(f.id)).filter(f => {
                      const s = f.status_en || f.status;
                      return !['finance_approved','manager_approved','paid','rejected','财务已审核','总经理已审批','已打款','已驳回'].includes(s);
                    });
                    if (invalid.length) {
                      message.warning(`有 ${invalid.length} 条不在可导出状态，将被跳过`);
                    }
                    const ids = selectedRowKeys;
                    if (!ids.length) return;
                    const resp = await reimbursementApi.batchDownloadZip(ids);
                    const blob = new Blob([resp.data], { type: 'application/zip' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `reimbursements_${Date.now()}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  } catch (e) {
                    message.error(e?.response?.data?.msg || '批量下载失败');
                  }
                }}
              >
                批量下载报销单（ZIP）
              </Button>
              </>
            )}
            {(!['finance','manager','admin'].includes(userRole || '')) && !isMyMode && (
              <span style={{ color:'#999' }}>仅财务/总经理/管理员可进行批量下载</span>
            )}
          </div>
        </div>

  {(isReviewer && !isMyMode) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center', background:'#fafafa', padding: '12px 12px', border:'1px solid #f0f0f0', borderRadius:6 }}>
            <input placeholder="按报销单号" value={formNumberKeyword} onChange={e=>setFormNumberKeyword(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, width:160 }} />
            <input placeholder="按报销人姓名" value={nameFilter} onChange={e => setNameFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, width:160 }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4 }}>
              <option value="">全部状态</option>
              <option value="草稿">草稿</option>
              <option value="待财务审核">待财务审核</option>
              <option value="财务已审核">财务已审核</option>
              <option value="总经理已审批">总经理已审批</option>
              <option value="已打款">已打款</option>
              <option value="已驳回">已驳回</option>
            </select>
            <input type="number" placeholder="最小金额" value={minAmount} onChange={e=>setMinAmount(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius:4, width:110 }} />
            <input type="number" placeholder="最大金额" value={maxAmount} onChange={e=>setMaxAmount(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius:4, width:110 }} />
            <DatePicker
              placeholder="开始日期"
              value={startDate ? dayjs(startDate) : null}
              onChange={(date) => setStartDate(date ? date.format('YYYY-MM-DD') : '')}
              format="YYYY-MM-DD"
              style={{ width: 140 }}
            />
            <span style={{color:'#999'}}>-</span>
            <DatePicker
              placeholder="结束日期"
              value={endDate ? dayjs(endDate) : null}
              onChange={(date) => setEndDate(date ? date.format('YYYY-MM-DD') : '')}
              format="YYYY-MM-DD"
              style={{ width: 140 }}
            />
            {activeTab === 'all' && (
              <label style={{ userSelect: 'none' }}>
                <input type="checkbox" checked={onlyExportable} onChange={e=>setOnlyExportable(e.target.checked)} style={{ marginRight: 6 }} />
                仅可导出
              </label>
            )}
            <button onClick={()=>{setFormNumberKeyword('');setNameFilter('');setStatusFilter('');setMinAmount('');setMaxAmount('');setStartDate('');setEndDate('');setOnlyExportable(false);}} style={{ padding:'6px 14px', background:'#fff', border:'1px solid #ddd', borderRadius:4, cursor:'pointer' }}>重置</button>
            {activeTab==='all' && <span style={{ color:'#999', fontSize:12 }}>可导出状态：财务已审核 / 总经理已审批 / 已打款 / 已驳回</span>}
          </div>
        )}

        <Table
          columns={columns.map(col => ({
            ...col,
            sorter: ['total_amount','created_at','status_en','form_number'].includes(col.dataIndex) ? true : col.sorter,
          }))}
          dataSource={forms}
          rowKey="id"
          rowSelection={isReviewer && !isMyMode && forms.length>0 ? {
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys)
          } : undefined}
          loading={loading}
          showSorterTooltip={false}
          pagination={{ pageSize: 10, showSizeChanger: false, showQuickJumper: true, showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条` }}
          locale={{ emptyText: '暂无报销单' }}
          onChange={(pagination, filters, sorter) => {
            if (sorter && sorter.field) {
              // 简易客户端排序（当前数据量不大）
              const sorted = [...forms].sort((a,b)=>{
                const f = sorter.field;
                const dir = sorter.order === 'descend' ? -1 : 1;
                const va = a[f];
                const vb = b[f];
                if (va == null && vb == null) return 0;
                if (va == null) return 1;
                if (vb == null) return -1;
                if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
                return String(va).localeCompare(String(vb)) * dir;
              });
              setForms(sorted);
            }
          }}
        />
      </Card>

      {/* 打款弹窗 */}
      <Modal
        title="确认打款"
        open={paymentVisible}
        onOk={submitPayment}
        confirmLoading={paymentSubmitting}
        okText="确认打款"
        onCancel={() => setPaymentVisible(false)}
        destroyOnClose
      >
        {paymentFormDetail ? (
          <div>
            <Typography.Paragraph>
              报销单号：<b>{paymentFormDetail.form_number}</b>
            </Typography.Paragraph>
            <Typography.Paragraph>
              报销金额：<b>¥{Number(paymentFormDetail.total_amount || 0).toFixed(2)}</b>
              {typeof paymentFormDetail?.summary?.loan_offset_amount !== 'undefined' && (
                <>
                  ，已冲抵：<b>¥{Number(paymentFormDetail.summary.loan_offset_amount || 0).toFixed(2)}</b>
                  ，当前应付净额：<b>¥{Number(paymentFormDetail.summary.net_payment_amount ?? (Number(paymentFormDetail.total_amount||0) - Number(paymentFormDetail.summary.loan_offset_amount||0))).toFixed(2)}</b>
                </>
              )}
            </Typography.Paragraph>
            <Divider />

            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Checkbox checked={useCash} onChange={e => setUseCash(e.target.checked)}>现金打款</Checkbox>
              {useCash && (
                <Space>
                  <span>金额：</span>
                  <InputNumber
                    min={0}
                    precision={2}
                    value={cashAmount}
                    onChange={v => setCashAmount(Number(v || 0))}
                  />
                  <Tooltip title="按净额自动计算">
                    <Button size="small" onClick={() => setCashAmount(computeSuggestedCash())}>按净额</Button>
                  </Tooltip>
                </Space>
              )}

              <Divider style={{ margin: '8px 0' }} />

              <Checkbox checked={useOffset} onChange={e => setUseOffset(e.target.checked)}>借款冲抵（可多选）</Checkbox>
              {useOffset && (
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 8, maxHeight: 260, overflow: 'auto' }}>
                  <List
                    size="small"
                    dataSource={availableLoans}
                    locale={{ emptyText: '无可用借款' }}
                    renderItem={(item) => {
                      const val = loanOffsets[item.id] ?? 0;
                      return (
                        <List.Item>
                          <Space wrap>
                            <Tag>{item.id}</Tag>
                            <span>用途：{item.purpose || '-'}</span>
                            <span>剩余：¥{Number(item.remaining_amount || 0).toFixed(2)}</span>
                            <span>冲抵：</span>
                            <InputNumber
                              min={0}
                              max={Number(item.remaining_amount || 0)}
                              precision={2}
                              value={val}
                              onChange={(v) => setLoanOffsets(prev => ({ ...prev, [item.id]: Number(v || 0) }))}
                            />
                          </Space>
                        </List.Item>
                      );
                    }}
                  />
                  <div style={{ textAlign: 'right', marginTop: 8 }}>
                    合计冲抵：<b>¥{Object.values(loanOffsets).reduce((s,x)=>s+(Number(x)||0),0).toFixed(2)}</b>
                  </div>
                </div>
              )}
            </Space>
          </div>
        ) : (
          <Typography.Text type="secondary">加载中...</Typography.Text>
        )}
      </Modal>
    </div>
  );
}

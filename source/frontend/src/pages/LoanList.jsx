import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../utils/api';
import { exportToCsv } from '../utils/csvExport';

// 判断角色
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
    return String(JSON.parse(localStorage.getItem('user'))?.id || localStorage.getItem('user_id') || '');
  } catch {
    return String(localStorage.getItem('user_id') || '');
  }
};

export default function LoanList() {
  const location = useLocation();
  const userRole = normalizeRole(getUserRole());
  const userId = getUserId();


  // 判断是否为审批区（URL包含?todo=1）
  const isApprovalArea = location.search.includes('todo=1');
  const isPersonalArea = !isApprovalArea;

  // 个人区：所有用户都能看到自己的借款记录和余额
  const [myLoans, setMyLoans] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [mySummary, setMySummary] = useState(null);

  // 审批区状态
  const TABS = [
    { key: 'todo', label: '待我审批' },
    { key: 'all', label: '全部借款记录' },
    { key: 'balance', label: '员工借款余额' },
  ];
  const [activeTab, setActiveTab] = useState('todo');
  const [loading, setLoading] = useState(false);
  const [loans, setLoans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [balanceList, setBalanceList] = useState([]);
  const [showDetail, setShowDetail] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [userLoans, setUserLoans] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userLoading, setUserLoading] = useState(false);
  // 排序相关
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  // 新增：审批意见弹窗状态
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [approveAction, setApproveAction] = useState(''); // approve | reject | finance_pay
  const [approveLoan, setApproveLoan] = useState(null);   // 当前操作的借款
  const [approveComment, setApproveComment] = useState(''); // 审批意见
  // 新增：格式化审批意见
  const formatComments = (l) => {
    if (!l) return '';
    const parts = [];
    if (l.finance_comment) parts.push(`财务: ${l.finance_comment}`);
    if (l.manager_comment) parts.push(`总经理: ${l.manager_comment}`);
    return parts.join(' | ');
  };
  // 排序辅助函数（点击表头切换）
  const toggleSort = (field) => {
    setPage(1); // 重置分页
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };
  const sortIndicator = (field) => {
    if (sortField !== field) return '';
    return sortOrder === 'asc' ? '↑' : '↓';
  };
  // 排序结果占位（当前直接使用后端返回顺序，后续可在此做前端再排序）
  const loansSorted = loans;
  // 还款标记弹窗相关
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [repayLoan, setRepayLoan] = useState(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayLoading, setRepayLoading] = useState(false);
  const [repayType, setRepayType] = useState('cash'); // 只支持现金还款

  // 纯中文状态：直出
  const statusMap = new Proxy({}, { get: (_t, p) => p });

  // 审批操作
  async function handleApprove(loan, action, comment = '') {
  let url = `/api/loans/${loan.id}/approve`;
    let body = { action, comment };
  if (userRole === 'finance' && loan.status === '总经理已审批' && action === 'finance_pay') {
      url = `/api/loans/${loan.id}/finance-pay`;
      body = { comment };
    }
    const res = await api.post(url, body);
    const data = res.data;
    alert(data.msg || '操作成功');
    // 刷新列表
    let params = { page, pageSize };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (nameFilter) params.name = nameFilter;
    if (sortField) params.sortField = sortField;
    if (sortOrder) params.sortOrder = sortOrder;
    params.todo = activeTab === 'todo' ? 1 : undefined;
    setLoading(true);
    api.get(`/api/loans?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v!==undefined))).toString()}`)
      .then(r=>r.data)
      .then(res=>{ setLoans(res.loans||[]); setTotal(res.total||0); })
      .finally(()=>setLoading(false));
  }

  // 打开还款标记弹窗
  async function openRepayModal(loan) {
    setRepayLoan(loan);
    setShowRepayModal(true);
    setRepayAmount('');
    setRepayLoading(false);
    setRepayType('cash');
  }

  function closeRepayModal() {
    setShowRepayModal(false);
    setRepayLoan(null);
    setRepayAmount('');
    setRepayLoading(false);
    setRepayType('cash');
  }

  // 导出借款记录为Excel
  const exportLoansToExcel = async () => {
    try {
      // 获取所有借款记录（不分页）
      const response = await api.get('/api/loans?all=1');
      const allLoans = response.data.loans || response.data || [];

      // 为每个借款获取详细信息（包括审批时间和冲抵信息）
      const detailedLoans = await Promise.all(
        allLoans.map(async (loan) => {
          try {
            // 获取审批日志
            const logsRes = await api.get(`/api/loans/${loan.id}/approval-logs`);
            const logs = logsRes.data || [];

            // 提取财务和总经理审批时间
            const financeApproval = logs.find(log =>
              log.action === 'approve' && log.to_status === '财务已审核'
            );
            const managerApproval = logs.find(log =>
              log.action === 'approve' && log.to_status === '总经理已审批'
            );

            // 获取冲抵信息（从offsets字段中提取报销单号）
            const offsetInfo = loan.offsets || [];
            const offsetFormNumbers = offsetInfo
              .map(offset => offset.form_number)
              .filter(Boolean)
              .join(', ');

            return {
              ...loan,
              finance_approved_at: financeApproval?.created_at,
              manager_approved_at: managerApproval?.created_at,
              offset_form_numbers: offsetFormNumbers
            };
          } catch (error) {
            console.error(`获取借款 ${loan.id} 详细信息失败:`, error);
            return {
              ...loan,
              finance_approved_at: null,
              manager_approved_at: null,
              offset_form_numbers: ''
            };
          }
        })
      );

      // 准备Excel数据
      const excelData = detailedLoans.map(loan => ({
        '借款ID': loan.id,
        '申请人': loan.real_name || loan.username,
        '借款金额': loan.amount,
        '剩余金额': loan.remaining_amount,
        '借款用途': loan.purpose,
        '状态': statusMap[loan.status] || loan.status,
        '财务意见': loan.finance_comment || '',
        '总经理意见': loan.manager_comment || '',
        '申请时间': loan.created_at ? dayjs(loan.created_at).format('YYYY-MM-DD HH:mm:ss') : '',
        '财务审核时间': loan.finance_approved_at ? dayjs(loan.finance_approved_at).format('YYYY-MM-DD HH:mm:ss') : '',
        '总经理审核时间': loan.manager_approved_at ? dayjs(loan.manager_approved_at).format('YYYY-MM-DD HH:mm:ss') : '',
        '冲抵报销单号': loan.offset_form_numbers || '',
        '备注': loan.remark || ''
      }));

      // 导出为CSV格式
      const fileName = `借款记录_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}`;
      exportToCsv(excelData, fileName);

      alert(`导出成功！共导出 ${excelData.length} 条借款记录`);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    }
  };

  // 提交还款标记（只支持现金还款）
  async function handleRepaySubmit() {
    if (!repayAmount || isNaN(Number(repayAmount)) || Number(repayAmount) <= 0) return alert('请输入有效还款金额');
    setRepayLoading(true);
    const body = { amount: Number(repayAmount) };
    const res = await api.post(`/api/loans/${repayLoan.id}/repay`, body);
    const data = res.data;
    setRepayLoading(false);
    alert(data.msg || '操作成功');
    closeRepayModal();
    // 刷新列表
    const q = new URLSearchParams({
      todo: 1,
      page,
      pageSize,
      ...(search ? { search } : {}),
    }).toString();
    setLoading(true);
    api.get(`/api/loans?${q}`)
      .then(r => r.data)
      .then(res => {
        setLoans(res.loans || []);
        setTotal(res.total || 0);
      })
      .finally(() => setLoading(false));
  }

  // 个人区：所有用户都能看到自己的借款记录和余额，并支持状态筛选、排序
  const [myStatus, setMyStatus] = useState('');
  const [mySortKey, setMySortKey] = useState('created_at');
  const [mySortOrder, setMySortOrder] = useState('desc');
  useEffect(() => {
    setMyLoading(true);
    let url = '/api/loans?my=1';
    const params = [];
    if (myStatus) params.push('status=' + encodeURIComponent(myStatus));
    if (mySortKey) params.push('sortField=' + encodeURIComponent(mySortKey));
    if (mySortOrder) params.push('sortOrder=' + encodeURIComponent(mySortOrder));
    if (params.length) url += (url.includes('?') ? '&' : '?') + params.join('&');
    Promise.all([
      api.get(url.replace('http://localhost:3002', '')).then(r => r.data),
      api.get('/api/loans/summary?my=1').then(r => r.data)
    ]).then(([listRes, summaryRes]) => {
      // 兼容后端两种返回形状：
      // 1) 直接数组（my=1 且未分页时返回）
      // 2) 对象形状 { total, loans }
      const myList = Array.isArray(listRes)
        ? listRes
        : (listRes?.loans || listRes?.rows || []);
      setMyLoans(myList);
      setMySummary(summaryRes || null);
    }).finally(() => setMyLoading(false));
  }, [myStatus, mySortKey, mySortOrder]);

  // 审批区：仅 finance/manager 角色可见
  useEffect(() => {
    if (userRole !== 'finance' && userRole !== 'manager') return;
    let params = { page, pageSize };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (nameFilter) params.name = nameFilter;
    if (sortField) params.sortField = sortField;
    if (sortOrder) params.sortOrder = sortOrder;
    if (activeTab === 'todo') {
      params.todo = 1;
    }
    setLoading(true);
    let url = activeTab === 'balance' ? '/api/loans/balance-list' : `/api/loans?${new URLSearchParams(params).toString()}`;
    api.get(url)
      .then(r => r.data)
      .then(res => {
        if (activeTab === 'balance') setBalanceList(res || []);
        else {
          setLoans(res.loans || []);
          setTotal(res.total || 0);
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [userRole, activeTab, page, search, statusFilter, nameFilter, sortField, sortOrder]);

  function openUserDetail(user) {
    setDetailUser(user);
    setShowDetail(true);
    setUserLoading(true);
    api.get(`/api/loans/user/${user.user_id}`)
      .then(r => r.data)
      .then(res => {
        setUserLoans(res.loans || []);
        setUserTotal(res.total || 0);
      })
      .finally(() => setUserLoading(false));
  }

  function closeUserDetail() {
    setShowDetail(false);
    setDetailUser(null);
    setUserLoans([]);
    setUserTotal(0);
  }

  // 打开审批意见弹窗
  function openApproveModal(loan, action) {
    setApproveLoan(loan);
    setApproveAction(action);
    setApproveComment('');
    setApproveModalVisible(true);
  }
  function closeApproveModal() {
    setApproveModalVisible(false);
    setApproveLoan(null);
    setApproveAction('');
    setApproveComment('');
  }
  async function submitApproveAction() {
    if (!approveLoan || !approveAction) return;
    const trimmed = approveComment.trim().slice(0, 500); // 截断长度
    try {
      await handleApprove(approveLoan, approveAction, trimmed);
    } catch (e) {
      alert(e?.response?.data?.msg || e.message || '操作失败');
    } finally {
      closeApproveModal();
    }
  }

  // 个人区视图（所有用户都能看到自己的借款记录和余额）
  if (isPersonalArea) {
    return (
      <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: '24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
          <h3 data-testid="my-loans-title" style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>我的借款记录</h3>
          {/* 提示条：明确可撤回/重提规则 */}
          <div style={{background:'#e6f7ff',border:'1px solid #91d5ff',padding:'8px 12px',borderRadius:6,marginBottom:12,color:'#0050b3',fontSize:13}}>
            待财务审核的借款可以撤回为草稿；草稿或已驳回的借款可以修改后重新提交。
          </div>
          {mySummary && (
            <div style={{background:'#f6ffed',border:'1px solid #b7eb8f',padding:'12px 20px',borderRadius:6,marginBottom:16,color:'#389e0d',fontSize:16}}>
              当前借款余额：<b>¥{mySummary.outstanding_balance || 0}</b>
              {mySummary.last_loan_date && (
                <span style={{marginLeft:16,fontSize:13,color:'#888'}}>最近借款：{dayjs(mySummary.last_loan_date).format('YYYY-MM-DD')}</span>
              )}
            </div>
          )}
          {/* 筛选/排序栏 */}
          <div style={{display:'flex',gap:16,marginBottom:16,alignItems:'center'}}>
            <select value={myStatus} onChange={e=>setMyStatus(e.target.value)}>
              <option value="">全部状态</option>
              <option value="待财务审核">待财务审核</option>
              <option value="财务已审核">财务已审核</option>
              <option value="总经理已审批">总经理已审批</option>
              <option value="已打款">已打款</option>
              <option value="部分已还">部分已还</option>
              <option value="已还清">已还清</option>
              <option value="已驳回">已驳回</option>
            </select>
            <select value={mySortKey} onChange={e=>setMySortKey(e.target.value)}>
              <option value="created_at">按创建时间</option>
              <option value="amount">按金额</option>
              <option value="status">按状态</option>
            </select>
            <select value={mySortOrder} onChange={e=>setMySortOrder(e.target.value)}>
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>
          {myLoading ? <div style={{margin:'32px 0',color:'#888'}}>加载中...</div> : null}
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:16}}>
            <thead>
              <tr style={{background:'#f5f5f5'}}>
                <th style={{border:'1px solid #ddd',padding:8}}>金额</th>
                <th style={{border:'1px solid #ddd',padding:8}}>剩余</th>
                <th style={{border:'1px solid #ddd',padding:8}}>状态</th>
                <th style={{border:'1px solid #ddd',padding:8}}>用途</th>
                <th style={{border:'1px solid #ddd',padding:8}}>审批意见</th>{/* 新增列 */}
                <th style={{border:'1px solid #ddd',padding:8}}>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {myLoans.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',color:'#aaa',fontSize:18}}>暂无数据</td></tr>}
              {myLoans.map(l => (
                <tr key={l.id}>
                  <td style={{border:'1px solid #ddd',padding:8}}>¥{l.amount}</td>
                  <td style={{border:'1px solid #ddd',padding:8}}>¥{l.remaining_amount}</td>
                  <td style={{border:'1px solid #ddd',padding:8}}>{statusMap[l.status] || l.status}</td>
                  <td style={{border:'1px solid #ddd',padding:8}}>{l.purpose}</td>
                  <td style={{border:'1px solid #ddd',padding:8,maxWidth:200}} title={formatComments(l)}>
                    <span style={{display:'inline-block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:180}}>{formatComments(l) || '-'}</span>
                  </td>
                  <td style={{border:'1px solid #ddd',padding:8}}>
                    <div>{l.created_at ? dayjs(l.created_at).format('YYYY-MM-DD HH:mm:ss') : ''}</div>
                    {/* 操作区：显式撤回/编辑/重提按钮 */}
                    <div style={{marginTop:6, display:'flex', gap:6, flexWrap:'wrap'}}>
                      {l.status === '待财务审核' && (
                        <button
                          onClick={async ()=>{
                            if(!window.confirm('确定撤回该借款申请？')) return;
                            try{
                              await api.post(`/api/loans/${l.id}/withdraw`);
                              alert('已撤回为草稿');
                              // 触发刷新
                              const url = '/api/loans?my=1' + (myStatus?`&status=${encodeURIComponent(myStatus)}`:'') + `&sortField=${encodeURIComponent(mySortKey)}&sortOrder=${encodeURIComponent(mySortOrder)}`;
                              const [listRes, summaryRes] = await Promise.all([
                                api.get(url).then(r=>r.data),
                                api.get('/api/loans/summary?my=1').then(r=>r.data)
                              ]);
                              const myList = Array.isArray(listRes) ? listRes : (listRes?.loans || listRes?.rows || []);
                              setMyLoans(myList);
                              setMySummary(summaryRes || null);
                            }catch(e){
                              alert(e?.response?.data?.msg || '撤回失败');
                            }
                          }}
                          style={{ padding:'4px 8px', background:'#faad14', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}
                        >撤回</button>
                      )}
                      {(l.status === '草稿' || l.status === '已驳回') && (
                        <>
                          <button
                            onClick={()=>window.location.assign(`/loans/edit/${l.id}`)}
                            style={{ padding:'4px 8px', background:'#13c2c2', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}
                          >编辑</button>
                          <button
                            onClick={async ()=>{
                              try{
                                await api.post(`/api/loans/${l.id}/resubmit`);
                                alert('已重新提交');
                                const url = '/api/loans?my=1' + (myStatus?`&status=${encodeURIComponent(myStatus)}`:'') + `&sortField=${encodeURIComponent(mySortKey)}&sortOrder=${encodeURIComponent(mySortOrder)}`;
                                const [listRes, summaryRes] = await Promise.all([
                                  api.get(url).then(r=>r.data),
                                  api.get('/api/loans/summary?my=1').then(r=>r.data)
                                ]);
                                const myList = Array.isArray(listRes) ? listRes : (listRes?.loans || listRes?.rows || []);
                                setMyLoans(myList);
                                setMySummary(summaryRes || null);
                              }catch(e){
                                alert(e?.response?.data?.msg || '重新提交失败');
                              }
                            }}
                            style={{ padding:'4px 8px', background:'#1890ff', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}
                          >重新提交</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 审批区视图，仅 finance/manager 角色可见
  if (isApprovalArea && (userRole === 'finance' || userRole === 'manager')) {
    return (
      <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: '24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
  <h3 data-testid="loan-approve-title" style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>借款审批</h3>
        
        {/* Tab导航 */}
        <div style={{ marginBottom: 24, borderBottom: '1px solid #e8e8e8' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 16px',
                marginRight: 8,
                border: 'none',
                background: activeTab === tab.key ? '#1890ff' : 'transparent',
                color: activeTab === tab.key ? '#fff' : '#666',
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 搜索和筛选 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="搜索借款用途..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, width: 200 }}
          />

          {/* 财务人员可导出Excel */}
          {userRole === 'finance' && (
            <button
              onClick={exportLoansToExcel}
              style={{
                padding: '6px 12px',
                background: '#52c41a',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📊 导出Excel
            </button>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="待财务审核">待财务审核</option>
            <option value="财务已审核">待总经理审批</option>
            <option value="总经理已审批">待财务打款</option>
            <option value="已打款">待归还</option>
            <option value="部分已还">部分还款</option>
            <option value="已还清">已结清</option>
            <option value="已驳回">已驳回</option>
          </select>
          <input
            type="text"
            placeholder="按员工姓名筛选..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, width: 150 }}
          />
        </div>

        {loading ? (
          <div style={{ margin: '32px 0', textAlign: 'center', color: '#888' }}>加载中...</div>
        ) : (
          <>
            {activeTab === 'balance' ? (
              // 员工借款余额列表
              <div>
                <h4>员工借款余额</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>员工姓名</th>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>借款余额</th>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>活跃借款数</th>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceList.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#aaa', padding: 32 }}>暂无数据</td></tr>}
                    {balanceList.map(user => (
                      <tr key={user.user_id}>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>{user.real_name}</td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>
                          <span style={{ color: user.balance > 0 ? '#f5222d' : '#52c41a' }}>¥{user.balance}</span>
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>{user.active_loans_count || 0}</td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>
                          <button
                            onClick={() => openUserDetail(user)}
                            style={{ padding: '4px 8px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // 借款审批列表
              <div>
                <h4 data-testid={activeTab === 'todo' ? 'loan-approve-todo-title' : 'loan-approve-all-title'}>
                  {activeTab === 'todo' ? '待我审批的借款' : '全部借款记录'}
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ border:'1px solid #ddd', padding:8, cursor:'pointer' }} onClick={()=>toggleSort('real_name')}>申请人 {sortIndicator('real_name')}</th>
                      <th style={{ border:'1px solid #ddd', padding:8, cursor:'pointer' }} onClick={()=>toggleSort('amount')}>金额 {sortIndicator('amount')}</th>
                      <th style={{ border:'1px solid #ddd', padding:8, cursor:'pointer' }} onClick={()=>toggleSort('remaining_amount')}>剩余金额 {sortIndicator('remaining_amount')}</th>
                      <th style={{ border:'1px solid #ddd', padding:8 }}>用途</th>
                      <th style={{ border:'1px solid #ddd', padding:8, cursor:'pointer' }} onClick={()=>toggleSort('status')}>状态 {sortIndicator('status')}</th>
                      <th style={{ border:'1px solid #ddd', padding:8 }}>审批意见</th>{/* 新增列 */}
                      <th style={{ border:'1px solid #ddd', padding:8, cursor:'pointer' }} onClick={()=>toggleSort('created_at')}>申请时间 {sortIndicator('created_at')}</th>
                      <th style={{ border:'1px solid #ddd', padding:8, width:180 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#aaa', padding:32 }}>暂无数据</td></tr>}
                    {loansSorted.map(loan => (
                      <tr key={loan.id}>
                        <td style={{ border:'1px solid #ddd', padding:8 }}>{loan.real_name || '未知'}</td>
                        <td style={{ border:'1px solid #ddd', padding:8 }}>¥{loan.amount}</td>
                        <td style={{ border:'1px solid #ddd', padding:8 }}>¥{loan.remaining_amount || loan.amount}</td>
                        <td style={{ border:'1px solid #ddd', padding:8 }}>{loan.purpose}</td>
                        <td style={{ border:'1px solid #ddd', padding:8 }}>
                          <span style={{
                            padding:'2px 6px', borderRadius:4, fontSize:12,
                            background: loan.status === '待财务审核' ? '#faad14' : loan.status === '已驳回' ? '#ff4d4f' : '#52c41a',
                            color:'#fff'
                          }}>{statusMap[loan.status] || loan.status}</span>
                        </td>
                        <td style={{ border:'1px solid #ddd', padding:8, maxWidth:220 }} title={formatComments(loan)}>
                          <span style={{display:'inline-block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:200}}>{formatComments(loan) || '-'}</span>
                        </td>
                        <td style={{ border:'1px solid #ddd', padding:8 }}>{loan.created_at ? dayjs(loan.created_at).format('MM-DD HH:mm') : ''}</td>
                        <td style={{ border:'1px solid #ddd', padding:8 }}>
                          {/* 财务审批按钮 */}
                          {userRole === 'finance' && loan.status === '待财务审核' && (
                            <>
                              <button
                                onClick={() => openApproveModal(loan, 'approve')}
                                style={{ padding: '4px 8px', background: '#52c41a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}
                              >
                                同意
                              </button>
                              <button
                                onClick={() => openApproveModal(loan, 'reject')}
                                style={{ padding: '4px 8px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                              >
                                驳回
                              </button>
                            </>
                          )}
                          {/* 经理审批按钮 */}
                          {userRole === 'manager' && loan.status === '财务已审核' && (
                            <>
                              <button
                                onClick={() => openApproveModal(loan, 'approve')}
                                style={{ padding: '4px 8px', background: '#52c41a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}
                              >
                                同意
                              </button>
                              <button
                                onClick={() => openApproveModal(loan, 'reject')}
                                style={{ padding: '4px 8px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                              >
                                驳回
                              </button>
                            </>
                          )}
                          {/* 财务打款按钮 */}
                          {userRole === 'finance' && loan.status === '总经理已审批' && (
                            <button
                              onClick={() => openApproveModal(loan, 'finance_pay')}
                              style={{ padding: '4px 8px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            >
                              打款
                            </button>
                          )}
                          {/* 财务还款操作 */}
                          {userRole === 'finance' && ['已打款','部分已还'].includes(loan.status) && loan.remaining_amount > 0 && (
                            <button
                              onClick={() => openRepayModal(loan)}
                              style={{ padding: '4px 8px', background: '#722ed1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            >
                              还款
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* 分页 */}
                {total > pageSize && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      style={{ 
                        padding: '6px 12px', 
                        marginRight: 8, 
                        border: '1px solid #ddd', 
                        background: page === 1 ? '#f5f5f5' : '#fff',
                        cursor: page === 1 ? 'not-allowed' : 'pointer',
                        borderRadius: 4
                      }}
                    >
                      上一页
                    </button>
                    <span style={{ margin: '0 16px' }}>第 {page} 页，共 {Math.ceil(total / pageSize)} 页</span>
                    <button
                      disabled={page >= Math.ceil(total / pageSize)}
                      onClick={() => setPage(page + 1)}
                      style={{ 
                        padding: '6px 12px', 
                        marginLeft: 8, 
                        border: '1px solid #ddd', 
                        background: page >= Math.ceil(total / pageSize) ? '#f5f5f5' : '#fff',
                        cursor: page >= Math.ceil(total / pageSize) ? 'not-allowed' : 'pointer',
                        borderRadius: 4
                      }}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 还款模态窗口 */}
        {showRepayModal && repayLoan && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 500, width: '90%' }}>
              <h4>还款标记 - {repayLoan.purpose}</h4>
              <p>借款金额: ¥{repayLoan.amount}, 剩余: ¥{repayLoan.remaining_amount}</p>
              
              <div style={{ marginBottom: 16 }}>
                <label>还款方式:</label>
                <select value={repayType} onChange={e => setRepayType(e.target.value)} style={{ marginLeft: 8, padding: 4 }}>
                  <option value="cash">现金还款</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>还款金额:</label>
                <input 
                  type="number" 
                  value={repayAmount} 
                  onChange={e => setRepayAmount(e.target.value)}
                  placeholder="请输入还款金额"
                  style={{ marginLeft: 8, padding: 4, width: 200 }}
                />
              </div>



              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button 
                  onClick={closeRepayModal}
                  style={{ padding: '6px 12px', border: '1px solid #ddd', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
                >
                  取消
                </button>
                <button 
                  onClick={handleRepaySubmit}
                  disabled={repayLoading}
                  style={{ padding: '6px 12px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: repayLoading ? 'not-allowed' : 'pointer' }}
                >
                  {repayLoading ? '提交中...' : '确认还款'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 用户详情模态窗口 */}
        {showDetail && detailUser && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 800, width: '90%', maxHeight: '80%', overflow: 'auto' }}>
              <h4>{detailUser.real_name} 的借款详情</h4>
              
              {userLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#888' }}>加载中...</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>金额</th>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>剩余</th>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>用途</th>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>状态</th>
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>审批意见</th>{/* 新增列 */}
                      <th style={{ border: '1px solid #ddd', padding: 8 }}>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userLoans.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#aaa', padding: 16 }}>暂无数据</td></tr>}
                    {userLoans.map(loan => (
                      <tr key={loan.id}>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>¥{loan.amount}</td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>¥{loan.remaining_amount || loan.amount}</td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>{loan.purpose}</td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>{statusMap[loan.status] || loan.status}</td>
                        <td style={{ border: '1px solid #ddd', padding: 8, maxWidth:220 }} title={formatComments(loan)}>
                          <span style={{display:'inline-block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:200}}>{formatComments(loan) || '-'}</span>
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>
                          {loan.created_at ? dayjs(loan.created_at).format('MM-DD HH:mm') : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button 
                  onClick={closeUserDetail}
                  style={{ padding: '6px 12px', border: '1px solid #ddd', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 审批意见弹窗（放在审批区统一管理） */}
        {approveModalVisible && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }}>
            <div style={{ background:'#fff', width:480, borderRadius:8, padding:24, boxShadow:'0 4px 16px rgba(0,0,0,0.2)' }}>
              <h4 style={{ marginTop:0 }}>填写审批意见（可选）</h4>
              <p style={{ margin:'4px 0 12px', color:'#555' }}>操作：{approveAction === 'approve' ? '同意' : approveAction === 'reject' ? '驳回' : '打款'} （借款ID: {approveLoan?.id}）</p>
              <textarea
                value={approveComment}
                onChange={e=>setApproveComment(e.target.value)}
                placeholder="可填写理由或备注，留空亦可"
                style={{ width:'100%', minHeight:130, resize:'vertical', padding:8, border:'1px solid #ddd', borderRadius:4, outline:'none' }}
              />
              <div style={{ textAlign:'right', marginTop:16, display:'flex', justifyContent:'flex-end', gap:8 }}>
                <button onClick={closeApproveModal} style={{ padding:'6px 14px', background:'#fff', border:'1px solid #ddd', borderRadius:4, cursor:'pointer' }}>取消</button>
                <button onClick={submitApproveAction} style={{ padding:'6px 14px', background:'#1890ff', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}>确认</button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  // 未授权访问
  return (
    <div style={{ maxWidth: 600, margin: '100px auto', textAlign: 'center', padding: 32 }}>
      <h3>无权限访问</h3>
      <p>您没有权限访问借款审批功能。</p>
    </div>
  );
}


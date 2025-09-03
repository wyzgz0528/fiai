
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { mapLoanStatusToZh } from '../types/loanStatus';


export default function LoanDetail() {
  const { id } = useParams();
  const [loan, setLoan] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState('approve');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [repayRemark, setRepayRemark] = useState('');
  const [payComment, setPayComment] = useState('');
  const navigate = useNavigate();
  const role = localStorage.getItem('role');
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line
  }, [id]);

  const fetchDetail = async () => {
    setError('');
    try {
      const res = await axios.get(`/api/loans/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLoan(res.data);
    } catch (e) {
      setError('获取详情失败');
    }
  };

  // 还款权限：本人或财务，且状态为partial_repaid/paid，且有剩余金额
  const canRepay = loan && ['paid','partial_repaid'].includes(loan.status) && (role === 'finance' || String(loan.user_id) === String(localStorage.getItem('user_id')||'')) && loan.remaining_amount > 0;

  const handleRepay = async () => {
    setMsg('');
    setError('');
    if (!repayAmount || isNaN(repayAmount) || Number(repayAmount) <= 0) {
      setError('请输入有效还款金额');
      return;
    }
    try {
      await axios.post(`/api/loans/${id}/repay`, { amount: Number(repayAmount), remark: repayRemark }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg('还款成功');
      setRepayAmount('');
      setRepayRemark('');
      fetchDetail();
    } catch (e) {
      setError(e.response?.data?.msg || '还款失败');
    }
  };

  const canFinanceApprove = role === 'finance' && loan?.status === 'pending';
  const canManagerApprove = role === 'manager' && loan?.status === 'finance_approved';

  const handleApprove = async () => {
    setMsg('');
    setError('');
    try {
      // 统一走 /api/loans/:id/approve，body: { action, comment }
      await axios.post(`/api/loans/${id}/approve`, { action, comment }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg('操作成功');
      fetchDetail();
    } catch (e) {
      setError(e.response?.data?.msg || '操作失败');
    }
  };

  const canEdit = loan && ['draft','pending','rejected'].includes(loan.status) && String(loan.user_id) === String(localStorage.getItem('user_id')||'');
  const canWithdraw = loan && loan.status === 'pending' && String(loan.user_id) === String(localStorage.getItem('user_id')||'');
  const canResubmit = loan && ['draft','rejected'].includes(loan.status) && String(loan.user_id) === String(localStorage.getItem('user_id')||'');

  const handleWithdraw = async () => {
    setMsg(''); setError('');
    if (!window.confirm('确定撤回该借款申请吗？')) return;
    try {
      await axios.post(`/api/loans/${id}/withdraw`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setMsg('已撤回');
      fetchDetail();
    } catch (e) {
      setError(e.response?.data?.msg || '撤回失败');
    }
  };

  const handleResubmit = async () => {
    setMsg(''); setError('');
    try {
      await axios.post(`/api/loans/${id}/resubmit`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setMsg('已重新提交');
      fetchDetail();
    } catch (e) {
      setError(e.response?.data?.msg || '重新提交失败');
    }
  };
  // 财务可打款
  const canFinancePay = role === 'finance' && loan?.status === 'manager_approved';
  const handleFinancePay = async () => {
    setMsg('');
    setError('');
    try {
      await axios.post(`/api/loans/${id}/finance-pay`, { comment: payComment }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg('打款成功');
      setPayComment('');
      fetchDetail();
    } catch (e) {
      setError(e.response?.data?.msg || '打款失败');
    }
  };
  if (!loan) return <div style={{padding:32}}>{error || '加载中...'}</div>;

  // 状态中文映射
  const statusMap = new Proxy({}, { get: (_t, p) => mapLoanStatusToZh(p) });
  const actionMap = { approve: '同意', reject: '驳回' };
  return (
    <div style={{maxWidth:600,margin:'32px auto',background:'#fff',padding:24,borderRadius:8}}>
      <h3>借款单详情</h3>
      <div>编号：{loan.id}</div>
      <div>金额：{loan.amount}</div>
      <div>用途：{loan.purpose}</div>
      <div>状态：{statusMap[loan.status] || loan.status}</div>
      <div>创建时间：{loan.created_at}</div>
      <div>财务意见：{loan.finance_comment}</div>
      <div>总经理意见：{loan.manager_comment}</div>
      <h4 style={{marginTop:24}}>审批历史</h4>
      <table border="1" cellPadding="6" style={{width:'100%',marginBottom:16}}>
        <thead><tr><th>环节</th><th>操作</th><th>审批人</th><th>备注</th><th>时间</th></tr></thead>
        <tbody>
          {loan.approval_logs?.map(log=>(
            <tr key={log.id}>
              <td>{statusMap[log.from_status] || log.from_status}→{statusMap[log.to_status] || log.to_status}</td>
              <td>{actionMap[log.action] || log.action}</td>
              <td>{log.real_name || log.approver_id}</td>
              <td>{log.comment}</td>
              <td>{log.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(canFinanceApprove || canManagerApprove) && (
        <div style={{marginTop:16}}>
          <select value={action} onChange={e=>setAction(e.target.value)}>
            <option value="approve">同意</option>
            <option value="reject">驳回</option>
          </select>
          <input style={{marginLeft:8}} placeholder="审批备注" value={comment} onChange={e=>setComment(e.target.value)} />
          <button style={{marginLeft:8}} onClick={handleApprove}>提交审批</button>
        </div>
      )}
      {canFinancePay && (
        <div style={{marginTop:16}}>
          <input placeholder="打款备注" value={payComment} onChange={e=>setPayComment(e.target.value)} />
          <button style={{marginLeft:8}} onClick={handleFinancePay}>确认打款</button>
        </div>
      )}
      {msg && <div style={{color:'#188038',marginTop:8}}>{msg}</div>}
      {error && <div style={{color:'#d93026',marginTop:8}}>{error}</div>}
      {canEdit && (
        <button style={{marginTop:16,marginRight:8}} onClick={()=>navigate(`/loans/edit/${loan.id}`)}>编辑</button>
      )}
      {canRepay && (
        <div style={{marginTop:16}}>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder={`还款金额，最多${loan.remaining_amount}`}
            value={repayAmount}
            onChange={e=>setRepayAmount(e.target.value)}
            style={{width:120,marginRight:8}}
          />
          <input
            placeholder="还款备注"
            value={repayRemark}
            onChange={e=>setRepayRemark(e.target.value)}
            style={{width:160,marginRight:8}}
          />
          <button onClick={handleRepay}>确认还款</button>
        </div>
      )}
      {canWithdraw && (
        <button style={{marginTop:16,marginRight:8}} onClick={handleWithdraw}>撤回</button>
      )}
      {canResubmit && (
        <button style={{marginTop:16,marginRight:8}} onClick={handleResubmit}>重新提交</button>
      )}
      <button style={{marginTop:24}} onClick={()=>navigate(-1)}>返回</button>
    </div>
  );
}

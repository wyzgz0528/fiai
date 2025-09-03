import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';


export default function ReimbursementDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState('approve');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();
  // 附件预览弹窗
  const [previewImg, setPreviewImg] = useState(null);
  const role = localStorage.getItem('role');
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line
  }, [id]);

  const fetchDetail = async () => {
    setError('');
    try {
      const res = await axios.get(`/api/reimbursements/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (e) {
      setError('获取详情失败');
    }
  };

  // 允许中英文状态判断，兼容旧数据
  const canFinanceApprove = role === 'finance' && ['pending','submitted','待财务审核'].includes(data?.status);
  const canManagerApprove = role === 'manager' && ['finance_approved','财务已审核'].includes(data?.status);

  const handleApprove = async () => {
    setMsg('');
    setError('');
    try {
      await axios.post(`/api/reimbursements/${id}/approve`, { action, comment }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg('操作成功');
      fetchDetail();
    } catch (e) {
      setError(e.response?.data?.msg || '操作失败');
    }
  };

  const currentUserId = (() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.id || localStorage.getItem('user_id');
    } catch {
      return localStorage.getItem('user_id');
    }
  })();
  const canEdit = data && data.status && ['pending','submitted','待财务审核','rejected','已驳回','草稿'].includes(data.status) && String(data.user_id) === String(currentUserId||'');
  const canWithdraw = canEdit;
  
  const handleDownloadPDF = async () => {
    try {
      const response = await axios.get(`/api/reimbursements/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `报销单_${data.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      setError('下载PDF失败');
    }
  };
  
  if (!data) return <div style={{padding:32}}>{error || '加载中...'}</div>;

  // 状态中文映射
  const statusMap = {
    // 英文 -> 中文
    pending: '待财务审核',
    submitted: '待财务审核',
    finance_approved: '财务已审核',
    manager_approved: '总经理已审批',
    rejected: '已驳回',
    paid: '已打款',
    // 中文直出
    '草稿': '草稿',
    '待财务审核': '待财务审核',
    '财务已审核': '财务已审核',
    '总经理已审批': '总经理已审批',
    '已打款': '已打款',
    '已驳回': '已驳回'
  };
  const actionMap = { approve: '同意', reject: '驳回' };
  return (
    <div style={{maxWidth:600,margin:'32px auto',background:'#fff',padding:24,borderRadius:8}}>
      <h3>报销单详情</h3>
      <div>编号：{data.id}</div>
      <div>金额：{data.amount}</div>
      <div>类型：{data.type || '-'}</div>
      <div>用途：{data.purpose || data.description || '-'}</div>
      {data.remark && <div>备注：{data.remark}</div>}
      <div>状态：{statusMap[data.status] || data.status}</div>
      <div>创建时间：{data.created_at}</div>
      <h4 style={{marginTop:24}}>审批历史</h4>
      <table border="1" cellPadding="6" style={{width:'100%',marginBottom:16}}>
        <thead><tr><th>环节</th><th>操作</th><th>审批人</th><th>备注</th><th>时间</th></tr></thead>
        <tbody>
          {data.approval_logs?.map(log=>(
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
      {data.attachments && data.attachments.length > 0 && (
        <div style={{margin:'16px 0'}}>
          <b>附件：</b>
          {data.attachments.map(a=>(
            <div key={a.id} style={{marginTop:4,display:'inline-block'}}>
              {(() => {
                let rawUrl = a.url || a.file_path;
                let url = rawUrl ? rawUrl.replace(/\\/g, '/') : '';
                if (url && !/^https?:\/\//.test(url) && !url.startsWith('/uploads/')) {
                  url = '/uploads/' + url.replace(/^uploads[\/]/, '');
                }
                if (a.file_type && a.file_type.startsWith('image')) {
                  return <img src={url} alt="附件" style={{maxHeight:60,marginRight:8,cursor:'pointer',border:'1px solid #eee'}} onClick={()=>setPreviewImg(url)} />;
                } else {
                  return <a href={url} target="_blank" rel="noreferrer">下载附件</a>;
                }
              })()}
            </div>
          ))}
          {/* 图片大图预览弹窗 */}
          {previewImg && (
            <div style={{position:'fixed',left:0,top:0,width:'100vw',height:'100vh',background:'#0008',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setPreviewImg(null)}>
              <div style={{background:'#fff',padding:16,borderRadius:8}} onClick={e=>e.stopPropagation()}>
                <img src={previewImg} alt="预览" style={{maxWidth:'80vw',maxHeight:'80vh',display:'block'}} />
                <button style={{margin:'16px auto 0',display:'block'}} onClick={()=>setPreviewImg(null)}>关闭</button>
              </div>
            </div>
          )}
        </div>
      )}
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
      {msg && <div style={{color:'#188038',marginTop:8}}>{msg}</div>}
      {error && <div style={{color:'#d93026',marginTop:8}}>{error}</div>}
      {canEdit && (
  <button style={{marginTop:16,marginRight:8}} onClick={()=>navigate(`/reimbursement-forms/edit/${data.id}`)}>编辑</button>
      )}
      <button style={{marginTop:16,marginRight:8,backgroundColor:'#007bff',color:'white',border:'none',padding:'8px 16px',borderRadius:'4px',cursor:'pointer'}} 
              onClick={handleDownloadPDF}>
        下载PDF报销单
      </button>
      <button style={{marginTop:24}} onClick={()=>navigate(-1)}>返回</button>
    </div>
  );
}

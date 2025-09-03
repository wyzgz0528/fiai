import React, { useEffect, useState } from 'react';
import fileDownload from 'js-file-download';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../utils/api';


export default function ReimbursementList() {
  const location = useLocation();
  const [list, setList] = useState([]);
  const role = localStorage.getItem('role');
  // 判断是否审批区（带?todo=1或?all=1），否则为个人区
  const isApproval = location.search.includes('todo=1') || location.search.includes('all=1');
  const [tab, setTab] = useState(() => {
    if (isApproval) {
      if (location.search.includes('todo=1')) return 'todo';
      if (location.search.includes('all=1')) return 'all';
      return 'todo';
    }
    return 'my';
  });
  const [error, setError] = useState('');
  // 附件预览相关
  const [previewFiles, setPreviewFiles] = useState([]); // [{url, type, name}]
  const [previewOpen, setPreviewOpen] = useState(false);
  // 新增：排序和筛选
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterStatus, setFilterStatus] = useState('');
  // 新增：按报销人姓名筛选，仅审批区可用
  const [filterName, setFilterName] = useState('');
  const [nameDebounce, setNameDebounce] = useState(null);
  const navigate = useNavigate();
  // 多选相关
  const [selectedIds, setSelectedIds] = useState([]);
  // 全选
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(filteredList.map(l => l.id));
    } else {
      setSelectedIds([]);
    }
  };
  // 单选
  const handleSelect = (id, checked) => {
    setSelectedIds(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  };
  // 批量下载
  const handleBatchDownload = async () => {
    if (selectedIds.length === 0) return alert('请先选择要下载的报销单');
    try {
 // TODO: 请手动替换为api.get()或api.post()等方法
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reimbursements/attachments/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reimbursement_ids: selectedIds })
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({msg:'下载失败'}));
        return alert(err.msg||'下载失败');
      }
      // 下载zip
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reimbursement_attachments.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch(e) {
      alert('下载失败');
    }
  };

  // 批量同意
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return alert('请先选择要同意的报销单');
    if (!window.confirm('确定要批量同意选中的报销单吗？')) return;
    try {
 // TODO: 请手动替换为api.get()或api.post()等方法
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reimbursements/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reimbursement_ids: selectedIds })
      });
      const data = await res.json();
      if (!res.ok) return alert(data.msg||'批量同意失败');
      let msg = `成功同意${data.success}条`;
      if (data.failed > 0) msg += `，失败${data.failed}条`;
      alert(msg);
      setSelectedIds([]);
      fetchList();
    } catch(e) {
      alert('批量同意失败');
    }
  };

  // 财务确认打款（基于用户ID）
  const handleConfirmPayment = async (userId, userName) => {
    const paymentNote = prompt(`确认为【${userName}】打款？请输入打款备注（可选）：`);
    if (paymentNote === null) return; // 用户取消
    
    try {
 // TODO: 请手动替换为api.get()或api.post()等方法
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/reimbursements/confirm-payment/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment_note: paymentNote })
      });
      const data = await res.json();
      if (!res.ok) return alert(data.msg||'确认打款失败');
      
      alert(`打款确认成功！共${data.count}条报销记录，总金额：¥${data.total_amount}`);
      fetchList();
    } catch(e) {
      alert('确认打款失败');
    }
  };

  // 财务下载PDF报销单
  const handleDownloadPDF = async (userId, userName) => {
    try {
 // TODO: 请手动替换为api.get()或api.post()等方法
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/reimbursements/pdf/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({msg:'下载失败'}));
        return alert(err.msg||'下载失败');
      }
      const blob = await res.blob();
      fileDownload(blob, `${userName}_报销单_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e) {
      alert('下载失败');
    }
  };

  // 导出我的报销单PDF
  const handleExportPDF = async () => {
    const userId = localStorage.getItem('user_id');
    if (!userId) return alert('未获取到用户信息');
    
    // 检查是否有可生成PDF的记录
    const managerApprovedCount = list.filter(l => 
      String(l.user_id) === String(userId) && l.status === 'manager_approved'
    ).length;
    
    if (managerApprovedCount === 0) {
      return alert('没有可生成PDF的报销记录\n只有状态为"总经理已审批"的记录才能生成PDF报销单');
    }

    try {
 // TODO: 请手动替换为api.get()或api.post()等方法
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/reimbursements/pdf/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({msg:'导出失败'}));
        return alert(err.msg||'导出失败');
      }
      const blob = await res.blob();
      fileDownload(blob, `我的报销单_${new Date().toISOString().slice(0,10)}.pdf`);
      alert('报销单PDF导出成功！');
      fetchList(); // 刷新列表查看状态变化
    } catch(e) {
      alert('导出失败');
    }
  };

  // 创建报销单（选择已审批记录）
  const handleCreateReimbursementForm = async () => {
    const userId = localStorage.getItem('user_id');
    if (!userId) return alert('未获取到用户信息');
    
    // 获取用户的manager_approved记录
    const eligibleRecords = list.filter(l => 
      String(l.user_id) === String(userId) && l.status === 'manager_approved'
    );
    
    if (eligibleRecords.length === 0) {
      return alert('没有可创建报销单的记录\n只有状态为"总经理已审批"的记录才能创建报销单');
    }
    
    // 显示记录选择界面
    const recordIds = [];
    let totalAmount = 0;
    
    const message = '请选择要包含在报销单中的记录：\n\n' + 
      eligibleRecords.map((record, index) => {
        return `${index + 1}. ${record.type || '未分类'} - ¥${record.amount} - ${record.purpose || '无说明'}`;
      }).join('\n') + 
      '\n\n请输入要选择的记录编号（用逗号分隔，如：1,2,3）：';
    
    const selection = prompt(message);
    if (!selection) return; // 用户取消
    
    try {
      const selectedIndices = selection.split(',').map(s => parseInt(s.trim()) - 1);
      const invalidIndices = selectedIndices.filter(i => i < 0 || i >= eligibleRecords.length);
      
      if (invalidIndices.length > 0) {
        return alert('选择的编号无效，请重新选择');
      }
      
      for (const index of selectedIndices) {
        recordIds.push(eligibleRecords[index].id);
        totalAmount += parseFloat(eligibleRecords[index].amount);
      }
      
      if (recordIds.length === 0) {
        return alert('请至少选择一条记录');
      }
      
      // 确认创建
      if (!window.confirm(`确认创建报销单？\n选择了 ${recordIds.length} 条记录，总金额：¥${totalAmount.toFixed(2)}`)) {
        return;
      }
      
      // 调用API创建报销单
 // TODO: 请手动替换为api.get()或api.post()等方法
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reimbursement-forms/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ reimbursement_ids: recordIds })
      });
      
      const data = await res.json();
      if (!res.ok) return alert(data.msg || '创建报销单失败');
      
      alert(`报销单创建成功！\n报销单编号：${data.form.formNumber}\n包含记录：${data.form.recordCount}条\n总金额：¥${data.form.totalAmount}`);
      fetchList(); // 刷新列表
      
    } catch (e) {
      alert('创建报销单失败');
    }
  };
    
    if (!window.confirm(`将生成包含 ${managerApprovedCount} 条已审批记录的PDF报销单，生成后这些记录将标记为"已生成PDF"状态。是否继续？`)) {
      return;
    }
    
    try {
 // TODO: 请手动替换为api.get()或api.post()等方法
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/reimbursements/pdf/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({msg:'导出失败'}));
        return alert(err.msg||'导出失败');
      }
      const blob = await res.blob();
      fileDownload(blob, `报销单_${new Date().toISOString().slice(0,10)}.pdf`);
      
      // 刷新列表以显示更新后的状态
      alert('PDF报销单已生成并下载！记录状态已更新。');
      fetchList();
    } catch(e) {
      alert('导出失败');
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line
  }, [tab]);

  // 姓名筛选自动查询，仅审批区可用
  useEffect(() => {
    if (!isApproval) return;
    if (nameDebounce) clearTimeout(nameDebounce);
    const timer = setTimeout(() => {
      fetchList();
    }, 400);
    setNameDebounce(timer);
    // eslint-disable-next-line
  }, [filterName]);

  // 获取单条报销的附件
  const fetchAttachments = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/reimbursements/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.attachments && res.data.attachments.length > 0) {
        setPreviewFiles(res.data.attachments.map(a => {
          let rawUrl = a.url || a.file_path;
          // 修正反斜杠为正斜杠，兼容Windows路径
          let url = rawUrl ? rawUrl.replace(/\\/g, '/') : '';
          // 如果不是http/https开头，自动补全为/static/uploads前缀
          if (url && !/^https?:\/\//.test(url) && !url.startsWith('/uploads/')) {
            url = '/uploads/' + url.replace(/^uploads[\/]/, '');
          }
          return {
            url,
            type: a.file_type,
            name: (a.file_path||'').split(/[/\\]/).pop() || '附件'
          };
        }));
        setPreviewOpen(true);
      } else {
        setPreviewFiles([]);
        setPreviewOpen(true);
      }
    } catch {
      setPreviewFiles([]);
      setPreviewOpen(true);
    }
  };

  const fetchList = async () => {
    setError('');
    try {
      const token = localStorage.getItem('token');
      let url = '/api/reimbursements';
      const params = [];
      if (tab === 'my') params.push('my=1');
      else if (tab === 'todo') params.push('todo=1');
      else if (tab === 'all') ;
      if (isApproval && filterName.trim()) params.push('real_name=' + encodeURIComponent(filterName.trim()));
      if (params.length) url += '?' + params.join('&');
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setList(res.data);
    } catch (e) {
      setError('获取报销列表失败');
    }
  };

  // 状态中文映射
  const statusMap = {
    pending: '待财务审核', // 明确为待财务审核
    finance_approved: '财务已通过',
    finance_rejected: '财务已驳回',
    manager_approved: '总经理已通过',
    manager_rejected: '总经理已驳回',
    pdf_generated: '已生成PDF报销单',
    paid: '已支付',
    // 兼容旧状态
    rejected: '财务已驳回',
  };
  // 排序和筛选处理
  let filteredList = list;
  if (filterStatus) filteredList = filteredList.filter(l => l.status === filterStatus);
  filteredList = [...filteredList].sort((a, b) => {
    let v1 = a[sortKey], v2 = b[sortKey];
    if (sortKey === 'amount') { v1 = Number(v1)||0; v2 = Number(v2)||0; }
    if (sortOrder === 'asc') return v1 > v2 ? 1 : v1 < v2 ? -1 : 0;
    return v1 < v2 ? 1 : v1 > v2 ? -1 : 0;
  });

  return (
    <div style={{maxWidth:900,margin:'32px auto'}}>
      <h3>报销单列表</h3>
      {/* 批量操作，仅审批区显示；我的报销区显示导出PDF */}
      {isApproval ? (
        <div style={{marginBottom:16,display:'flex',alignItems:'center',gap:16}}>
          <button onClick={handleBatchApprove} disabled={selectedIds.length===0} style={{padding:'6px 18px',background:'#52c41a',color:'#fff',border:'none',borderRadius:4,cursor:selectedIds.length===0?'not-allowed':'pointer'}}>批量同意</button>
          <button onClick={handleBatchDownload} disabled={selectedIds.length===0} style={{padding:'6px 18px',background:'#1677ff',color:'#fff',border:'none',borderRadius:4,cursor:selectedIds.length===0?'not-allowed':'pointer'}}>批量下载凭证</button>
          <span style={{color:'#888',fontSize:13}}>已选{selectedIds.length}项</span>
        </div>
      ) : (
        <div style={{marginBottom:16,display:'flex',alignItems:'center',gap:16}}>
          <button onClick={handleExportPDF} style={{padding:'6px 18px',background:'#1677ff',color:'#fff',border:'none',borderRadius:4}}>导出我的报销单PDF</button>
        </div>
      )}
      {/* 筛选和排序控件 */}
      <div style={{display:'flex',gap:16,marginBottom:16,alignItems:'center'}}>
      {isApproval && <>
        <input placeholder="按报销人姓名筛选" value={filterName} onChange={e=>setFilterName(e.target.value)} style={{padding:'4px 8px',border:'1px solid #ccc',borderRadius:4}} />
        <button onClick={fetchList} style={{padding:'4px 12px'}}>查询</button>
        {/* 输入后自动查询，按钮保留可手动刷新 */}
      </>}
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="pending">待财务审核</option>
          <option value="finance_approved">财务已通过</option>
          <option value="finance_rejected">财务已驳回</option>
          <option value="manager_approved">总经理已通过</option>
          <option value="manager_rejected">总经理已驳回</option>
          <option value="pdf_generated">已生成PDF报销单</option>
          <option value="paid">已支付</option>
          <option value="rejected">已驳回（兼容）</option>
        </select>
        <select value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          <option value="created_at">按创建时间</option>
          <option value="amount">按金额</option>
          <option value="status">按状态</option>
        </select>
        <select value={sortOrder} onChange={e=>setSortOrder(e.target.value)}>
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </div>
      {/* 原tab切换 */}
      <div style={{marginBottom:32, display:'flex', justifyContent:'center', gap:16}}>
        {isApproval ? (
          <>
            <button
              onClick={()=>setTab('todo')}
              disabled={tab==='todo'}
              style={{
                background: tab==='todo' ? '#1677ff' : '#e6f0ff',
                color: tab==='todo' ? '#fff' : '#1677ff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 40px',
                fontSize: 16,
                fontWeight: 500,
                cursor: tab==='todo' ? 'default' : 'pointer',
                boxShadow: tab==='todo' ? '0 2px 8px #1677ff22' : 'none',
                transition: 'all 0.2s',
              }}
            >待我审批</button>
            <button
              onClick={()=>setTab('all')}
              disabled={tab==='all'}
              style={{
                background: tab==='all' ? '#1677ff' : '#e6f0ff',
                color: tab==='all' ? '#fff' : '#1677ff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 40px',
                fontSize: 16,
                fontWeight: 500,
                cursor: tab==='all' ? 'default' : 'pointer',
                boxShadow: tab==='all' ? '0 2px 8px #1677ff22' : 'none',
                transition: 'all 0.2s',
              }}
            >全部</button>
          </>
        ) : (
          <button
            onClick={()=>setTab('my')}
            disabled={tab==='my'}
            style={{
              background: tab==='my' ? '#1677ff' : '#e6f0ff',
              color: tab==='my' ? '#fff' : '#1677ff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 40px',
              fontSize: 16,
              fontWeight: 500,
              cursor: tab==='my' ? 'default' : 'pointer',
              boxShadow: tab==='my' ? '0 2px 8px #1677ff22' : 'none',
              transition: 'all 0.2s',
            }}
          >我的报销</button>
        )}
      </div>
      {error && <div style={{color:'#d93026'}}>{error}</div>}
      <table border="1" cellPadding="8" style={{width:'100%',background:'#fff'}}>
        <thead>
          <tr>
            {isApproval && <th><input type="checkbox" checked={selectedIds.length===filteredList.length&&filteredList.length>0} onChange={e=>handleSelectAll(e.target.checked)} /></th>}
            <th>序号</th><th>类型</th><th>金额</th><th>用途</th><th>备注</th>{isApproval && <th>报销人</th>}<th>状态</th><th>创建时间</th><th>操作</th><th>凭证</th>
          </tr>
        </thead>
        <tbody>
          {filteredList.map((l, idx)=>(
            <tr key={l.id} style={{transition:'background 0.2s'}}>
              {isApproval && <td><input type="checkbox" checked={selectedIds.includes(l.id)} onChange={e=>handleSelect(l.id, e.target.checked)} /></td>}
              <td style={{cursor:'pointer'}} onClick={()=>navigate(`/reimbursements/${l.id}`)}>{idx+1}</td>
              <td>{l.type || '-'}</td>
              <td>{l.amount}</td>
              <td>{l.purpose || '-'}</td>
              <td>{l.remark || ''}</td>
              {isApproval && <td>{l.real_name||''}</td>}
              <td>{statusMap[l.status] || l.status}</td>
              <td>{l.created_at}</td>
              <td>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  {(['pending','rejected'].includes(l.status) && String(l.user_id)===String(localStorage.getItem('user_id')||''))
                    ? <button onClick={()=>navigate(`/reimbursements/edit/${l.id}`)} style={{marginRight:8}}>编辑</button>
                    : <button onClick={()=>navigate(`/reimbursements/${l.id}`)} style={{marginRight:8}}>查看</button>}
                  
                  {/* 财务PDF下载按钮：仅财务角色且状态为pdf_generated时显示 */}
                  {role === 'finance' && l.status === 'pdf_generated' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPDF(l.user_id, l.real_name || l.username);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: '#1677ff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer',
                        marginRight: 4
                      }}
                    >
                      下载PDF
                    </button>
                  )}
                  
                  {/* 财务确认打款按钮：仅财务角色且状态为pdf_generated时显示 */}
                  {role === 'finance' && l.status === 'pdf_generated' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmPayment(l.user_id, l.real_name || l.username);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: '#52c41a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      确认打款
                    </button>
                  )}
                </div>
              </td>
              <td>
                <button onClick={()=>fetchAttachments(l.id)} style={{fontSize:13}}>预览</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{color:'#888',marginTop:8}}>点击行可查看详情与审批</div>

      {/* 附件预览弹窗 */}
      {previewOpen && (
        <div style={{position:'fixed',left:0,top:0,width:'100vw',height:'100vh',background:'#0008',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setPreviewOpen(false)}>
          <div style={{background:'#fff',padding:24,borderRadius:8,maxWidth:800,maxHeight:'90vh',overflow:'auto'}} onClick={e=>e.stopPropagation()}>
            <h4>报销凭证预览</h4>
            {previewFiles.length===0 && <div style={{color:'#888'}}>无附件</div>}
            {previewFiles.map((f,i)=>(
              <div key={i} style={{marginBottom:16}}>
                {f.type && f.type.startsWith('image') ? (
                  <img src={f.url} alt={f.name} style={{maxWidth:600,maxHeight:300,display:'block',marginBottom:4}} />
                ) : f.type && f.type==='application/pdf' ? (
                  <iframe src={f.url} title={f.name} style={{width:600,height:400,border:'1px solid #ccc'}} />
                ) : (
                  <a href={f.url} target="_blank" rel="noreferrer">下载附件</a>
                )}
                <div style={{fontSize:12,color:'#888'}}>{f.name}</div>
              </div>
            ))}
            <button onClick={()=>setPreviewOpen(false)} style={{marginTop:8}}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}

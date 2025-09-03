import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { api } from '../utils/api';


export default function LoanUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loans, setLoans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUser();
    fetchLoans(1, pageSize, search);
    // eslint-disable-next-line
  }, [userId]);

  const fetchUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data);
    } catch {
      setUser(null);
    }
  };

  const fetchLoans = async (pageNum = 1, pageSz = pageSize, kw = search) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/loans?user_id=${userId}&page=${pageNum}&pageSize=${pageSz}&search=${encodeURIComponent(kw)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLoans(res.data.loans || []);
      setTotal(res.data.total || 0);
      setPage(pageNum);
    } catch (e) {
      setError('获取借款明细失败');
    }
    setLoading(false);
  };

  const handleSearch = () => {
    fetchLoans(1, pageSize, search);
  };

  const handlePageChange = (newPage) => {
    fetchLoans(newPage, pageSize, search);
  };

  const handlePageSizeChange = (e) => {
    setPageSize(Number(e.target.value));
    fetchLoans(1, Number(e.target.value), search);
  };

  const handleViewReimbursement = (reimId) => {
    window.open(`/reimbursement-form/${reimId}`, '_blank');
  };

  return (
    <div style={{maxWidth:900,margin:'32px auto'}}>
      <div style={{display:'flex',alignItems:'center',marginBottom:16}}>
        <button onClick={()=>navigate(-1)} style={{marginRight:16}}>返回</button>
        <h3 style={{margin:0}}>员工借款明细</h3>
      </div>
      {user && (
        <div style={{marginBottom:16,color:'#555'}}>
          <b>姓名：</b>{user.real_name} &nbsp; <b>账号：</b>{user.username}
        </div>
      )}
      <div style={{marginBottom:16,display:'flex',gap:8}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索用途/备注" style={{padding:'4px 8px',border:'1px solid #ccc',borderRadius:4}} />
        <button onClick={handleSearch}>搜索</button>
        <select value={pageSize} onChange={handlePageSizeChange}>
          <option value={10}>10条/页</option>
          <option value={20}>20条/页</option>
          <option value={50}>50条/页</option>
        </select>
      </div>
      {error && <div style={{color:'#d93026'}}>{error}</div>}
      <table border="1" cellPadding="8" style={{width:'100%',background:'#fff'}}>
        <thead>
          <tr>
            <th>借款编号</th><th>金额</th><th>用途</th><th>状态</th><th>创建时间</th><th>冲抵报销单</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {loans.map(loan => (
            <tr key={loan.id}>
              <td>#{loan.id}</td>
              <td>¥{loan.amount}</td>
              <td>{loan.purpose}</td>
              <td>{loan.status_zh || loan.status}</td>
              <td>{dayjs(loan.created_at).format('YYYY-MM-DD')}</td>
              <td>
                {loan.offsets && loan.offsets.length > 0 ? loan.offsets.map(offset => (
                  <div key={offset.reimbursement_id || offset.form_id}>
                    <span style={{color:'#1677ff',cursor:'pointer'}} onClick={()=>handleViewReimbursement(offset.reimbursement_id || offset.form_id)}>
                      #{offset.reimbursement_id || offset.form_id}（¥{Number(offset.offset_amount || offset.amount).toFixed(2)}）
                    </span>
                    {offset.linked_at && (
                      <span style={{color:'#888',fontSize:12,marginLeft:4}}>
                        {new Date(offset.linked_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )) : '-'}
              </td>
              <td>
                <button onClick={()=>navigate(`/loans/${loan.id}`)}>查看详情</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* 分页 */}
      <div style={{marginTop:16,display:'flex',alignItems:'center',gap:8}}>
        <button disabled={page<=1} onClick={()=>handlePageChange(page-1)}>上一页</button>
        <span>第 {page} / {Math.ceil(total/pageSize)||1} 页</span>
        <button disabled={page>=Math.ceil(total/pageSize)} onClick={()=>handlePageChange(page+1)}>下一页</button>
        <span>共 {total} 条</span>
      </div>
    </div>
  );
}

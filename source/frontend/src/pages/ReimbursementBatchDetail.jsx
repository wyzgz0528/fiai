import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../utils/api';


function ReimbursementBatchDetail() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      try { // TODO: 请手动替换为api.get()或api.post()等方法
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/reimbursement-batch/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setDetail(data);
      } catch (e) {
        setDetail(null);
      }
      setLoading(false);
    }
    fetchDetail();
  }, [id]);

  const handleDownloadPDF = async () => { // TODO: 请手动替换为api.get()或api.post()等方法
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/reimbursement-batch/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `报销批次_${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      alert('PDF下载失败');
    }
  };

  const handleDownloadExcel = async () => { // TODO: 请手动替换为api.get()或api.post()等方法
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/reimbursement-batch/${id}/excel`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `报销批次_${id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      alert('Excel下载失败');
    }
  };

  if (loading) return <div style={{padding:24}}>加载中...</div>;
  if (!detail) return <div style={{padding:24}}>未找到批次详情</div>;

  const { batch, items, offsets } = detail;

  return (
    <div style={{padding:24}}>
      <h2>批次详情</h2>
      <div style={{marginBottom:16}}>
        <strong>批次号：</strong>{batch.batch_number}<br/>
        <strong>申请人：</strong>{batch.real_name}<br/>
        <strong>状态：</strong>{batch.status}<br/>
        <strong>创建时间：</strong>{batch.created_at}<br/>
        <button onClick={handleDownloadPDF}>导出PDF</button>
        <button onClick={handleDownloadExcel} style={{marginLeft:8}}>导出Excel</button>
      </div>
      <h3>包含报销单</h3>
      <table border="1" cellPadding="8" style={{width:'100%',marginBottom:24}}>
        <thead>
          <tr>
            <th>ID</th>
            <th>类型</th>
            <th>金额</th>
            <th>用途</th>
            <th>备注</th>
            <th>状态</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.type}</td>
              <td>{item.amount}</td>
              <td>{item.purpose}</td>
              <td>{item.remark}</td>
              <td>{item.status}</td>
              <td>{item.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>借款抵扣明细</h3>
      <table border="1" cellPadding="8" style={{width:'100%'}}>
        <thead>
          <tr>
            <th>ID</th>
            <th>借款用途</th>
            <th>抵扣金额</th>
            <th>抵扣日期</th>
          </tr>
        </thead>
        <tbody>
          {offsets.map(offset => (
            <tr key={offset.id}>
              <td>{offset.loan_id}</td>
              <td>{offset.purpose}</td>
              <td>{offset.offset_amount}</td>
              <td>{offset.offset_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ReimbursementBatchDetail;

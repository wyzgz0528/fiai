import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';


function ReimbursementBatchList() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchBatches() {
      setLoading(true);
      try { // TODO: 请手动替换为api.get()或api.post()等方法
        const token = localStorage.getItem('token');
        const res = await fetch('/api/reimbursement-batch/list', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setBatches(Array.isArray(data) ? data : []);
      } catch (e) {
        setBatches([]);
      }
      setLoading(false);
    }
    fetchBatches();
  }, []);

  return (
    <div style={{padding:24}}>
      <h2>报销批次列表</h2>
      {loading ? <div>加载中...</div> : (
        <table border="1" cellPadding="8" style={{width:'100%',marginTop:16}}>
          <thead>
            <tr>
              <th>批次号</th>
              <th>申请人</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(batch => (
              <tr key={batch.id}>
                <td>{batch.batch_number}</td>
                <td>{batch.real_name}</td>
                <td>{batch.status}</td>
                <td>{batch.created_at}</td>
                <td>
                  <button onClick={() => navigate(`/batch/${batch.id}`)}>详情</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ReimbursementBatchList;

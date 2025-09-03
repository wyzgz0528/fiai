import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Input, Button, Tag, Popconfirm, message, Switch } from 'antd';
import { api } from '../utils/api';

export default function AdminLoans() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/loans', { params: { search, pageSize: 200 } });
      const data = res.data || {};
      let list = Array.isArray(data.loans) ? data.loans : [];
      if (onlyActive) list = list.filter(x => Number(x.remaining_amount || 0) > 0);
      setRows(list);
    } catch (e) {
      message.error(e.response?.data?.msg || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const removeLoan = async (id) => {
    try {
      await api.delete(`/api/loans/${id}`);
      message.success('删除成功');
      fetchData();
    } catch (e) {
      // 优先使用 message 字段，然后是 msg 字段
      const errorMsg = e.response?.data?.message || e.response?.data?.msg || '删除失败';
      message.error(errorMsg);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '申请人', dataIndex: 'real_name', width: 140 },
    { title: '用途', dataIndex: 'purpose', width: 200 },
    { title: '总额', dataIndex: 'amount', width: 120, render: v => `¥${Number(v||0).toFixed(2)}` },
    { title: '剩余', dataIndex: 'remaining_amount', width: 120, render: v => `¥${Number(v||0).toFixed(2)}` },
    { title: '状态', dataIndex: 'status_en', width: 140, render: (s, r) => {
      const map = { pending:'待财务审核', finance_approved:'财务已审核', manager_approved:'总经理已审批', paid:'已打款', partial_repaid:'部分已还', repaid:'已还清', rejected:'已驳回' };
      const label = map[s] || map[r.status] || r.status || s || '-';
      const color = s==='repaid' ? 'green' : s==='rejected' ? 'red' : s==='paid' ? 'blue' : 'gold';
      return <Tag color={color}>{label}</Tag>;
    }},
    { title: '创建时间', dataIndex: 'created_at', width: 180 },
    { title: '操作', key: 'action', width: 200, render: (_, r) => {
      // 只有草稿和已驳回状态的借款可以删除
      const status = r.status || r.status_en;
      const canDelete = ['草稿', '财务已驳回', '总经理已驳回'].includes(status);

      return (
        <Space>
          <Button size="small" onClick={() => window.open(`/loans/${r.id}`, '_self')}>详情</Button>
          {canDelete ? (
            <Popconfirm title="确定删除此借款？相关冲抵/日志也会同时清理。" okText="删除" cancelText="取消" onConfirm={() => removeLoan(r.id)}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          ) : (
            <Button size="small" danger disabled title="只能删除草稿或已驳回的借款">删除</Button>
          )}
        </Space>
      );
    }}
  ];

  return (
    <Card title="借款管理">
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
        <strong>删除说明：</strong>只能删除草稿状态或已驳回的借款。已审批通过或已打款的借款不能删除，以确保财务记录的完整性。
      </div>
      <Space style={{ marginBottom: 12 }}>
        <Input placeholder="按用途搜索" value={search} onChange={e=>setSearch(e.target.value)} allowClear />
        <Switch checked={onlyActive} onChange={setOnlyActive} />
        <span>仅显示有余额</span>
        <Button onClick={fetchData}>查询</Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
    </Card>
  );
}

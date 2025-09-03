import React, { useEffect, useState } from 'react';
import { Card, Table, Input, Button, Space, Popconfirm, message, Tag } from 'antd';
import { api } from '../utils/api';

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [resetPwd, setResetPwd] = useState({});
  const [onlyDeletable, setOnlyDeletable] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
  const res = await api.get('/api/user/admin/users', { params: { q, onlyDeletable: onlyDeletable ? 1 : undefined, withStats: 1 } });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      message.error(e.response?.data?.msg || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchData(); }, [onlyDeletable]);

  const resetPassword = async (id) => {
    const pwd = resetPwd[id];
    if (!pwd || pwd.length < 8) { message.warning('请输入至少8位的新密码'); return; }
    try {
      await api.post('/api/user/admin/reset-password', { user_id: id, new_password: pwd });
      message.success('已重置');
      setResetPwd(prev => ({ ...prev, [id]: '' }));
    } catch (e) {
      message.error(e.response?.data?.msg || '重置失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '用户名', dataIndex: 'username', width: 160 },
    { title: '姓名', dataIndex: 'real_name', width: 140 },
    { title: '角色', dataIndex: 'role', width: 120, render: v => <Tag color={v==='admin'?'gold': v==='finance'?'blue': v==='manager'?'green':'default'}>{v}</Tag> },
    { title: '统计', key: 'stats', width: 220, render: (_, r) => (
      <Space size={4} wrap>
        <Tag color="geekblue">报销单: {r._stats?.reimbursement_forms ?? '-'}</Tag>
        <Tag color="purple">借款: {r._stats?.loans ?? '-'}</Tag>
        <Tag color="default">旧记录: {r._stats?.reimbursements_legacy ?? '-'}</Tag>
      </Space>
    ) },
    { title: '可删除', dataIndex: '_can_delete', width: 90, render: (v, r) => (
      <Tag color={v ? 'success' : 'default'}>{v && r.role !== 'admin' ? '是' : '否'}</Tag>
    ) },
    { title: '创建时间', dataIndex: 'created_at', width: 180 },
    { title: '操作', key: 'action', width: 420, render: (_, r) => (
      <Space>
        <Input.Password
          placeholder="新密码(>=8位)"
          value={resetPwd[r.id] || ''}
          onChange={(e)=>setResetPwd(prev => ({ ...prev, [r.id]: e.target.value }))}
          style={{ width: 200 }}
        />
        <Button type="primary" onClick={() => resetPassword(r.id)}>重置密码</Button>
        <Popconfirm
          title={`确认删除用户 ${r.username}？`}
          description="仅当该用户没有报销单或借款记录时才允许删除，此操作不可恢复"
          okText="确认删除"
          cancelText="取消"
          onConfirm={async () => {
            try {
              await api.delete(`/api/user/admin/users/${r.id}`);
              message.success('删除成功');
              fetchData();
            } catch (e) {
              const msg = e?.response?.data?.msg || '删除失败';
              const detail = e?.response?.data?.detail;
              if (detail && (detail.reimbursement_forms>0 || detail.loans>0)) {
                message.error(`${msg}：存在历史数据（报销单 ${detail.reimbursement_forms}，借款 ${detail.loans}，旧记录 ${detail.reimbursements_legacy||0}）`);
              } else {
                message.error(msg);
              }
            }
          }}
        >
          <Button danger>删除用户</Button>
        </Popconfirm>
      </Space>
    )}
  ];

  return (
    <Card title="用户管理">
      <Space style={{ marginBottom: 12 }}>
        <Input placeholder="按用户名/姓名搜索" value={q} onChange={e=>setQ(e.target.value)} allowClear />
        <Button onClick={fetchData}>查询</Button>
        <label style={{ userSelect: 'none' }}>
          <input type="checkbox" checked={onlyDeletable} onChange={e=>setOnlyDeletable(e.target.checked)} style={{ marginRight: 6 }} />
          仅显示可删除用户
        </label>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
    </Card>
  );
}

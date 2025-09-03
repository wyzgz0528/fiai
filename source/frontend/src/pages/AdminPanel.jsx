import React, { useEffect, useMemo, useState } from 'react';
import { Card, Tabs, Table, Button, Space, Input, Popconfirm, message, Tag, Modal, Form, Switch } from 'antd';
import { api } from '../utils/api';
import AdminUsers from './AdminUsers';
import AdminLoans from './AdminLoans';

export default function AdminPanel() {
  const [activeKey, setActiveKey] = useState('forms');
  return (
    <Card title="系统管理（Admin）">
      <Tabs activeKey={activeKey} onChange={setActiveKey} items={[
        { key: 'forms', label: '报销单管理', children: <FormsTab /> },
        { key: 'loans', label: '借款管理', children: <AdminLoans /> },
        { key: 'types', label: '报销类型管理', children: <ExpenseTypesTab /> },
        { key: 'users', label: '用户管理', children: <AdminUsers /> },
        { key: 'backup', label: '备份与恢复', children: <BackupRestoreTab /> },
        { key: 'danger', label: '数据清理', children: <DangerTab /> },
      ]} />
    </Card>
  );
}

function FormsTab() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (name) params.real_name = name;
      if (status) params.status = status;
      const res = await api.get('/api/reimbursement/reimbursement-forms', { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      message.error(e.response?.data?.msg || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/reimbursement/admin/reimbursement-forms/${id}`);
      message.success('删除成功');
      fetchData();
    } catch (e) {
      // 优先使用 message 字段，然后是 msg 字段
      const errorMsg = e.response?.data?.message || e.response?.data?.msg || '删除失败';
      message.error(errorMsg);
    }
  };

  const columns = [
    { title: '报销单号', dataIndex: 'form_number', key: 'form_number', width: 160 },
    { title: '报销人', dataIndex: 'real_name', key: 'real_name', width: 140 },
    { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 120, render: v => `¥${Number(v||0).toFixed(2)}` },
    { title: '状态', dataIndex: 'status_en', key: 'status', width: 140, render: (s, r) => {
      const map = {
        draft:'草稿',
        submitted:'待财务审核',
        finance_approved:'财务已通过',
        finance_rejected:'财务已驳回',
        manager_approved:'总经理已通过',
        manager_rejected:'总经理已驳回',
        paid:'已打款',
        // 兼容旧状态
        rejected:'财务已驳回'
      };
      const label = map[s] || map[r.status] || r.status || s || '-';
      const color = (s==='paid'||r.status==='已打款') ? 'green' :
                   (s==='finance_rejected'||s==='manager_rejected'||s==='rejected'||r.status==='已驳回'||r.status==='财务已驳回'||r.status==='总经理已驳回') ? 'red' : 'blue';
      return <Tag color={color}>{label}</Tag>;
    }},
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
    { title: '操作', key: 'action', width: 120, render: (_, r) => {
      // 只有草稿和已驳回状态的报销单可以删除
      const canDelete = ['草稿', '财务已驳回', '总经理已驳回'].includes(r.status);

      return (
        <Space>
          {canDelete ? (
            <Popconfirm title="确定删除此报销单？" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消">
              <Button danger size="small">删除</Button>
            </Popconfirm>
          ) : (
            <Button danger size="small" disabled title="只能删除草稿或已驳回的报销单">删除</Button>
          )}
          <Button size="small" onClick={() => window.open(`/reimbursement-forms/${r.id}`, '_self')}>详情</Button>
        </Space>
      );
    }}
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
        <strong>删除说明：</strong>只能删除草稿状态或已驳回的报销单。已审批通过或已打款的报销单不能删除，以确保财务记录的完整性。
      </div>
      <Space style={{ marginBottom: 12 }}>
        <Input placeholder="按报销人姓名筛选" value={name} onChange={e=>setName(e.target.value)} allowClear />
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="草稿">草稿</option>
          <option value="待财务审核">待财务审核</option>
          <option value="财务已审核">财务已审核</option>
          <option value="总经理已审批">总经理已审批</option>
          <option value="已打款">已打款</option>
          <option value="已驳回">已驳回</option>
        </select>
        <Button onClick={fetchData}>查询</Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
    </div>
  );
}

function ExpenseTypesTab() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/reimbursement/admin/expense-types');
      // 处理后端返回的 { success: true, data: [...] } 结构
      const data = res.data?.data || res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e.response?.data?.msg || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const addType = async (values) => {
    try {
      await api.post('/api/reimbursement/admin/expense-types', values);
      message.success('新增成功');
      form.resetFields();
      fetchData();
    } catch (e) {
      message.error(e.response?.data?.msg || '新增失败');
    }
  };

  const updateType = async (id, patch) => {
    try {
      await api.put(`/api/reimbursement/admin/expense-types/${id}` , patch);
      fetchData();
    } catch (e) {
      message.error(e.response?.data?.msg || '更新失败');
    }
  };

  const deleteType = async (id) => {
    try {
      await api.delete(`/api/reimbursement/admin/expense-types/${id}`);
      message.success('删除成功');
      fetchData();
    } catch (e) {
      message.error(e.response?.data?.msg || '删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '名称', dataIndex: 'name', render: (v, r) => (
      <Input defaultValue={v} onBlur={(e)=>{
        const nv = e.target.value.trim();
        if (nv && nv !== v) updateType(r.id, { name: nv });
      }} />
    )},
    { title: '启用', dataIndex: 'active', width: 100, render: (v, r) => (
      <Switch checked={!!v} onChange={(checked)=>updateType(r.id, { active: checked ? 1 : 0 })} />
    )},
    { title: '操作', key: 'action', width: 120, render: (_, r) => (
      <Popconfirm title="确定删除此类型？" onConfirm={() => deleteType(r.id)} okText="删除" cancelText="取消">
        <Button danger size="small">删除</Button>
      </Popconfirm>
    )}
  ];

  return (
    <div>
      <Form form={form} layout="inline" onFinish={addType} style={{ marginBottom: 12 }}>
        <Form.Item name="name" rules={[{ required: true, message: '请输入类型名称' }]}> 
          <Input placeholder="新增类型名称" />
        </Form.Item>
        <Form.Item name="active" initialValue={1} valuePropName="checked">
          <Switch defaultChecked />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">新增</Button>
        </Form.Item>
      </Form>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
    </div>
  );
}

function DangerTab() {
  const purgeAll = async () => {
    Modal.confirm({
      title: '危险操作确认',
      content: '将清空所有报销、借款及其关联与凭证文件，且不可恢复。确定继续？',
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try { await api.delete('/api/reimbursement/admin/purge-all'); message.success('已清空'); }
        catch (e) { message.error(e.response?.data?.msg || '清空失败'); }
      }
    });
  };
  return (
    <div>
      <p style={{ color: '#d46b08' }}>执行前请先到“备份与恢复”标签下载最新备份。</p>
      <Button danger onClick={purgeAll}>清空报销与借款数据</Button>
    </div>
  );
}

function BackupRestoreTab() {
  const [uploading, setUploading] = useState(false);
  const doBackup = async () => {
    try {
      message.loading({ content: '正在生成备份...', key: 'backup' });
      const res = await api.get('/api/reimbursement/admin/backup/full', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:T]/g,'-').replace(/\..+/, '');
      a.href = url; a.download = `backup_${ts}.zip`; document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      message.success({ content: '备份已下载', key: 'backup' });
    } catch (e) {
      message.error({ content: e.response?.data?.msg || '备份失败', key: 'backup' });
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Modal.confirm({
      title: '确认恢复',
      content: '该操作将覆盖当前数据库与上传文件，继续？',
      okText: '恢复',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setUploading(true);
        try {
          const form = new FormData();
            form.append('file', file);
          const res = await api.post('/api/reimbursement/admin/backup/restore', form, { headers: { 'Content-Type': 'multipart/form-data' } });
          message.success(res.data.msg || '恢复成功');
        } catch (err) {
          message.error(err.response?.data?.msg || '恢复失败');
        } finally {
          setUploading(false);
          e.target.value = '';
        }
      }
    });
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="数据备份" size="small">
        <Space>
          <Button type="primary" onClick={doBackup}>生成并下载全量备份 ZIP</Button>
        </Space>
        <p style={{ marginTop: 12, color: '#666' }}>包含数据库、上传文件、凭证及关键表 JSON 导出。</p>
      </Card>
      <Card title="数据恢复" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <input type="file" accept=".zip" onChange={handleRestore} disabled={uploading} />
          <p style={{ color:'#aa0000', margin:0 }}>恢复前请务必先下载备份。恢复后建议刷新页面重新登录。</p>
        </Space>
      </Card>
    </Space>
  );
}

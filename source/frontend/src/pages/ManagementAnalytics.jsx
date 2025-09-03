import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Select, DatePicker, Space, Statistic, message, Segmented, Input, Button, Tag } from 'antd';
import { api } from '../utils/api';
import ReactEcharts from 'echarts-for-react';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function ManagementAnalytics() {
  const role = localStorage.getItem('role');
  if (!['finance','manager','admin'].includes(role)) return <div>无权限</div>;

  const [dataset, setDataset] = useState('reimbursements');
  const [groupBy, setGroupBy] = useState('month');
  const [metric, setMetric] = useState('amount');
  const [range, setRange] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ data: [], totals: { count:0, amount:0 }, meta:{} });
  const [trend, setTrend] = useState({ data: [] });
  // 仅姓名模糊筛选
  const [realName, setRealName] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ real_name: '' });

  const applyUserFilters = () => {
    setAppliedFilters({ real_name: realName.trim() });
  };
  const clearUserFilters = () => {
    setRealName(''); setAppliedFilters({ real_name:'' });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { dataset, group_by: groupBy, metric };
      if (range && range.length === 2) {
        params.start = range[0].format('YYYY-MM-DD');
        params.end = range[1].format('YYYY-MM-DD');
      }
      if (appliedFilters.real_name) params.real_name = appliedFilters.real_name;
      const [sRes, tRes] = await Promise.all([
        api.get('/api/analytics/summary', { params }),
        api.get('/api/analytics/trend', { params: { dataset, metric, months: 6 } })
      ]);
      setSummary(sRes.data);
      setTrend(tRes.data);
    } catch (e) {
      message.error(e.response?.data?.msg || '加载统计失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [dataset, groupBy, metric, range, appliedFilters]);

  const barOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: summary.data.map(d => d.label) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: summary.data.map(d => d.value),
      itemStyle: { color: '#1890ff' }
    }]
  };

  const trendOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trend.data.map(d => d.month) },
    yAxis: { type: 'value' },
    series: [{
      type: 'line',
      smooth: true,
      data: trend.data.map(d => d.value),
      areaStyle: { opacity: 0.15 }
    }]
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="统计筛选" size="small">
        <Space wrap style={{ width:'100%' }}>
          <Segmented value={dataset} onChange={setDataset} options={[{label:'报销明细', value:'reimbursements'},{label:'借款记录', value:'loans'}]} />
          <Select value={groupBy} onChange={setGroupBy} style={{ width:140 }} options={[
            { value:'month', label:'按月份' },
            { value:'user', label:'按提交人' },
            { value:'type', label:'按类型/用途' }
          ]} />
          <Select value={metric} onChange={setMetric} style={{ width:140 }} options={[
            { value:'amount', label:'金额汇总' },
            { value:'count', label:'数量(笔数)' }
          ]} />
          <RangePicker value={range} onChange={setRange} allowClear />
          <Input placeholder="姓名模糊" value={realName} onChange={e=>setRealName(e.target.value)} style={{ width:140 }} allowClear />
          <Button type="primary" onClick={applyUserFilters}>应用</Button>
          <Button onClick={clearUserFilters}>清除</Button>
        </Space>
        {(appliedFilters.real_name) && (
          <Space style={{ marginTop:8 }}>
            {appliedFilters.real_name && <Tag color="purple">姓名包含: {appliedFilters.real_name}</Tag>}
          </Space>
        )}
      </Card>

      <Row gutter={16}>
        <Col span={6}>
          <Card loading={loading} size="small"><Statistic title="记录数" value={summary.totals.count} /></Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} size="small"><Statistic title="总金额" value={summary.totals.amount} precision={2} /></Card>
        </Col>
      </Row>

      <Card title="分组对比" loading={loading} size="small">
        <ReactEcharts style={{ height: 360 }} option={barOption} notMerge lazyUpdate />
      </Card>
      <Card title="近6个月趋势" loading={loading} size="small">
        <ReactEcharts style={{ height: 320 }} option={trendOption} notMerge lazyUpdate />
      </Card>
    </Space>
  );
}

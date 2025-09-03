import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Button, Typography, Space, Progress, Divider } from 'antd';
import {
  FileTextOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  DollarOutlined,
  RiseOutlined,

  PlusOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { loanApi, reimbursementApi, systemApi } from '../utils/api';
import { customStyles } from '../theme';

const { Title, Text } = Typography;

export default function Home() {
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || '';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    loans: { total: 0, pending: 0, approved: 0 },
    reimbursements: { total: 0, pending: 0, approved: 0 }
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // 员工看个人，管理层看全局
      const statsResp = role === 'employee' ? await systemApi.getStatsMine() : await systemApi.getStats();
      const data = statsResp?.data || {};
      let safe = {
        loans: data?.loans || { total: 0, pending: 0, approved: 0 },
        reimbursements: data?.reimbursements || { total: 0, pending: 0, approved: 0 }
      };

      // 若为员工且统计为0，回退用列表接口计算（避免接口差异导致为0）
      if (role === 'employee' && (!safe.loans?.total && !safe.reimbursements?.total)) {
        try {
          const [loanListResp, formListResp] = await Promise.all([
            loanApi.getAll({ params: { my: 1, pageSize: 1000 } }),
            reimbursementApi.getAll({ params: { my: 1, pageSize: 1000 } })
          ]);
          const loanList = loanListResp?.data?.loans || loanListResp?.data?.rows || loanListResp?.data || [];
          const loanTotal = loanListResp?.data?.total ?? loanList.length;
          const formList = formListResp?.data?.rows || formListResp?.data?.forms || formListResp?.data?.list || formListResp?.data?.data || formListResp?.data || [];
          const formTotal = formListResp?.data?.total ?? formList.length;

          const isLoanPending = (item) => {
            const se = (item.status_en || '').toLowerCase();
            const sz = (item.status_zh || item.status || '').toString();
            return ['pending','finance_approved'].includes(se) || ['已提交','财务已审核','财务已通过','待财务审核'].includes(sz);
          };
          const isFormPending = (item) => {
            const s = (item.status || '').toString();
            const se = (item.status_en || '').toLowerCase();
            return ['submitted','finance_approved'].includes(se) || ['待财务审核','财务已审核','已提交'].includes(s);
          };

          safe = {
            ...safe,
            loans: {
              ...safe.loans,
              total: loanTotal || 0,
              pending: Array.isArray(loanList) ? loanList.filter(isLoanPending).length : 0
            },
            reimbursements: {
              ...safe.reimbursements,
              total: formTotal || 0,
              pending: Array.isArray(formList) ? formList.filter(isFormPending).length : 0
            }
          };
        } catch (e) {
          console.warn('统计回退计算失败:', e);
        }
      }

      setStats(safe);
    } catch (error) {
      console.error('加载数据失败:', error);
      setStats({
        loans: { total: 0, pending: 0, approved: 0 },
        reimbursements: { total: 0, pending: 0, approved: 0 }
      });
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="fade-in">
      {/* 欢迎区域 */}
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0, color: customStyles.text.primary }}>
          欢迎回来，{localStorage.getItem('real_name') || '用户'}
        </Title>
        <Text style={{ color: customStyles.text.secondary, fontSize: '16px' }}>
          今天是 {new Date().toLocaleDateString('zh-CN', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
          })}
        </Text>
      </div>

      {/* 统计卡片（按需求展示4张） */}
      <Row gutter={[24, 24]} style={{ marginBottom: '32px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="card-hover" loading={loading}>
            <Statistic
              title={role === 'employee' ? '我的借款单总数' : '借款单总数'}
              value={stats.loans.total}
              prefix={<FileTextOutlined style={{ color: customStyles.status.info }} />}
              valueStyle={{ color: customStyles.status.info }}
            />
            <Progress 
              percent={stats.loans.total > 0 ? (stats.loans.approved / stats.loans.total) * 100 : 0}
              size="small"
              strokeColor={customStyles.status.success}
              showInfo={false}
              style={{ marginTop: '8px' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="card-hover" loading={loading}>
            <Statistic
              title={role === 'employee' ? '待审批借款数（我的）' : '待审批借款数'}
              value={stats.loans.pending}
              prefix={<ClockCircleOutlined style={{ color: customStyles.status.warning }} />}
              valueStyle={{ color: customStyles.status.warning }}
            />
            <Text style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
              待财务审核/总经理审批
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="card-hover" loading={loading}>
            <Statistic
              title={role === 'employee' ? '我的报销单总数（仅统计报销单）' : '报销单总数（仅统计报销单）'}
              value={stats.reimbursements.total}
              prefix={<AuditOutlined style={{ color: customStyles.status.success }} />}
              valueStyle={{ color: customStyles.status.success }}
            />
            <Progress 
              percent={stats.reimbursements.total > 0 ? (stats.reimbursements.approved / stats.reimbursements.total) * 100 : 0}
              size="small"
              strokeColor={customStyles.status.success}
              showInfo={false}
              style={{ marginTop: '8px' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="card-hover" loading={loading}>
            <Statistic
              title={role === 'employee' ? '待审批报销单数（我的）' : '待审批报销单数'}
              value={stats.reimbursements.pending}
              prefix={<ClockCircleOutlined style={{ color: customStyles.status.warning }} />}
              valueStyle={{ color: customStyles.status.warning }}
            />
            <Text style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
              待财务审核/总经理审批
            </Text>
          </Card>
        </Col>
      </Row>

      {/* 快速操作 */}
      <Row gutter={[24, 24]} style={{ marginBottom: '32px' }}>
        <Col xs={24}>
          <Card 
            title="快速操作" 
            className="card-hover"
            extra={
              <Space>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/loans/new')}
                  className="btn-hover"
                >
                  申请借款
                </Button>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/reimbursement-forms/new')}
                  className="btn-hover"
                >
                  申请报销
                </Button>
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Card 
                  size="small" 
                  className="card-hover"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/loans')}
                >
                  <Space>
                    <FileTextOutlined style={{ fontSize: '24px', color: customStyles.status.info }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>我的借款</div>
                      <div style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                        查看和管理借款记录
                      </div>
                    </div>
                  </Space>
                </Card>
              </Col>
              
              <Col span={12}>
                <Card 
                  size="small" 
                  className="card-hover"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/reimbursement-forms?my=1')}
                >
                  <Space>
                    <AuditOutlined style={{ fontSize: '24px', color: customStyles.status.success }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>我的报销</div>
                      <div style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                        查看和管理报销记录
                      </div>
                    </div>
                  </Space>
                </Card>
              </Col>
              
              {['finance','manager'].includes(role) && (
                <Col span={12}>
                  <Card 
                    size="small" 
                    className="card-hover"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate('/loans?todo=1')}
                  >
                    <Space>
                      <ClockCircleOutlined style={{ fontSize: '24px', color: customStyles.status.warning }} />
                      <div>
                        <div style={{ fontWeight: 500 }}>待审核/审批（仅财务/总经理）</div>
                        <div style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                          查看待财务审核/总经理审批的申请
                        </div>
                      </div>
                    </Space>
                  </Card>
                </Col>
              )}
              
              <Col span={12}>
                <Card 
                  size="small" 
                  className="card-hover"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/profile')}
                >
                  <Space>
                    <UserOutlined style={{ fontSize: '24px', color: customStyles.status.info }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>个人信息</div>
                      <div style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                        查看和编辑个人信息
                      </div>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
        

      </Row>

      {/* 系统状态（仅财务/总经理/admin） */}
      {['finance','manager','admin'].includes(role) && (
        <Card 
          title="系统状态" 
          className="card-hover"
          extra={
            <Button 
              type="link" 
              icon={<EyeOutlined />}
              onClick={() => navigate('/health-check')}
            >
              详细检查
            </Button>
          }
        >
          <Row gutter={[24, 16]}>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 600, color: customStyles.status.success }}>
                  正常
                </div>
                <div style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                  系统运行状态
                </div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 600, color: customStyles.status.info }}>
                  99.9%
                </div>
                <div style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                  系统可用性
                </div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 600, color: customStyles.status.warning }}>
                  <RiseOutlined />
                </div>
                <div style={{ fontSize: '12px', color: customStyles.text.tertiary }}>
                  性能良好
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
}
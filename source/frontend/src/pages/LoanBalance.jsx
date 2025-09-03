

import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';


const LoanBalance = () => {
  const [userBalances, setUserBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [loanDetails, setLoanDetails] = useState([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(10);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  const userRole = JSON.parse(localStorage.getItem('user'))?.role || 'employee';
  const userId = JSON.parse(localStorage.getItem('user'))?.id;


  useEffect(() => {
    fetchLoanBalances();
  }, []);

  const fetchLoanBalances = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/loan-balances');
      setUserBalances(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('加载借款余额失败');
    } finally {
      setLoading(false);
    }
  };

  // 明细弹窗相关
  const fetchLoanDetails = async (user) => {
    setShowDetail(true);
    setDetailUser(user);
    setLoanDetails([]);
    setDetailTotal(0);
    setDetailLoading(true);
    try {
      const url = `/api/loans/user/${user.user_id}`;
      const { data } = await api.get(url, { params: { page: detailPage, pageSize: detailPageSize, search: detailSearch } });
      setLoanDetails(data.loans || []);
      setDetailTotal(data.total || 0);
    } catch (err) {
      setError('加载借款明细失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 翻页、搜索
  const handleDetailPageChange = (page) => {
    setDetailPage(page);
    if (detailUser) fetchLoanDetails(detailUser);
  };
  const handleDetailSearch = (e) => {
    setDetailSearch(e.target.value);
  };
  const handleDetailSearchSubmit = (e) => {
    e.preventDefault();
    setDetailPage(1);
    if (detailUser) fetchLoanDetails(detailUser);
  };



  const getStatusText = (status) => {
    const statusMap = {
          'pending': '待审核',
          'finance_approved': '财务已审核',
          'manager_approved': '总经理已批准',
          'paid': '待归还',
          'partial_repaid': '部分还款',
          'repaid': '已结清',
          'rejected': '已拒绝',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status) => {
    const colorMap = {
          'pending': 'text-yellow-600',
          'finance_approved': 'text-blue-600', 
          'manager_approved': 'text-green-600',
          'paid': 'text-green-600',
          'partial_repaid': 'text-orange-500',
          'repaid': 'text-gray-600',
          'rejected': 'text-red-600',
    };
    return colorMap[status] || 'text-gray-600';
  };


  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">加载中...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="text-red-800">{error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">借款余额管理</h1>
        <p className="text-gray-600">查看和管理员工借款余额信息</p>
      </div>


      {/* 标签导航已移除，保留单一汇总和明细弹窗功能 */}


      {/* 借款余额汇总 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            {userRole === 'employee' ? '我的借款余额' : '员工借款余额汇总'}
          </h3>
          {userBalances.length === 0 ? (
            <div className="text-center py-8 text-gray-500">暂无借款余额记录</div>
          ) : (
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">工号</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">员工姓名</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">借款余额</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">活跃借款数</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userBalances.map((balance) => (
                    <tr key={balance.user_id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{balance.job_number || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{balance.real_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`font-semibold ${balance.total_loan_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>¥{balance.total_loan_balance}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{balance.active_loans_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded" onClick={() => { setDetailPage(1); setDetailSearch(''); fetchLoanDetails(balance); }}>查看明细</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 明细弹窗/区域 */}
      {showDetail && detailUser && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl p-6 relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setShowDetail(false)}>关闭</button>
            <h2 className="text-xl font-bold mb-4">{detailUser.real_name} 的借款明细</h2>
            {detailLoading && (
              <div className="text-gray-500 mb-2">加载明细中...</div>
            )}
            <form className="mb-2 flex gap-2" onSubmit={handleDetailSearchSubmit}>
              <input className="border px-2 py-1 rounded" placeholder="搜索用途/备注" value={detailSearch} onChange={handleDetailSearch} />
              <button className="bg-blue-500 text-white px-3 py-1 rounded" type="submit">搜索</button>
            </form>
            <table className="min-w-full divide-y divide-gray-200 mb-2">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2">借款编号</th>
                  <th className="px-4 py-2">金额</th>
                  <th className="px-4 py-2">用途</th>
                  <th className="px-4 py-2">状态</th>
                  <th className="px-4 py-2">创建时间</th>
                  <th className="px-4 py-2">冲抵明细</th>
                </tr>
              </thead>
              <tbody>
                {loanDetails.map(loan => (
                  <tr key={loan.id}>
                    <td className="px-4 py-2">{loan.id}</td>
                    <td className="px-4 py-2">¥{loan.amount}</td>
                    <td className="px-4 py-2">{loan.purpose}</td>
                    <td className="px-4 py-2">{loan.status}</td>
                    <td className="px-4 py-2">{loan.created_at ? new Date(loan.created_at).toLocaleString() : ''}</td>
                    <td className="px-4 py-2">
                      {loan.offsets && loan.offsets.length > 0 ? (
                        <ul className="list-disc pl-4">
                          {loan.offsets.map((off, idx) => (
                            <li key={idx}>
                              报销单号: {off.batch_number || '-'} 金额: ¥{off.offset_amount} 日期: {off.offset_date ? new Date(off.offset_date).toLocaleDateString() : '-'}
                              {off.reimbursement_id ? ` (报销ID: ${off.reimbursement_id})` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : '无'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* 分页 */}
            <div className="flex justify-between items-center mt-2">
              <span>共 {detailTotal} 条</span>
              <div>
                <button disabled={detailPage === 1} onClick={() => { setDetailPage(detailPage - 1); fetchLoanDetails(detailUser); }} className="px-2 py-1 border rounded disabled:opacity-50">上一页</button>
                <span className="mx-2">第 {detailPage} 页</span>
                <button disabled={detailPage * detailPageSize >= detailTotal} onClick={() => { setDetailPage(detailPage + 1); fetchLoanDetails(detailUser); }} className="px-2 py-1 border rounded disabled:opacity-50">下一页</button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* 刷新按钮 */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={fetchLoanBalances}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-150 ease-in-out"
        >
          刷新数据
        </button>
      </div>
    </div>
  );
};

export default LoanBalance;

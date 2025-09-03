import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import { setGlobalNavigate } from './utils/api';

// 基础页面（可即时加载）
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Profile from './pages/Profile';
import SystemHealthCheck from './pages/SystemHealthCheck';

// 路由级按需加载（重页面）
const LoanList = lazy(() => import('./pages/LoanList'));
// LoanForm 预加载，避免编辑时的延迟
import LoanForm from './pages/LoanForm';
const LoanDetail = lazy(() => import('./pages/LoanDetail'));
const LoanBalance = lazy(() => import('./pages/LoanBalance'));
const LoanUserDetail = lazy(() => import('./pages/LoanUserDetail'));
const ReimbursementForm = lazy(() => import('./pages/ReimbursementForm'));
const ReimbursementFormList = lazy(() => import('./pages/ReimbursementFormList'));
const ReimbursementFormDetail = lazy(() => import('./pages/ReimbursementFormDetail'));
const ReimbursementBatchList = lazy(() => import('./pages/ReimbursementBatchList'));
const ReimbursementBatchDetail = lazy(() => import('./pages/ReimbursementBatchDetail'));
const ManagementAnalytics = lazy(() => import('./pages/ManagementAnalytics'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));

export default function App() {
  const navigate = useNavigate();

  // 设置全局导航函数，供API拦截器使用
  useEffect(() => {
    setGlobalNavigate(navigate);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* 个人信息页面移到 Dashboard 嵌套路由下，保证有左侧菜单栏 */}
      <Route path="/" element={<Dashboard />}> 
        <Route index element={<Home />} />
        <Route path="health-check" element={<SystemHealthCheck />} />
        <Route path="profile" element={<Profile />} />
        <Route path="loans" element={<Suspense fallback={<div>加载中...</div>}><LoanList /></Suspense>} />
        <Route path="loan-balance" element={<Suspense fallback={<div>加载中...</div>}><LoanBalance /></Suspense>} />
        <Route path="loan-balance/:userId" element={<Suspense fallback={<div>加载中...</div>}><LoanUserDetail /></Suspense>} />
        <Route path="loans/new" element={<LoanForm />} />
        <Route path="loans/edit/:id" element={<LoanForm />} />
        <Route path="loans/:id" element={<Suspense fallback={<div>加载中...</div>}><LoanDetail /></Suspense>} />
        {/* 报销单相关路由 - 统一使用 reimbursement-forms */}
        <Route path="reimbursement-forms" element={<Suspense fallback={<div>加载中...</div>}><ReimbursementFormList /></Suspense>} />
        <Route path="reimbursement-forms/new" element={<Suspense fallback={<div>加载中...</div>}><ReimbursementForm /></Suspense>} />
        <Route path="reimbursement-forms/edit/:id" element={<Suspense fallback={<div>加载中...</div>}><ReimbursementForm /></Suspense>} />
        <Route path="reimbursement-forms/:id" element={<Suspense fallback={<div>加载中...</div>}><ReimbursementFormDetail /></Suspense>} />
        <Route path="batch-list" element={<Suspense fallback={<div>加载中...</div>}><ReimbursementBatchList /></Suspense>} />
        <Route path="batch/:id" element={<Suspense fallback={<div>加载中...</div>}><ReimbursementBatchDetail /></Suspense>} />
        <Route path="management-analytics" element={<Suspense fallback={<div>加载中...</div>}><ManagementAnalytics /></Suspense>} />
        {/* Admin 面板 */}
        <Route path="admin" element={<Suspense fallback={<div>加载中...</div>}><AdminPanel /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

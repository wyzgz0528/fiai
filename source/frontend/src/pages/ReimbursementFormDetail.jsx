import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { message, Modal, Skeleton } from 'antd';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// 确保timezone插件已加载
dayjs.extend(utc);
dayjs.extend(timezone);
import { api } from '../utils/api';
import { normalizeFormStatus } from '../utils/status_maps';


export default function ReimbursementFormDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [availableLoans, setAvailableLoans] = useState([]);
  const [loanLinks, setLoanLinks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recordComments, setRecordComments] = useState({});
  const [processingRecords, setProcessingRecords] = useState(new Set());
  const [pendingApprovals, setPendingApprovals] = useState({}); // 存储待提交的审核决定
  const [approvalHistory, setApprovalHistory] = useState([]); // 审批历史（含意见）
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [vouchers, setVouchers] = useState([]);
  const [uploadingVoucher, setUploadingVoucher] = useState(false);
  // Phase 1: 前端临时关联（不改后端）：记录ID => 已选凭证ID数组
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [recordVoucherSelections, setRecordVoucherSelections] = useState({});
  // 记录级上传/预览
  const [uploadTargetRecordId, setUploadTargetRecordId] = useState(null);
  const [previewRecordId, setPreviewRecordId] = useState(null);
  const [previewVouchers, setPreviewVouchers] = useState([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeVoucher, setActiveVoucher] = useState(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState('');
  const [activePreviewType, setActivePreviewType] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const role = localStorage.getItem('role');

  // 统一自动关联策略：上传和提交时后端会自动关联凭证到记录，因此不再在前端展示“未分配凭证一键分配”。

  // 获取报销单详情
  const fetchFormDetail = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/reimbursement/reimbursement-forms/${id}`);
      
      const data = res.data;
      setForm(data);
      
      // 如果有借款关联，设置到state中
      if (data.loan_links) {
        setLoanLinks(data.loan_links.map(lo => ({
          loan_id: lo.loan_id,
          offset_amount: lo.offset_amount
        })));
      }
      
      // 获取凭证和记录-凭证映射
      await fetchVouchers();
      await fetchRecordVoucherLinks();
    } catch (e) {
      setError(e.response?.data?.msg || e.message);
    } finally {
      setLoading(false);
    }
  };

  // 获取凭证列表
  const fetchVouchers = async () => {
    try {
      const res = await api.get(`/api/reimbursement/reimbursement-forms/${id}/vouchers`);
      setVouchers(res.data || []);
    } catch (e) {
      console.error('获取凭证失败:', e);
    }
  };

  // 持久化：拉取当前表单下所有记录-凭证关联映射，填充 recordVoucherSelections
  const fetchRecordVoucherLinks = async () => {
    try {
      const res = await api.get(`/api/reimbursement/reimbursement-forms/${id}/record-voucher-links`);
      const rows = Array.isArray(res.data) ? res.data : [];
      const map = {};
      for (const r of rows) {
        if (!map[r.record_id]) map[r.record_id] = [];
        map[r.record_id].push(r.voucher_id);
      }
      setRecordVoucherSelections(map);
    } catch (e) {
      // 接口不存在时忽略（兼容旧环境）
    }
  };

  // 获取临时附件（兼容旧的上传方式）
  const fetchTempAttachments = async () => {
    try {
      const res = await api.get('/api/upload/temp-attachments');
      // 过滤出可能与当前报销单相关的附件
      return res.data || [];
    } catch (e) {
      console.error('获取临时附件失败:', e);
      return [];
    }
  };

  // 获取用户可用借款
  const fetchAvailableLoans = async (userId) => {
    if (role !== 'finance' && role !== 'admin') return;
    
    try {
      const res = await api.get(`/api/reimbursement/users/${userId}/available-loans`);
      setAvailableLoans(res.data || []);
    } catch (e) {
      console.error('获取可用借款失败:', e);
    }
  };

  // 添加借款关联
  const handleAddLoanLink = () => {
    setLoanLinks([...loanLinks, { loan_id: '', offset_amount: '' }]);
  };

  // 删除借款关联
  const handleRemoveLoanLink = (index) => {
    setLoanLinks(loanLinks.filter((_, i) => i !== index));
  };

  // 更新借款关联
  const handleUpdateLoanLink = (index, field, value) => {
    const updated = [...loanLinks];
    updated[index][field] = value;
    setLoanLinks(updated);
  };

  // 保存借款关联
  const handleSaveLoanLinks = async () => {
    const validLinks = loanLinks.filter(link => 
      link.loan_id && link.offset_amount && parseFloat(link.offset_amount) > 0
    );
    
    if (validLinks.length === 0) {
      return alert('请至少添加一个有效的借款关联');
    }
    
    try {
      await api.post(`/api/reimbursement/reimbursement-forms/${id}/link-loans`, { loan_links: validLinks });
      alert('借款关联保存成功！');
      fetchFormDetail(); // 刷新详情
    } catch (e) {
      alert('保存借款关联失败');
    }
  };

  // 财务确认打款
  const handleConfirmPayment = async () => {
    const paymentNote = prompt(`确认为【${form.real_name || form.username}】的报销单打款？\n报销单编号：${form.form_number}\n金额：¥${Number(form.net_payment_amount || form.net_payment || form.total_amount || 0).toFixed(2)}\n\n请输入打款备注（可选）：`);
    if (paymentNote === null) return;
    try {      
  // 将当前编辑中的借款关联一并提交（仅提交有效项）
  const validLinks = (loanLinks || []).filter(l => l.loan_id && l.offset_amount && parseFloat(l.offset_amount) > 0);
  await api.post(`/api/reimbursement/reimbursement-forms/${id}/confirm-payment`, { payment_note: paymentNote, loan_links: validLinks });
      alert('打款确认成功！');
  await fetchFormDetail();
  await fetchRecordVoucherLinks();
    } catch (e) {
      alert('确认打款失败');
    }
  };

  // 基于被驳回的报销单创建新报销单
  const handleCreateFromRejected = async () => {
    try {
      console.log('=== 创建新报销单调试开始 ===');
      console.log('报销单ID:', id);
      console.log('当前用户信息:', {
        token: localStorage.getItem('token') ? '存在' : '不存在',
        userId: localStorage.getItem('user_id'),
        role: localStorage.getItem('role'),
        username: localStorage.getItem('username')
      });
      console.log('当前报销单信息:', form);

      console.log('发送API请求...');
      const response = await api.post(`/api/reimbursement/reimbursement-forms/${id}/create-from-rejected`, {
        statusFlag: '草稿'
      });

      console.log('API响应状态:', response.status);
      console.log('API响应数据:', response.data);
      console.log('API响应头:', response.headers);

      if (response.data.success) {
        alert(`新报销单创建成功！单号：${response.data.form_number}`);
        console.log('准备跳转到:', `/reimbursement-forms/${response.data.formId}/edit`);

        // 添加延迟确保API调用完全完成，避免时序问题
        setTimeout(() => {
          console.log('执行跳转...');
          navigate(`/reimbursement-forms/${response.data.formId}/edit`);
        }, 100);
      } else {
        console.error('API返回失败:', response.data);
        alert('创建新报销单失败: API返回失败');
      }
    } catch (error) {
      console.error('=== 创建新报销单错误详情 ===');
      console.error('错误对象:', error);
      console.error('错误消息:', error.message);
      console.error('响应状态:', error.response?.status);
      console.error('响应数据:', error.response?.data);
      console.error('响应头:', error.response?.headers);
      console.error('请求配置:', error.config);

      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
      alert('创建新报销单失败: ' + errorMessage);
    }
  };

  // 已移除：总经理整单审批（统一采用逐项选择+批量提交）

  // 提交审批
  const handleSubmitApproval = async () => {
    if (!window.confirm('确定提交审批？提交后将进入财务审核流程。')) return;
    try {
  await api.post(`/api/reimbursement/reimbursement-forms/${id}/submit`);
      alert('提交成功！');
  await fetchFormDetail();
  await fetchRecordVoucherLinks();
    } catch (e) {
      alert('提交失败');
    }
  };

  // 撤回审批
  const handleWithdraw = async () => {
    if (!window.confirm('确定撤回该报销单？撤回后将进入编辑模式。')) return;
    try {
  await api.post(`/api/reimbursement/reimbursement-forms/${id}/withdraw`);
      alert('撤回成功！正在跳转到编辑页面...');
      // 撤回成功后直接跳转到编辑页面
      setTimeout(() => {
        navigate(`/reimbursement-forms/edit/${id}`);
      }, 1000);
    } catch (e) {
      alert('撤回失败');
    }
  };

  // 已移除：顶部单独“驳回”入口。统一在逐项审核里选择拒绝并使用“提交所有审核结果”。

  // 上传凭证
  const handleUploadVoucher = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('只支持图片文件（JPG、PNG、GIF）和PDF文件');
      return;
    }
    
    // 验证文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      alert('文件大小不能超过10MB');
      return;
    }
    
    setUploadingVoucher(true);
    try {
      const formData = new FormData();
      formData.append('voucher', file);
      if (uploadTargetRecordId) formData.append('record_id', String(uploadTargetRecordId));
      
      await api.post(`/api/reimbursement/reimbursement-forms/${id}/vouchers`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });
      
      alert('凭证上传成功！');
      await fetchVouchers(); // 刷新凭证列表
      await fetchRecordVoucherLinks();
      if (previewRecordId) {
        try {
          const r = await api.get(`/api/reimbursement/reimbursement-records/${previewRecordId}/vouchers`);
          setPreviewVouchers(Array.isArray(r.data) ? r.data : []);
        } catch {}
      }
    } catch (e) {
      alert(e.response?.data?.msg || '上传失败');
    } finally {
      setUploadingVoucher(false);
      // 清空 input
      event.target.value = '';
      setUploadTargetRecordId(null);
    }
  };

  // 切换当前选中记录
  const handleSelectRecord = (recordId) => {
    setSelectedRecordId(recordId);
  };

  // 触发某记录的上传
  const triggerUploadForRecord = (recordId) => {
    setUploadTargetRecordId(recordId);
    const input = document.getElementById('record-voucher-upload');
    if (input) input.click();
  };

  // 预览某记录的凭证
  const handlePreviewRecordVouchers = async (recordId) => {
    try {
      const res = await api.get(`/api/reimbursement/reimbursement-records/${recordId}/vouchers`);
      setPreviewRecordId(recordId);
      setPreviewVouchers(Array.isArray(res.data) ? res.data : []);
      // 预设激活第一张，直接在弹窗中展示
      const list = Array.isArray(res.data) ? res.data : [];
      if (list.length > 0) {
        await setActiveAndLoadVoucher(list[0]);
      } else {
        // 清空
        if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
        setActivePreviewUrl('');
        setActivePreviewType('');
        setActiveVoucher(null);
      }
      setIsPreviewOpen(true);
    } catch (e) {
      message.error('加载凭证失败');
    }
  };

  // 选择并加载某张凭证的预览（图片/PDF 都在弹窗中内嵌显示）
  const setActiveAndLoadVoucher = async (voucher) => {
    try {
      setPreviewLoading(true);
      // 清理旧URL
      if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
      const response = await api.get(`/api/reimbursement/reimbursement-forms/${id}/vouchers/${voucher.id}/file`, { responseType: 'blob' });
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      setActiveVoucher(voucher);
      setActivePreviewUrl(url);
      setActivePreviewType(voucher.file_type || blob.type || 'application/octet-stream');
    } catch (e) {
      message.error('加载预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  // 已移除：不再提供手动将未分配凭证批量关联到指定记录的功能。

  // 切换凭证与当前选中记录的临时关联
  const toggleVoucherSelection = async (voucherId) => {
    if (!selectedRecordId) return;
    const current = new Set(recordVoucherSelections[selectedRecordId] || []);
    const willLink = !current.has(voucherId);
    try {
      if (willLink) {
        await api.post(`/api/reimbursement/reimbursement-records/${selectedRecordId}/vouchers/${voucherId}/link`);
      } else {
        await api.delete(`/api/reimbursement/reimbursement-records/${selectedRecordId}/vouchers/${voucherId}`);
      }
      await fetchRecordVoucherLinks();
    } catch (e) {
      message.error(e.response?.data?.msg || '更新关联失败');
    }
  };

  // 删除凭证
  const handleDeleteVoucher = async (voucherId) => {
    if (!window.confirm('确定删除该凭证？')) return;
    
    try {
      await api.delete(`/api/reimbursement/reimbursement-forms/${id}/vouchers/${voucherId}`);
      alert('凭证删除成功！');
      fetchVouchers(); // 刷新凭证列表
    } catch (e) {
      alert(e.response?.data?.msg || '删除失败');
    }
  };

  // 预览凭证
  const handlePreviewVoucher = async (voucher) => {
    try {
  // 使用专门的预览API（依赖登录后后端设置的 HttpOnly Cookie，避免将token放到URL）
  const base = (api && api.defaults && api.defaults.baseURL) ? api.defaults.baseURL.replace(/\/$/, '') : '';
  let previewUrl = `${base}/api/reimbursement/reimbursement-forms/${id}/vouchers/${voucher.id}/preview`;
  // 开发/本地联调容错：若 Cookie 可能未携带，则追加 token 查询参数兜底，避免 401
  try {
    const isDev = !!(import.meta.env.DEV || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')));
    const token = localStorage.getItem('token');
    if (isDev && token) {
      const u = new URL(previewUrl, window.location.origin);
      u.searchParams.set('token', token);
      previewUrl = u.toString();
    }
  } catch (_) { /* ignore */ }
  // 新窗口打开，浏览器会自动携带 Cookie
  window.open(previewUrl, '_blank');
    } catch (error) {
      console.error('预览失败:', error);
      message.error('预览失败，请稍后重试');
    }
  };

  // 下载PDF
  const handleDownloadPDF = async () => {
    try {
      const res = await api.get(`/api/reimbursement/reimbursement-forms/${id}/pdf`, { responseType: 'blob' });
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reimbursement_form_${form.form_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('下载PDF失败');
    }
  };

  // 下载本报销单的所有凭证为ZIP（仅财务/管理员可见）
  const handleDownloadAllVouchersZip = async () => {
    try {
      const res = await api.get(`/api/reimbursement/reimbursement-forms/${id}/vouchers/zip`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form_${(form && form.form_number) || id}_vouchers.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('下载凭证ZIP失败:', e);
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || e?.response?.data?.msg;
      if (status === 404) {
        message.warning(msg || '该报销单暂无凭证可下载');
      } else if (status === 403) {
        message.error(msg || '无权限下载凭证');
      } else {
        message.error(msg || '下载凭证ZIP失败');
      }
    }
  };

  // 处理单条记录审核状态设置（不立即提交）
  const handleRecordApprovalDecision = (recordId, action) => {
    setPendingApprovals(prev => ({
      ...prev,
      [recordId]: action
    }));
  };

  // 删除单条报销明细（admin）
  const handleDeleteRecord = async (recordId) => {
    if (role !== 'admin') return;
    if (!window.confirm('确定删除该报销明细？此操作不可恢复。')) return;
    try {
      await api.delete(`/api/reimbursement/admin/reimbursements/${recordId}`);
      alert('删除成功');
      await fetchFormDetail();
    } catch (e) {
      alert(e?.response?.data?.msg || '删除失败');
    }
  };

  // 批量提交所有审核决定
  const handleSubmitAllApprovals = async () => {
    try {
      if (!form || !Array.isArray(form.records) || form.records.length === 0) {
        alert('无可审批记录');
        return;
      }
      setIsSubmittingBatch(true);

      // 1. 取全部记录ID
      const allRecords = form.records;
      const allRecordIds = allRecords.map(r => r.id);

      // 2. 当前阶段（财务 or 经理）用于识别哪些记录已视为“通过”
      const formStatus = form.status_en || form.status;
      const isFinanceStage = (role === 'finance' || role === 'admin') && ['submitted','待财务审核'].includes(formStatus);
      const isManagerStage = (role === 'manager' || role === 'admin') && ['finance_approved','财务已审核'].includes(formStatus);

      // 3. 规范化记录状态：优先 approval_status / approval_status_en
      const normStatus = (r) => (r.approval_status || r.approval_status_en || r.status || '').toString();

      // 4. 已经“视为通过”的记录（由前一阶段通过，但总经理未做决定的）
      const preApprovedIds = allRecords
        .filter(r => {
          const st = normStatus(r);
          if (isFinanceStage) return false; // 财务阶段只看 pending
          if (isManagerStage) {
            // 只有当总经理没有对该记录做出决定时，才视为预通过
            return st === 'finance_approved' && !pendingApprovals.hasOwnProperty(r.id);
          }
          return false;
        })
        .map(r => r.id);

      // 5. 已经驳回的记录 - 使用具体的驳回状态
      const alreadyRejectedIds = allRecords.filter(r => {
        const st = normStatus(r);
        return ['finance_rejected', 'manager_rejected', 'rejected'].includes(st); // rejected 仅作兼容
      }).map(r => r.id);

      // 6. 待决记录（还需要本次给出决定）
      const pendingIds = allRecords
        .filter(r => {
          const st = normStatus(r);
          if (alreadyRejectedIds.includes(r.id)) return false;
          if (preApprovedIds.includes(r.id)) return false;
          // 判定为待审核：pending / '' / 已归集到报销单
          // 对于总经理阶段，finance_approved的记录也需要决定（可以驳回）
          if (isFinanceStage) {
            return ['pending','', '已归集到报销单'].includes(st);
          } else if (isManagerStage) {
            return ['pending','', '已归集到报销单', 'finance_approved'].includes(st);
          }
          return ['pending','', '已归集到报销单'].includes(st);
        })
        .map(r => r.id);

      // 7. 用户在前端选择的决定
      const decidedEntries = Object.entries(pendingApprovals); // [recordIdStr, 'approve' | 'reject']
      const decidedApprove = decidedEntries.filter(([,d]) => d === 'approve').map(([id]) => parseInt(id));
      const decidedReject = decidedEntries.filter(([,d]) => d === 'reject').map(([id]) => parseInt(id));

      // 8. 校验：所有 pendingIds 必须都在决定里
      const missing = pendingIds.filter(id => !decidedApprove.includes(id) && !decidedReject.includes(id));
      if (missing.length > 0) {
        alert(`仍有 ${missing.length} 条记录未设置审核状态: ${missing.join(',')}`);
        return;
      }

      // 9. 构建最终 approved / rejected 集合
      let approved_record_ids = [
        ...preApprovedIds, // 前阶段已通过
        ...decidedApprove
      ];
      let rejected_record_ids = [
        ...alreadyRejectedIds, // 已经驳回
        ...decidedReject
      ];

      // 10. 去重
      const dedup = (arr) => Array.from(new Set(arr.map(Number)));
      approved_record_ids = dedup(approved_record_ids);
      rejected_record_ids = dedup(rejected_record_ids);

      // 11. 交叉检测（不应有同一ID同时存在）
      const intersection = approved_record_ids.filter(id => rejected_record_ids.includes(id));
      if (intersection.length > 0) {
        alert(`存在同时标记为通过和驳回的记录: ${intersection.join(',')}`);
        return;
      }

      // 12. 最终必须覆盖全部记录
      const covered = new Set([...approved_record_ids, ...rejected_record_ids]);
      if (covered.size !== allRecordIds.length) {
        const uncovered = allRecordIds.filter(id => !covered.has(id));
        alert(`仍有记录未被覆盖，请检查: ${uncovered.join(',')}`);
        return;
      }

      // 13. 汇总意见：把每条填写的意见收集 (recordId#意见)，裁剪长度防止过长
      const commentList = Object.entries(recordComments)
        .filter(([,c]) => c && c.trim())
        .map(([rid,c]) => `#${rid}:${c.trim()}`);
      // 允许为空；若太长截断
      let comment = commentList.join(' | ');
      if (comment.length > 900) comment = comment.slice(0, 900) + '...';

      const payload = {
        action: 'partial_approve',
        approved_record_ids: approved_record_ids,
        rejected_record_ids: rejected_record_ids,
        comment
      };

      console.log('=== 批量提交审批(重构版) ===');
      console.log('阶段:', isFinanceStage ? '财务阶段' : isManagerStage ? '总经理阶段' : '其它');
      console.log('全部记录:', allRecordIds);
      console.log('预先已通过:', preApprovedIds);
      console.log('已驳回:', alreadyRejectedIds);
      console.log('待决记录:', pendingIds);
      console.log('决定-通过:', decidedApprove);
      console.log('决定-驳回:', decidedReject);
      console.log('最终通过:', approved_record_ids);
      console.log('最终驳回:', rejected_record_ids);
      console.log('意见:', comment);

      const res = await api.post(`/api/reimbursement/reimbursement-forms/${id}/approve`, payload);
      const newFormId = res?.data?.result?.new_form_id;
      const actionTaken = res?.data?.result?.action_taken;
      const approvedCount = res?.data?.result?.approved_count;
      const rejectedCount = res?.data?.result?.rejected_count;

      // 清理本地状态
      setPendingApprovals({});
      setRecordComments({});

      if (newFormId) {
        // 拆分产生新单：原单被驳回，newFormId 为通过记录组成的新单
        const go = window.confirm(`审批提交成功！\n通过: ${approvedCount} 条, 驳回: ${rejectedCount} 条。已生成新的报销单 (ID: ${newFormId}) 用于已通过记录。\n\n是否立即打开新报销单？`);
        if (go) {
          navigate(`/reimbursement-forms/${newFormId}`);
          return; // 不再刷新旧单
        } else {
          // 留在当前（原单已成为驳回且仅含被拒记录）
          await fetchFormDetail();
          return;
        }
      } else {
        alert(`批量审批提交成功！(通过: ${approvedCount} 条, 驳回: ${rejectedCount} 条)`);
        await fetchFormDetail();
      }
    } catch (e) {
      console.error('批量审批失败(重构):', e);
      alert(`批量审批失败: ${e?.response?.data?.msg || e.message}`);
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  useEffect(() => {
    fetchFormDetail();
    (async () => {
      try {
        const res = await api.get(`/api/reimbursement/reimbursement-forms/${id}/approval-history?includeAncestors=1`);
        // 兼容新结构 {logs:[], merged:true}
        const raw = Array.isArray(res.data) ? res.data : (res.data.logs || []);
        setApprovalHistory(raw);
      } catch (e) {}
    })();
    fetchRecordVoucherLinks();
  }, [id]);

  useEffect(() => {
    if (form) {
      fetchAvailableLoans(form.user_id);
      // 默认选中第一条记录，便于立即进行凭证关联
      if (!selectedRecordId && Array.isArray(form.records) && form.records.length > 0) {
        setSelectedRecordId(form.records[0].id);
      }
    }
  }, [form, selectedRecordId]);

  if (loading) return <div style={{margin:32}}>加载中...</div>;
  if (error) return <div style={{margin:32, color:'red'}}>{error}</div>;
  if (!form) return <div style={{margin:32}}>报销单不存在</div>;

  const statusMap = {
    draft: '草稿',
    submitted: '待财务审核',
    finance_approved: '财务已通过',
    finance_rejected: '财务已驳回',
    manager_approved: '总经理已通过',
    manager_rejected: '总经理已驳回',
    paid: '已打款',
    rejected: '已驳回' // 兼容旧状态
  };

  // 统一的状态处理
  const statusEN = form.status_en || form.status;
  const statusZH = form.status_zh || statusMap[statusEN] || form.status;
  const isPaid = statusEN === 'paid' || statusZH === '已打款';
  const canEditLoanLink = (role === 'finance' || role === 'admin') && statusEN === 'manager_approved' && !isPaid && (availableLoans?.length > 0);
  // PDF 下载允许状态（仅通过审核的状态才需要PDF）
  const canDownloadPdf = ['finance_approved','manager_approved','paid'].includes(statusEN);

  return (
    <div style={{maxWidth:1000, margin:'32px auto'}}>
      <div style={{marginBottom:16}}>
        <button onClick={() => navigate(-1)} style={{marginRight:16}}>返回</button>
        <h3 style={{display:'inline'}}>报销单详情 - {form.form_number}</h3>
      </div>

      {/* 审批历史（含意见） —— 对所有角色可见 */}
      <div style={{border:'1px solid #ddd', borderRadius:8, padding:16, marginBottom:16}}>
        <h4>审批历史</h4>
        {approvalHistory.length === 0 ? (
          <div style={{ color: '#8c8c8c' }}>暂无审批记录</div>
        ) : (
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f5f5f5'}}>
                <th style={{border:'1px solid #ddd', padding:8}}>时间</th>
                <th style={{border:'1px solid #ddd', padding:8}}>审批人</th>
                <th style={{border:'1px solid #ddd', padding:8}}>角色</th>
                <th style={{border:'1px solid #ddd', padding:8}}>来源表单</th>
                <th style={{border:'1px solid #ddd', padding:8}}>操作</th>
                <th style={{border:'1px solid #ddd', padding:8}}>通过/驳回</th>
                <th style={{border:'1px solid #ddd', padding:8}}>意见</th>
              </tr>
            </thead>
            <tbody>
              {approvalHistory.map((h, idx) => {
                const actionMap = {
                  approve_all: '全部通过',
                  reject_all: '全部驳回',
                  partial_approve: '部分通过',
                  all_approved: '全部通过',
                  partial: '部分通过',
                  approved: '通过',
                  rejected: '驳回',
                  submit: '提交'
                };
                const approveCount = (h.approved_record_ids || []).length;
                const rejectCount = (h.rejected_record_ids || []).length;
                const roleMap = { finance: '财务', manager: '总经理', admin: '管理员', employee: '员工' };
                const sourceLabel = h.source_form_number ? `${h.source_form_number}${h.source_level===0?'(当前)':''}` : (h.form_number||'');
                return (
                  <tr key={idx}>
                    <td style={{border:'1px solid #ddd', padding:8}}>{h.created_at ? dayjs(h.created_at).format('YYYY/M/D HH:mm:ss') : '-'}</td>
                    <td style={{border:'1px solid #ddd', padding:8}}>{h.approver_name || '-'}</td>
                    <td style={{border:'1px solid #ddd', padding:8}}>{roleMap[h.approver_role] || h.approver_role || '-'}</td>
                    <td style={{border:'1px solid #ddd', padding:8}}>{sourceLabel}</td>
                    <td style={{border:'1px solid #ddd', padding:8}}>{actionMap[h.action] || h.action}</td>
                    <td style={{border:'1px solid #ddd', padding:8}}>{approveCount}/{rejectCount}</td>
                    <td style={{border:'1px solid #ddd', padding:8, maxWidth:240, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={h.comment}>{h.comment || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 报销单基本信息 */}
      <div style={{border:'1px solid #ddd', borderRadius:8, padding:16, marginBottom:16}}>
        <h4>基本信息</h4>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
          <div><strong>申请人：</strong>{form.real_name || form.username}</div>
          <div><strong>状态：</strong>
            <span style={{
              padding:'2px 6px',
              borderRadius:3,
              fontSize:12,
              background: isPaid ? '#52c41a' : statusEN === 'rejected' ? '#ff4d4f' : statusEN === 'draft' ? '#aaa' : '#1677ff',
              color:'#fff',
              marginLeft:8
            }}>
              {statusZH}
            </span>
          </div>
          <div><strong>报销总金额：</strong>¥{Number(form.total_amount || 0).toFixed(2)}</div>
          <div><strong>借款抵扣：</strong>¥{Number(form.loan_offset_amount || 0).toFixed(2)}</div>
          <div><strong>净付款金额：</strong>
            <span style={{fontSize:16, fontWeight:'bold', color:'#1677ff'}}>
              ¥{Number(form.net_payment_amount || form.net_payment || form.total_amount || 0).toFixed(2)}
            </span>
          </div>
          <div><strong>创建时间：</strong>{dayjs(form.created_at).format('YYYY/M/D HH:mm:ss')}</div>
          {form.payment_confirmed_at && (
            <div><strong>打款时间：</strong>{dayjs(form.payment_confirmed_at).format('YYYY/M/D HH:mm:ss')}</div>
          )}
          {form.payment_note && (
            <div style={{gridColumn:'1 / -1'}}><strong>打款备注：</strong>{form.payment_note}</div>
          )}
          {/* 驳回原因 */}
          {form.status === 'rejected' && form.reject_reason && (
            <div style={{gridColumn:'1 / -1', color:'#ff4d4f'}}><strong>驳回原因：</strong>{form.reject_reason}</div>
          )}
        </div>
      </div>

      {/* 报销记录列表 */}
      <div style={{border:'1px solid #ddd', borderRadius:8, padding:16, marginBottom:16}}>
        <h4>报销记录</h4>
  {/* 已移除“未分配凭证一键分配”按钮 */}
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'#f5f5f5'}}>
              <th style={{border:'1px solid #ddd', padding:8}}>类型</th>
              <th style={{border:'1px solid #ddd', padding:8}}>金额</th>
              <th style={{border:'1px solid #ddd', padding:8}}>用途</th>
              <th style={{border:'1px solid #ddd', padding:8}}>发票号</th>
              <th style={{border:'1px solid #ddd', padding:8}}>发票日期</th>
              <th style={{border:'1px solid #ddd', padding:8}}>购买方</th>
              <th style={{border:'1px solid #ddd', padding:8}}>服务名称</th>
              <th style={{border:'1px solid #ddd', padding:8}}>备注</th>
              <th style={{border:'1px solid #ddd', padding:8}}>凭证</th>
              <th style={{border:'1px solid #ddd', padding:8}}>状态</th>
              <th style={{border:'1px solid #ddd', padding:8}}>创建时间</th>
              {(role === 'finance' || role === 'manager' || role === 'admin') && (
                <th style={{border:'1px solid #ddd', padding:8}}>审核操作</th>
              )}
            </tr>
          </thead>
          <tbody>
            {form.records?.map(record => (
              <tr key={record.id}
                  onClick={() => handleSelectRecord(record.id)}
                  style={{
                    backgroundColor: selectedRecordId === record.id ? '#e6f7ff' : undefined,
                    cursor: 'pointer'
                  }}>
                <td style={{border:'1px solid #ddd', padding:8}}>{record.type || '未分类'}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>¥{Number(record.amount || 0).toFixed(2)}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>{record.purpose || '无'}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>{record.invoice_number || '-'}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>{record.invoice_date || '-'}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>{record.buyer_name || '-'}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>{record.service_name || '-'}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>{record.remark || '无'}</td>
                <td style={{border:'1px solid #ddd', padding:8}}>
                  <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                    <span style={{
                      display:'inline-block', padding:'2px 6px', borderRadius:12,
                      background:'#fafafa', border:'1px solid #ddd', fontSize:12
                    }}>
                      { ((recordVoucherSelections[record.id] || []).length) || record.voucher_count || 0 } 张
                    </span>
                    {/* 未分配凭证提示已移除 */}
                    <button onClick={() => handlePreviewRecordVouchers(record.id)}
                            style={{padding:'4px 8px', fontSize:12, border:'1px solid #ddd', borderRadius:4, background:'#fff', cursor:'pointer'}}>
                      预览
                    </button>
                    {(() => {
                      const currentUserId = (JSON.parse(localStorage.getItem('user')||'{}').id) || localStorage.getItem('user_id') || '';
                      const isOwner = String(form.user_id) === String(currentUserId);
                      // 仅表单创建者在 草稿/驳回 时可上传；审核角色不显示该按钮
                      const canUpload = isOwner && (form.status === 'draft' || form.status === 'rejected');
                      return canUpload ? (
                        <button onClick={() => triggerUploadForRecord(record.id)}
                                style={{padding:'4px 8px', fontSize:12, border:'1px solid #1890ff', color:'#1890ff', borderRadius:4, background:'#fff', cursor:'pointer'}}>
                          上传
                        </button>
                      ) : null;
                    })()}
                    {/* 关联未分配按钮已移除 */}
                  </div>
                </td>
                <td style={{border:'1px solid #ddd', padding:8}}>
                  {(() => {
                    if (isPaid) {
                      return (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: 'white',
                          backgroundColor: '#52c41a'
                        }}>
                          已打款
                        </span>
                      );
                    }
                    const itemStatus = record.approval_status || record.status; // 优先显示审批状态

                    // 🔧 调试：输出状态信息
                    console.log(`🔍 [DEBUG] 记录 ${record.id} 状态调试:`, {
                      approval_status: record.approval_status,
                      status: record.status,
                      itemStatus: itemStatus,
                      formStatus: form.status,
                      formStatusEn: form.status_en
                    });

                    const approvedStates = ['finance_approved','manager_approved','approved']; // approved 仅作兼容
                    const rejectedStates = ['finance_rejected','manager_rejected','rejected']; // rejected 仅作兼容
                    const isApproved = approvedStates.includes(itemStatus);
                    const isRejected = rejectedStates.includes(itemStatus);
                    const isDraft = itemStatus === '草稿'; // 🔧 修复：识别草稿状态
                    const isPending = itemStatus === 'pending' || itemStatus === '已归集到报销单' || !itemStatus;
                    const bg = isApproved ? '#52c41a' : isRejected ? '#ff4d4f' : isDraft ? '#d9d9d9' : isPending ? '#1890ff' : '#d9d9d9';

                    // 更具体的状态文本显示
                    let text = '未知';
                    if (itemStatus === 'finance_approved') text = '财务已通过';
                    else if (itemStatus === 'manager_approved') text = '总经理已通过';
                    else if (itemStatus === 'approved') text = '总经理已通过'; // 兼容旧状态
                    else if (itemStatus === 'finance_rejected') text = '财务已驳回';
                    else if (itemStatus === 'manager_rejected') text = '总经理已驳回';
                    else if (itemStatus === 'rejected') text = '财务已驳回'; // 兼容旧状态，默认显示为财务已驳回
                    else if (itemStatus === '草稿') text = '草稿'; // 🔧 修复：显示草稿状态
                    else if (isPending) {
                      // 根据表单状态判断当前处于哪个审批阶段
                      const formStatus = form.status_en || form.status;
                      if (['submitted', '待财务审核'].includes(formStatus)) {
                        text = '待财务审核';
                      } else if (['finance_approved', '财务已审核', '财务已通过'].includes(formStatus)) {
                        text = '待总经理审批';
                      } else {
                        text = '待财务审核'; // 默认
                      }
                    }
                    return (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: 'white',
                        backgroundColor: bg
                      }}>
                        {text}
                      </span>
                    );
                  })()}
                  {/* 显示待提交的决定 */}
                  {pendingApprovals[record.id] && (
                    <span style={{
                      marginLeft: '8px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      backgroundColor: pendingApprovals[record.id] === 'approve' ? '#52c41a' : '#ff4d4f',
                      color: 'white'
                    }}>
                      待提交: {pendingApprovals[record.id] === 'approve' ? '通过' : '拒绝'}
                    </span>
                  )}
                </td>
                <td style={{border:'1px solid #ddd', padding:8}}>
                  {dayjs(record.created_at).format('YYYY/M/D HH:mm:ss')}
                </td>
                {(role === 'finance' || role === 'manager' || role === 'admin') && (
                  <td style={{border:'1px solid #ddd', padding:8}}>
                    {(() => {
                      const st = record.approval_status || record.status;
                      const formSt = form.status;
                      const isFinanceStage = (role === 'finance' || role === 'admin') && (formSt === 'submitted' || formSt === '待财务审核');
                      const isManagerStage = (role === 'manager' || role === 'admin') && (formSt === 'finance_approved' || formSt === '财务已审核' || formSt === '财务已通过');
                      const canOperate = !(['paid','已打款'].includes(formSt)) && (
                        (isFinanceStage && (!st || st === 'pending' || st === '已归集到报销单')) ||
                        (isManagerStage && (st === 'pending' || st === 'finance_approved'))
                      );
                      return (
                        <div style={{display:'flex', flexDirection:'column', gap:8}}>
                          {canOperate ? (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                              <div style={{display: 'flex', gap: '8px'}}>
                                <button
                                  onClick={() => handleRecordApprovalDecision(record.id, 'approve')}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: pendingApprovals[record.id] === 'approve' ? '#52c41a' : '#f0f0f0',
                                    color: pendingApprovals[record.id] === 'approve' ? 'white' : '#333',
                                    cursor: 'pointer',
                                    fontWeight: pendingApprovals[record.id] === 'approve' ? 'bold' : 'normal'
                                  }}
                                >
                                  通过 {pendingApprovals[record.id] === 'approve' ? '✓' : ''}
                                </button>
                                <button
                                  onClick={() => handleRecordApprovalDecision(record.id, 'reject')}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: pendingApprovals[record.id] === 'reject' ? '#ff4d4f' : '#f0f0f0',
                                    color: pendingApprovals[record.id] === 'reject' ? 'white' : '#333',
                                    cursor: 'pointer',
                                    fontWeight: pendingApprovals[record.id] === 'reject' ? 'bold' : 'normal'
                                  }}
                                >
                                  拒绝 {pendingApprovals[record.id] === 'reject' ? '✓' : ''}
                                </button>
                              </div>
                              <input
                                type="text"
                                placeholder="审核意见（可选）"
                                value={recordComments[record.id] || ''}
                                onChange={(e) => setRecordComments(prev => ({
                                  ...prev,
                                  [record.id]: e.target.value
                                }))}
                                style={{
                                  width: '100%',
                                  padding: '4px',
                                  fontSize: '12px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px'
                                }}
                              />
                            </div>
                          ) : (
                            <span style={{fontSize: '12px', color: st === 'finance_approved' && isManagerStage ? '#1890ff' : st === 'finance_approved' ? '#52c41a' : ['finance_rejected','manager_rejected','rejected'].includes(st) ? '#ff4d4f' : '#999'}}>
                              {st === 'finance_approved' && isManagerStage ? '财务已通过（可驳回）' :
                               st === 'finance_approved' ? '财务已通过' :
                               st === 'finance_rejected' ? '财务已驳回' :
                               st === 'manager_rejected' ? '总经理已驳回' :
                               ['manager_approved'].includes(st) ? '总经理已通过' :
                               st === 'approved' ? '总经理已通过' : // 兼容旧状态
                               (st === 'rejected' ? '财务已驳回' : '不可操作')} {/* 兼容旧状态，显示为财务已驳回 */}
                            </span>
                          )}
                          {role === 'admin' && (
                            <div>
                              <button
                                onClick={() => handleDeleteRecord(record.id)}
                                style={{
                                  padding:'4px 8px', fontSize:12, border:'1px solid #ff4d4f',
                                  color:'#ff4d4f', borderRadius:4, background:'#fff', cursor:'pointer'
                                }}
                              >
                                删除明细（Admin）
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* 批量提交审核结果按钮 */}
        {(role === 'finance' || role === 'manager' || role === 'admin') && Object.keys(pendingApprovals).length > 0 && (
          <div style={{marginTop: 16, textAlign: 'center'}}>
            <button
              onClick={handleSubmitAllApprovals}
              disabled={isSubmittingBatch}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#1890ff',
                color: 'white',
                cursor: isSubmittingBatch ? 'not-allowed' : 'pointer',
                opacity: isSubmittingBatch ? 0.6 : 1
              }}
            >
              {isSubmittingBatch ? '提交中...' : `提交所有审核结果 (${Object.keys(pendingApprovals).length}条)`}
            </button>
          </div>
        )}
      </div>

      {/* 隐藏的文件上传 input：按记录上传并自动关联 */}
      <input id="record-voucher-upload" type="file" accept="image/*,.pdf" onChange={handleUploadVoucher} disabled={uploadingVoucher} style={{display:'none'}} />
      {/* 记录凭证预览 - 弹窗 */}
      <Modal
        open={isPreviewOpen}
        title={
          <div
            style={{ cursor: 'move', userSelect: 'none' }}
            onMouseDown={(e) => {
              const modal = e.target.closest('.ant-modal');
              if (!modal) return;

              // 🔧 修复：获取当前transform值，避免累积偏移
              const computedStyle = window.getComputedStyle(modal);
              const matrix = new DOMMatrix(computedStyle.transform);
              const currentX = matrix.m41; // translateX
              const currentY = matrix.m42; // translateY

              const startX = e.clientX;
              const startY = e.clientY;

              const handleMouseMove = (moveEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;
                const newX = currentX + deltaX;
                const newY = currentY + deltaY;

                // 🔧 修复：限制拖拽范围，防止拖出屏幕
                const maxX = window.innerWidth - 200; // 至少保留200px可见
                const maxY = window.innerHeight - 100; // 至少保留100px可见
                const constrainedX = Math.max(-modal.offsetWidth + 200, Math.min(maxX, newX));
                const constrainedY = Math.max(0, Math.min(maxY, newY));

                modal.style.transform = `translate(${constrainedX}px, ${constrainedY}px)`;
                modal.style.transformOrigin = 'top left';
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            📎 记录 {previewRecordId || ''} 的凭证 (可拖拽移动)
          </div>
        }
        onCancel={() => { setIsPreviewOpen(false); setPreviewRecordId(null); setPreviewVouchers([]); if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl); setActivePreviewUrl(''); setActivePreviewType(''); setActiveVoucher(null); }}
        footer={null}
        width={980}
        mask={false}
        style={{ top: 20 }}
      >
        {previewVouchers.length === 0 ? (
          <div style={{ color: '#8c8c8c', padding:12 }}>暂无凭证</div>
        ) : (
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:16}}>
            <div style={{border:'1px solid #d9d9d9', borderRadius:8, minHeight:560, display:'flex', alignItems:'center', justifyContent:'center', background:'#fafafa'}}>
              {previewLoading ? (
                <div style={{width:'100%', padding:16}}>
                  <Skeleton active paragraph={{ rows: 8 }} />
                </div>
              ) : activePreviewUrl ? (
                activePreviewType?.startsWith('image/') ? (
                  <img src={activePreviewUrl} alt={activeVoucher?.original_name || ''} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:4}} />
                ) : (
                  <iframe src={activePreviewUrl} title={activeVoucher?.original_name || ''} style={{width:'100%', height:560, border:'none', borderRadius:4}} />
                )
              ) : (
                <div style={{ color: '#d9d9d9' }}>选择右侧文件以预览</div>
              )}
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:12, maxHeight:440, overflow:'auto'}}>
              {previewVouchers.map(v => (
                <div key={v.id} style={{border:'1px solid #d9d9d9', borderRadius:8, padding:8, display:'flex', gap:8, alignItems:'center', background: activeVoucher?.id===v.id ? '#f0f5ff' : '#fff'}}>
                  <div onClick={() => setActiveAndLoadVoucher(v)} style={{width:64, height:64, display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f5f5', borderRadius:4, cursor:'pointer'}}>
                    {v.file_type?.startsWith('image/') ? (
                      <VoucherImage formId={id} voucherId={v.id} alt={v.original_name} />
                    ) : (
                      <div style={{fontSize:28, color:'#d9d9d9'}}>📄</div>
                    )}
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:12, color:'#666', wordBreak:'break-all'}}>{v.original_name}</div>
                    <div style={{marginTop:6, display:'flex', gap:8}}>
                      <button onClick={() => handlePreviewVoucher(v)} style={{padding:'4px 8px', fontSize:12, border:'1px solid #ddd', borderRadius:4, background:'#fff', cursor:'pointer'}}>新窗口打开</button>
                      {(() => {
                        const currentUserId = (JSON.parse(localStorage.getItem('user')||'{}').id) || localStorage.getItem('user_id') || '';
                        const isOwner = String(form.user_id) === String(currentUserId);
                        const canDelete = (isOwner || role === 'admin') && (form.status === 'draft' || form.status === 'rejected');
                        return canDelete ? (
                          <button
                            onClick={async () => {
                              await handleDeleteVoucher(v.id);
                              await fetchRecordVoucherLinks();
                              if (previewRecordId) await handlePreviewRecordVouchers(previewRecordId);
                            }}
                            style={{padding:'4px 8px', fontSize:12, border:'1px solid #ff4d4f', color:'#ff4d4f', borderRadius:4, background:'#fff', cursor:'pointer'}}
                          >
                            删除
                          </button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

  {/* 借款关联（仅财务可操作；仅在有实际关联时显示） */}
  {(role === 'finance' || role === 'admin') && (form.loan_links?.length > 0) && (
        <div style={{border:'1px solid #ddd', borderRadius:8, padding:16, marginBottom:16}}>
          <h4>借款关联</h4>
          {/* 现有借款关联 */}
          {form.loan_links?.length > 0 && (
            <div style={{marginBottom:16}}>
              <h5>当前关联：</h5>
              <table style={{width:'100%', borderCollapse:'collapse', marginBottom:16}}>
                <thead>
                  <tr style={{background:'#f5f5f5'}}>
                    <th style={{border:'1px solid #ddd', padding:8}}>借款用途</th>
                    <th style={{border:'1px solid #ddd', padding:8}}>借款总额</th>
                    <th style={{border:'1px solid #ddd', padding:8}}>原始剩余</th>
                    <th style={{border:'1px solid #ddd', padding:8}}>抵扣金额</th>
                    <th style={{border:'1px solid #ddd', padding:8}}>操作人</th>
                    <th style={{border:'1px solid #ddd', padding:8}}>关联时间</th>
                  </tr>
                </thead>
                <tbody>
                  {form.loan_links.map(lo => (
                    <tr key={lo.link_id}>
                      <td style={{border:'1px solid #ddd', padding:8}}>{lo.loan_purpose}</td>
                      <td style={{border:'1px solid #ddd', padding:8}}>¥{Number(lo.loan_amount).toFixed(2)}</td>
                      <td style={{border:'1px solid #ddd', padding:8}}>¥{Number(lo.original_remaining_amount).toFixed(2)}</td>
                      <td style={{border:'1px solid #ddd', padding:8, color:'#d4380d', fontWeight:'bold'}}>¥{Number(lo.offset_amount).toFixed(2)}</td>
                      <td style={{border:'1px solid #ddd', padding:8}}>{lo.created_by_name}</td>
                      <td style={{border:'1px solid #ddd', padding:8}}>{lo.linked_at ? dayjs(lo.linked_at).tz('Asia/Shanghai').format('YYYY/M/D HH:mm:ss') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 编辑借款关联（仅在总经理已审批且有可用借款时可编辑） */}
          {canEditLoanLink && (
            <div>
              <h5>编辑借款关联：</h5>
              {loanLinks.map((link, index) => (
                <div key={index} style={{display:'flex', gap:8, marginBottom:8, alignItems:'center'}}>
                  <select 
                    value={link.loan_id} 
                    onChange={e => handleUpdateLoanLink(index, 'loan_id', e.target.value)}
                    style={{flex:1, padding:4}}
                  >
                    <option value="">选择借款</option>
                    {availableLoans.map(loan => (
                      <option key={loan.id} value={loan.id}>
                        {loan.purpose} - 剩余¥{loan.remaining_amount}
                      </option>
                    ))}
                  </select>
                  <input 
                    type="number" 
                    placeholder="抵扣金额" 
                    value={link.offset_amount}
                    onChange={e => handleUpdateLoanLink(index, 'offset_amount', e.target.value)}
                    style={{width:120, padding:4}}
                  />
                  <button 
                    onClick={() => handleRemoveLoanLink(index)}
                    style={{padding:'4px 8px', background:'#ff4d4f', color:'#fff', border:'none', borderRadius:3}}
                  >
                    删除
                  </button>
                </div>
              ))}
              
              <div style={{marginTop:8}}>
                <button 
                  onClick={handleAddLoanLink}
                  style={{padding:'4px 8px', marginRight:8}}
                >
                  添加借款关联
                </button>
                <button 
                  onClick={handleSaveLoanLinks}
                  style={{padding:'4px 8px', background:'#52c41a', color:'#fff', border:'none', borderRadius:3}}
                >
                  保存关联
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div style={{textAlign:'center', marginTop:24, display:'flex', justifyContent:'center', gap:16, flexWrap:'wrap'}}>
    {/* 下载PDF（仅在合理状态下可见） */}
    {canDownloadPdf && (
          <button 
            onClick={handleDownloadPDF}
            style={{
              padding:'8px 16px', 
              fontSize:14, 
              background:'#1890ff', 
              color:'#fff', 
              border:'none', 
              borderRadius:4
            }}
          >
      下载报销单PDF
          </button>
        )}
        {/* 批量下载本单所有凭证（仅财务/管理员可见）*/}
        {(role === 'finance' || role === 'admin') && (
          <button
            onClick={handleDownloadAllVouchersZip}
            // 不再依赖前端本地 vouchers 列表决定禁用，后端会在无凭证时返回 404 并提示
            title={vouchers && vouchers.length > 0 ? '下载本单所有凭证' : '将尝试导出，若无凭证会提示'}
            style={{
              padding:'8px 16px',
              fontSize:14,
              background: '#13c2c2',
              color:'#fff',
              border:'none',
              borderRadius:4,
              cursor: 'pointer'
            }}
          >
            下载本单所有凭证ZIP{vouchers && vouchers.length ? `（${vouchers.length}）` : ''}
          </button>
        )}
        {/* 草稿/驳回可提交审批（仅创建人可见）*/}
        {(String(form.user_id) === String((JSON.parse(localStorage.getItem('user')||'{}').id) || localStorage.getItem('user_id') || '')) && (statusEN === 'draft' || statusEN === 'rejected') && (
          <button 
            onClick={handleSubmitApproval}
            style={{
              padding:'8px 16px', 
              fontSize:14, 
              background:'#52c41a', 
              color:'#fff', 
              border:'none', 
              borderRadius:4
            }}
          >
            提交审批
          </button>
        )}
        {/* 待财务审核可撤回（仅创建人，且非财务）*/}
        {(String(form.user_id) === String((JSON.parse(localStorage.getItem('user')||'{}').id) || localStorage.getItem('user_id') || '')) && statusEN === 'submitted' && role !== 'finance' && (
          <button 
            onClick={handleWithdraw}
            style={{
              padding:'8px 16px', 
              fontSize:14, 
              background:'#faad14', 
              color:'#fff', 
              border:'none', 
              borderRadius:4
            }}
          >
            撤回
          </button>
        )}
        {/* 锁定状态提示 */}
        {form.is_locked && (
          <div style={{
            padding: '16px',
            margin: '16px 0',
            backgroundColor: '#fff7e6',
            border: '1px solid #ffd591',
            borderRadius: '6px'
          }}>
            <div style={{ color: '#fa8c16', fontWeight: 'bold', marginBottom: '8px' }}>
              ⚠️ 报销单已被锁定
            </div>
            <div style={{ color: '#666', marginBottom: '12px' }}>
              {form.lock_reason}
            </div>
            {form.locked_at && (
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
                锁定时间：{new Date(form.locked_at).toLocaleString('zh-CN')}
              </div>
            )}
          </div>
        )}

        {/* 驳回可重新编辑（仅创建人可见且未锁定）*/}
        {(String(form.user_id) === String((JSON.parse(localStorage.getItem('user')||'{}').id) || localStorage.getItem('user_id') || '')) && statusEN === 'rejected' && !form.is_locked && (
          <button
            onClick={()=>navigate(`/reimbursement-forms/edit/${form.id}`)}
            style={{
              padding:'8px 16px',
              fontSize:14,
              background:'#1677ff',
              color:'#fff',
              border:'none',
              borderRadius:4
            }}
          >
            重新编辑
          </button>
        )}
        {/* 仅财务可确认打款（需为总经理已审批） */}
        {(role === 'finance') && statusEN === 'manager_approved' && (
          <button
            onClick={handleConfirmPayment}
            title="确认为该报销单打款，点击后将标记为已打款状态"
            style={{
              padding:'12px 24px',
              fontSize:16,
              background:'#52c41a',
              color:'#fff',
              border:'none',
              borderRadius:6
            }}
          >
            确认打款 ¥{Number(form.net_payment_amount || form.net_payment || form.total_amount || 0).toFixed(2)}
          </button>
        )}

        {/* 基于此单创建新报销申请 - 仅对被驳回或锁定的报销单显示，且仅创建人可见 */}
        {(String(form.user_id) === String((JSON.parse(localStorage.getItem('user')||'{}').id) || localStorage.getItem('user_id') || '')) &&
         (['finance_rejected', 'manager_rejected'].includes(normalizeFormStatus(form.status)) || form.is_locked) && (
          <button
            onClick={async () => {
              try {
                const response = await api.post(`/api/reimbursement/reimbursement-forms/${id}/create-from-rejected`, {
                  statusFlag: '草稿'
                });

                if (response.data.success) {
                  message.success(`新报销单创建成功！单号：${response.data.formNumber}`);

                  // 跳转到新报销单的详情页面
                  setTimeout(() => {
                    navigate(`/reimbursement-forms/${response.data.formId}`);
                  }, 1500);
                } else {
                  message.error('创建新报销单失败');
                }
              } catch (error) {
                console.error('创建新报销单失败:', error);
                message.error('创建新报销单失败: ' + (error.response?.data?.error || error.message));
              }
            }}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              background: '#722ed1',
              color: '#fff',
              border: 'none',
              borderRadius: 4
            }}
          >
            基于此单创建新报销申请
          </button>
        )}
  {/* 已移除：总经理整单同意/驳回。总经理与财务一致：逐条设置 + 提交所有审核结果 */}
  {/* 已移除：顶部单独驳回按钮；请在各行选择“拒绝”后点“提交所有审核结果” */}
      </div>
    </div>
  );
}

// 小组件：带鉴权加载凭证缩略图
function VoucherImage({ formId, voucherId, alt }) {
  const [src, setSrc] = React.useState('');
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let revoked = false;
    (async () => {
      try {
        const res = await api.get(`/api/reimbursement/reimbursement-forms/${formId}/vouchers/${voucherId}/file`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        if (!revoked) setSrc(url);
      } catch (e) {
        setError(e);
      }
    })();
    return () => {
      revoked = true;
      if (src) URL.revokeObjectURL(src);
    };
  }, [formId, voucherId]);

  if (error) return <div style={{fontSize:12, color:'#d9d9d9'}}>预览失败</div>;
  if (!src) return <div style={{fontSize:12, color:'#d9d9d9'}}>加载中…</div>;
  return <img src={src} alt={alt} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'cover', borderRadius:4}} />;
}

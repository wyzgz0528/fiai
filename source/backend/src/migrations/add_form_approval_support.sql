-- 报销单级审批支持的数据库结构调整
-- 执行时间：2025-08-05

-- 1. 为 reimbursement_forms 表添加审批相关字段
ALTER TABLE reimbursement_forms ADD COLUMN parent_form_id INTEGER; -- 父报销单ID（拆分时使用）
ALTER TABLE reimbursement_forms ADD COLUMN is_split_from_parent BOOLEAN DEFAULT FALSE; -- 是否从父单拆分而来
ALTER TABLE reimbursement_forms ADD COLUMN split_reason TEXT; -- 拆分原因
ALTER TABLE reimbursement_forms ADD COLUMN approved_record_count INTEGER DEFAULT 0; -- 通过的记录数
ALTER TABLE reimbursement_forms ADD COLUMN rejected_record_count INTEGER DEFAULT 0; -- 驳回的记录数

-- 2. 为 reimbursements 表添加审批状态字段
ALTER TABLE reimbursements ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending'; -- 单条记录的审批状态
ALTER TABLE reimbursements ADD COLUMN reject_reason TEXT; -- 单条记录的驳回原因
ALTER TABLE reimbursements ADD COLUMN approver_id INTEGER; -- 审批人ID
ALTER TABLE reimbursements ADD COLUMN approved_at DATETIME; -- 审批时间

-- 3. 创建报销单审批日志表
CREATE TABLE IF NOT EXISTS reimbursement_form_approval_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL,
  approver_id INTEGER NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'approve_all', 'partial_approve', 'reject_all'
  approved_record_ids TEXT, -- JSON数组，通过的记录ID
  rejected_record_ids TEXT, -- JSON数组，驳回的记录ID
  new_form_id INTEGER, -- 如果产生新报销单，记录新单ID
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES reimbursement_forms(id),
  FOREIGN KEY (approver_id) REFERENCES users(id),
  FOREIGN KEY (new_form_id) REFERENCES reimbursement_forms(id)
);

-- 4. 创建报销单拆分关联表
CREATE TABLE IF NOT EXISTS reimbursement_form_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_form_id INTEGER NOT NULL, -- 原报销单ID
  new_form_id INTEGER NOT NULL, -- 新报销单ID
  split_type VARCHAR(20) NOT NULL, -- 'approved' 或 'rejected'
  record_ids TEXT NOT NULL, -- JSON数组，包含的记录ID
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (original_form_id) REFERENCES reimbursement_forms(id),
  FOREIGN KEY (new_form_id) REFERENCES reimbursement_forms(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 5. 更新现有数据的兼容性处理
UPDATE reimbursements SET approval_status = 
  CASE 
    WHEN status = '待财务审核' THEN 'pending'
    WHEN status = '财务已审核' THEN 'finance_approved'
    WHEN status = '总经理已审批' THEN 'manager_approved'
    WHEN status = '已驳回' THEN 'rejected'
    WHEN status = 'paid' THEN 'paid'
    ELSE 'pending'
  END
WHERE approval_status = 'pending';

-- 6. 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_reimbursement_forms_parent_id ON reimbursement_forms(parent_form_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_approval_status ON reimbursements(approval_status);
CREATE INDEX IF NOT EXISTS idx_form_approval_logs_form_id ON reimbursement_form_approval_logs(form_id);
CREATE INDEX IF NOT EXISTS idx_form_splits_original_id ON reimbursement_form_splits(original_form_id);

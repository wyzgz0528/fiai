# Git版本管理指南

## 基本概念

Git是一个分布式版本控制系统，可以跟踪文件的变化，记录每次修改的历史。

## 常用命令

### 1. 查看状态
```bash
# 查看当前工作区状态
git status

# 查看提交历史
git log --oneline

# 查看所有标签
git tag
```

### 2. 添加和提交更改
```bash
# 添加所有更改到暂存区
git add .

# 添加特定文件
git add filename.js

# 提交更改
git commit -m "描述你的更改"

# 一步完成添加和提交（仅对已跟踪文件）
git commit -am "描述你的更改"
```

### 3. 查看更改
```bash
# 查看工作区与暂存区的差异
git diff

# 查看暂存区与最后一次提交的差异
git diff --cached

# 查看两个提交之间的差异
git diff commit1 commit2
```

### 4. 撤销更改
```bash
# 撤销工作区的更改（危险操作！）
git checkout -- filename.js

# 撤销暂存区的更改
git reset HEAD filename.js

# 撤销最后一次提交（保留更改在工作区）
git reset --soft HEAD~1

# 完全撤销最后一次提交（危险操作！）
git reset --hard HEAD~1
```

### 5. 分支管理
```bash
# 查看所有分支
git branch

# 创建新分支
git branch feature-name

# 切换分支
git checkout feature-name

# 创建并切换到新分支
git checkout -b feature-name

# 合并分支
git merge feature-name

# 删除分支
git branch -d feature-name
```

### 6. 标签管理
```bash
# 创建标签
git tag -a v1.0.1 -m "版本描述"

# 查看标签信息
git show v1.0.1

# 删除标签
git tag -d v1.0.1
```

## 生产环境使用建议

### 1. 每次修改后的标准流程

#### A. 后端代码修改流程
```bash
# 1. 修改后端代码（backend/src/目录下的文件）
vim backend/src/routes/some-file.js

# 2. 查看当前状态
git status

# 3. 添加更改
git add .

# 4. 提交更改
git commit -m "修复：具体描述修复的问题"

# 5. 重启服务
pm2 restart all

# 6. 测试功能是否正常
```

#### B. 前端代码修改流程（重要！）
```bash
# 1. 修改前端代码（frontend/src/目录下的文件）
vim frontend/src/pages/SomePage.jsx

# 2. 重新构建前端（必须步骤！）
cd frontend && npm run build

# 3. 返回项目根目录
cd ..

# 4. 查看当前状态
git status

# 5. 添加更改（包括源码和构建文件）
git add .

# 6. 提交更改
git commit -m "修复：具体描述修复的问题"

# 7. 重启服务
pm2 restart all

# 8. 测试功能是否正常

# 9. 如果是重要修复，创建标签
git tag -a v1.0.1 -m "修复重要bug"
```

### 2. 提交信息规范
- **修复**：`修复：描述修复的问题`
- **新功能**：`新增：描述新增的功能`
- **优化**：`优化：描述优化的内容`
- **文档**：`文档：更新文档内容`

### 3. 安全建议
- 定期备份：`cp -r /home/ubuntu/caiwu /home/ubuntu/caiwu_backup_$(date +%Y%m%d)`
- 重要修改前创建分支进行测试
- 不要使用 `git reset --hard`（会丢失数据）

### 4. 紧急回滚
如果新版本有问题，可以回滚到上一个稳定版本：
```bash
# 查看标签
git tag

# 回滚到指定版本（例如v1.0.0）
git checkout v1.0.0

# 重启服务
pm2 restart all

# 如果确认要永久回滚，创建新分支
git checkout -b hotfix-rollback
```

## 当前项目状态

- **初始化时间**：$(date)
- **当前版本**：v1.0.0
- **包含功能**：
  - 完整的财务管理系统
  - 员工凭证预览功能
  - PDF报销单样式优化
  - 审批状态显示

## 注意事项

1. **生产环境安全**：
   - 每次修改前先备份
   - 测试功能后再提交
   - 重要修改创建标签

2. **前端修改特别注意**：
   - ⚠️ **前端代码修改后必须重新构建！**
   - 修改 `frontend/src/` 下的文件后，必须运行 `cd frontend && npm run build`
   - 否则修改不会在生产环境生效
   - 这是很多bug反复出现的主要原因

3. **文件排除**：
   - uploads/ 目录（用户上传文件）
   - node_modules/ 目录（依赖包）
   - 日志文件

4. **定期维护**：
   - 每周检查Git状态
   - 清理不需要的分支
   - 备份重要版本

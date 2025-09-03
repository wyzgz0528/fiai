# 安全修复流程

## 修复前准备 (必须执行)

1. **创建基线快照**
   ```bash
   ./scripts/regression-protection-system.sh
   ```

2. **执行自动化检查**
   ```bash
   ./scripts/automated-regression-check.sh
   ```

3. **记录当前问题**
   - 详细描述要修复的问题
   - 记录预期的修复效果
   - 确认修复范围

## 修复过程 (严格遵循)

1. **小步骤修复**
   - 每次只修复一个具体问题
   - 避免大范围修改
   - 保持修改的原子性

2. **每步验证**
   ```bash
   # 每次修改后立即检查
   ./scripts/automated-regression-check.sh
   
   # 对比变化
   ./scripts/before-after-comparison.sh
   ```

3. **功能测试**
   - 测试修复的具体功能
   - 测试相关的核心功能
   - 执行完整流程测试

## 修复后确认 (必须通过)

1. **自动化检查全部通过**
2. **手动功能测试通过**
3. **回归测试清单全部勾选**
4. **创建新的基线快照**

## 回滚机制

如果发现问题：
```bash
# 立即回滚到基线快照
git checkout $(cat baseline-snapshot-*/git-commit.txt)

# 或者使用git reset (谨慎使用)
git reset --hard $(cat baseline-snapshot-*/git-commit.txt)
```


const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');

// 设置时区为中国北京时间
process.env.TZ = 'Asia/Shanghai';

// 导入中间件
const { errorHandler, logger } = require('./middlewares/errorHandler');
const { rateLimiter, loginRateLimiter } = require('./middlewares/rateLimiter');
const { 
  corsOptions, 
  xssProtection, 
  sqlInjectionProtection, 
  fileUploadSecurity, 
  requestThrottling, 
  securityHeaders, 
  sanitizeInput 
} = require('./middlewares/security');

// 统一数据库连接
const db = require('./db');
const performanceMonitor = require('./utils/performance');
const { verifyToken } = require('./middlewares/auth');

// 导入路由
const userRoutes = require('./routes/user');
const reimbursementRoutes = require('./routes/reimbursement');
const loanRoutes = require('./routes/loan');
const batchRoutes = require('./routes/batch');
const uploadRoutes = require('./routes/upload');
const formApprovalRoutes = require('./routes/form_approval');
const dictRoutes = require('./routes/dict');
const analyticsRoutes = require('./routes/analytics');
const formsLiteRoutes = require('./routes/forms');
const formDetailRoutes = require('./routes/forms_detail');
const ocrRoutes = require('./routes/ocr');
const exportRoutes = require('./routes/export');
const { ensureCoreTables } = require('./migrations/ensure_core_tables');
const { ensureExpenseTypes } = require('./migrations/ensure_expense_types');
// 确保报销表/记录等核心表存在（用于借款抵扣明细联查）
let ensureFormTables;
try {
  ({ ensureFormTables } = require('./migrations/ensure_form_tables'));
} catch (_) {
  // 忽略缺失，兼容旧环境
}
const { addPerformanceIndexes } = require('./migrations/add_performance_indexes');
const { addCoreIndexes } = require('./migrations/0004_add_core_indexes');
const { logPermissionDiff } = require('./utils/permissionsCheck');
const { requestContext } = require('./middlewares/requestContext');
const { responseHelper } = require('./middlewares/response');
const { seedDefaultUsers, checkDatabaseHealth } = require('./migrations/seed_default_users');
// 引入用户路由内部逻辑以兼容旧 /api/login
const userDb = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const DEFAULT_PORT = config.port; // 统一来源 config（默认 3002，可被环境变量覆盖）

// 应用安全中间件
//app.use(helmet());
// 确保CORS中间件在路由之前应用
app.use(cors({
  origin: (origin, cb) => {
    // 允许无 Origin 的请求（如本地脚本、Postman、服务器到服务器）
    if (!origin) return cb(null, true);
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
if (config.security.enableHelmet) {
  app.use(helmet());
}
// 可按需开启输入清理/安全头
if (config.security.enableSecurityHeaders) {
  //app.use(xssProtection); // 旧自定义，可选择启用
  //app.use(sqlInjectionProtection);
  //app.use(securityHeaders);
}

// 应用性能监控
//app.use(performanceMonitor.startRequest.bind(performanceMonitor));

// 应用请求限制
// 速率限制：按配置或测试变量动态启用
app.use(rateLimiter);

// 解析JSON请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// 请求上下文（requestId & 基础耗时日志）
app.use(requestContext);
app.use(responseHelper);

// 静态文件服务
//app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 注册路由 (暂时禁用登录限流用于测试)
app.use('/api/user', userRoutes);
// 仅保留 /api/reimbursement 前缀的报销相关路由，移除 /api 下的重复挂载，避免双路由
app.use('/api/reimbursement', reimbursementRoutes);
// 新拆分（试运行）精简 forms 路由，仅列表：
app.use('/api/reimbursement', formsLiteRoutes);
// 新拆分详细/写操作路由
app.use('/api/reimbursement', formDetailRoutes);
// 审批路由
app.use('/api/reimbursement', formApprovalRoutes); // yields /api/reimbursement/reimbursement-forms/...

// 其它非报销域路由仍使用 /api 前缀
app.use('/api', loanRoutes);  // 借款相关仍保留 /api/loans*
app.use('/api/batch', batchRoutes);
app.use('/api/upload', fileUploadSecurity, uploadRoutes);
app.use('/api', dictRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ocr', ocrRoutes);  // OCR识别路由
app.use('/api/export', exportRoutes);  // 导出路由

// 兼容旧测试路径：/api/login -> /api/user/login
// 复用已加载的 loginRateLimiter (顶部已解构)
app.post('/api/login', loginRateLimiter, (req,res)=>{
  try {
    const { username, password } = req.body || {};
    if(!username || !password) return res.status(400).json({ error:'用户名或密码错误' });
    const user = userDb.prepare('SELECT * FROM users WHERE username=?').get(username);
  if(!user) return res.status(404).json({ msg:'用户不存在' });
  if(!bcrypt.compareSync(password, user.password)) return res.status(401).json({ msg:'密码错误' });
    const token = jwt.sign({ userId:user.id, username:user.username, role:user.role }, process.env.JWT_SECRET || 'test-123456789', { expiresIn:'7d'});
    // 同步在 Cookie 中设置 token，便于新窗口/下载链接等场景自动携带
    try {
      const sevenDays = 7 * 24 * 60 * 60; // seconds
      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: sevenDays * 1000,
        path: '/',
      });
    } catch(_) { /* noop */ }
  // 兼容旧测试结构：顶层 role, real_name，同时保留新 user 对象
  return res.json({ success:true, token, role:user.role, real_name:user.real_name, user:{ id:user.id, username:user.username, realName:user.real_name, role:user.role }});
  } catch(e){
    return res.status(500).json({ error:'登录失败' });
  }
});

// 兼容旧测试注册路径 /api/register （新规范路径应为 /api/user/register）
app.post('/api/register', async (req,res)=>{
  try {
    const { username, real_name, password, password2 } = req.body || {};
    if(!username || !real_name || !password || !password2) return res.status(400).json({ msg:'所有字段必填' });
    if(password !== password2) return res.status(400).json({ msg:'两次输入的密码必须一致' });
    if(String(password).length < 8) return res.status(400).json({ msg:'密码长度必须大于等于8位' });
    const exists = userDb.prepare('SELECT 1 FROM users WHERE username=?').get(username);
    if(exists) return res.status(409).json({ msg:'用户名已存在' });
    const hash = bcrypt.hashSync(password,10);
    userDb.prepare('INSERT INTO users(username,password,real_name,role) VALUES (?,?,?,?)').run(username, hash, real_name, 'employee');
    return res.json({ msg:'注册成功' });
  } catch(e){
    return res.status(500).json({ msg:'注册失败', detail:e.message });
  }
});

// 测试环境自动重置基础测试用户（幂等）
if(process.env.NODE_ENV==='test' && !process.env.SKIP_AUTO_RESET_USERS){
  try { const resetUsers = require('../scripts/reset_users_to_test_set'); resetUsers(); } catch(e){ console.warn('自动重置测试用户失败', e.message); }
}

// 显式废弃旧接口：所有 /api/reimbursements* 一律返回 410
app.all(['/api/reimbursements', '/api/reimbursements/*'], (req, res) => {
  res.status(410).json({
    error: '旧的记录级报销接口已移除',
    message: '请改用表单级接口：/api/reimbursement/reimbursement-forms*'
  });
});

// 添加attachments路由重定向
app.use('/api/attachments', uploadRoutes);

// 健康检查端点（增强）
app.get(['/api/health','/api/healthz'], (req, res) => {
  const start = Date.now();
  let dbRead = false, dbWrite = false, disk = false;
  try { db.prepare('SELECT 1').get(); dbRead = true; } catch(_){}
  try { db.exec('CREATE TABLE IF NOT EXISTS _health_tmp(id INTEGER); INSERT INTO _health_tmp(id) VALUES (1); DELETE FROM _health_tmp;'); dbWrite = true; } catch(_){}
  try {
    const fs = require('fs');
    const path = require('path');
    const p = path.join(__dirname, 'tmp_health');
    fs.writeFileSync(p, 'ok');
    fs.unlinkSync(p);
    disk = true;
  } catch(_){}
  res.json({
    status: (dbRead && dbWrite && disk) ? 'ok' : 'degraded',
    db: { read: dbRead, write: dbWrite },
    disk,
    version: process.env.APP_VERSION || 'dev',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start
  });
});

// 系统统计端点（支持按角色/个人过滤）
app.get('/api/system/stats', verifyToken, (req, res) => {
  try {
    // 解析过滤参数
    const scope = (req.query.scope || '').toString(); // mine | ''
    const queryUserId = req.query.userId ? parseInt(req.query.userId) : null;

    let filterUserId = null;
    if (scope === 'mine') {
      filterUserId = req.user.userId;
    } else if (queryUserId && ['finance', 'manager', 'admin'].includes(req.user.role)) {
      filterUserId = queryUserId;
    } else if (req.user.role === 'employee') {
      // 员工默认只看个人数据
      filterUserId = req.user.userId;
    }

    // 构建 WHERE 片段
    const byUserWhere = filterUserId ? ' WHERE user_id = ? ' : '';
    const byUserParams = filterUserId ? [filterUserId] : [];

  // 统计借款（仅中文状态）
    const loansTotal = db
      .prepare(`SELECT COUNT(*) AS c FROM loans${byUserWhere}`)
      .get(...byUserParams).c || 0;
    const loansPending = db
      .prepare(
        `SELECT COUNT(*) AS c FROM loans${byUserWhere ? byUserWhere + ' AND ' : ' WHERE '}status IN ('待财务审核','财务已审核')`
      )
      .get(...byUserParams).c || 0;
    const loansApproved = db
      .prepare(
        `SELECT COUNT(*) AS c FROM loans${byUserWhere ? byUserWhere + ' AND ' : ' WHERE '}status IN ('总经理已审批','已打款','部分已还','已还清')`
      )
      .get(...byUserParams).c || 0;

  // 统计报销单（仅中文状态，已统一）
    const rfUserWhere = filterUserId ? ' WHERE user_id = ? ' : '';
    const rfParams = filterUserId ? [filterUserId] : [];

    const reimbTotal = db
      .prepare(`SELECT COUNT(*) AS c FROM reimbursement_forms${rfUserWhere}`)
      .get(...rfParams).c || 0;
    const reimbPending = db
      .prepare(
        `SELECT COUNT(*) AS c FROM reimbursement_forms${rfUserWhere ? rfUserWhere + ' AND ' : ' WHERE '}status IN ('待财务审核','财务已审核','财务已通过')`
      )
      .get(...rfParams).c || 0;
    const reimbApproved = db
      .prepare(
        `SELECT COUNT(*) AS c FROM reimbursement_forms${rfUserWhere ? rfUserWhere + ' AND ' : ' WHERE '}status IN ('总经理已审批','总经理已通过','已打款')`
      )
      .get(...rfParams).c || 0;



    const stats = {
      performance: performanceMonitor.getStats(),
      database: { open: !!db, path: db.name || 'src/db.sqlite' },
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      scope: filterUserId ? 'personal' : 'global',
      filterUserId: filterUserId || null,
      loans: { total: loansTotal, pending: loansPending, approved: loansApproved },
      reimbursements: {
        total: reimbTotal,
        pending: reimbPending,
        approved: reimbApproved,
      },
  // 顶层快捷字段（兼容测试 / 旧前端）
  loansTotal: loansTotal,
  reimbursementsTotal: reimbTotal
    };
    res.json(stats);
  } catch (error) {
    logger.error('获取系统统计失败', { error: error.message });
    res.status(500).json({ error: '获取系统统计失败' });
  }
});

// 全局错误处理
app.use(errorHandler);

// 404处理（统一格式）
app.use('*', (req, res) => {
  res.status(404).json({ success:false, code:'NOT_FOUND', message:'接口不存在', requestId: req.requestId });
});

// 启动服务器（仅在直接运行时）
function startServer() {
  try {
    logger.info('开始初始化服务器');

    // 1. 确保核心表存在
    logger.info('初始化数据库表结构');
    ensureCoreTables();

    // 2. 报销类型表兜底创建
    try {
      ensureExpenseTypes();
      logger.info('报销类型表初始化完成');
    } catch(e){
      logger.error('报销类型表初始化失败', { error: e.message });
    }

    // 3. 若可用，确保表单/报销记录、批次与批次项等表存在，避免关联查询缺表
    try {
      ensureFormTables && ensureFormTables();
      logger.info('表单相关表初始化完成');
    } catch(e){
      logger.error('表单相关表初始化失败', { error: e.message });
    }

    // 4. 审批相关表与动态列兜底
    try {
      require('./services/approvalService').ensureApprovalSchema();
      logger.info('审批相关表初始化完成');
    } catch(e){
      logger.error('审批相关表初始化失败', { error: e.message });
    }

    // 5. 添加性能索引
    try {
      addPerformanceIndexes();
      addCoreIndexes();
      logger.info('数据库索引初始化完成');
    } catch(e) {
      logger.error('数据库索引初始化失败', { error: e.message });
    }

    // 5.5. 添加缺失的数据库字段（修复生产环境字段缺失问题）
    try {
      const { addMissingFields } = require('./migrations/0008_add_missing_fields');
      addMissingFields();
      logger.info('缺失字段检查和修复完成');
    } catch(e) {
      logger.error('缺失字段修复失败', { error: e.message });
    }

    // 6. 启动即运行迁移（幂等），以及状态统一脚本（幂等）——放在确保表存在之后
    try {
      const { runMigrations } = require('../scripts/migrate');
      const success = runMigrations();
      if (success) {
        logger.info('数据库迁移执行完成');
      } else {
        logger.warn('数据库迁移部分失败，但服务继续启动');
      }
    } catch(e){
      logger.error('运行迁移脚本失败', { error: e.message });
    }

    try {
      require('../fix_all_status');
      logger.info('状态统一脚本执行完成');
    } catch(e){
      logger.error('运行状态统一脚本失败', { error: e.message });
    }

    // 7. 迁移后进行默认用户种子，避免首次部署无法登录
    try {
      seedDefaultUsers();
      logger.info('默认用户初始化完成');

      // 验证用户数据完整性
      const isHealthy = checkDatabaseHealth();
      if (!isHealthy) {
        logger.error('数据库健康检查失败，可能影响登录功能');
        // 在生产环境中，这里可以选择退出或发送告警
        if (process.env.NODE_ENV === 'production') {
          logger.error('生产环境数据库不健康，建议检查数据库状态');
        }
      } else {
        logger.info('数据库健康检查通过');
      }
    } catch(e){
      logger.error('默认用户初始化失败', { error: e.message });
      // 在生产环境中，用户初始化失败是严重问题
      if (process.env.NODE_ENV === 'production') {
        logger.error('生产环境用户初始化失败，服务可能无法正常登录');
        // 可以选择退出进程，让PM2重启
        // process.exit(1);
      }
    }

    // 8. 开发环境权限检查
    if (process.env.NODE_ENV !== 'production') {
      try {
        logPermissionDiff(logger);
        logger.info('权限检查完成');
      } catch(e){
        logger.error('权限检查失败', { error: e.message });
      }
    }

    logger.info('服务器初始化完成，准备启动HTTP服务');
    let port = parseInt(process.env.PORT, 10) || DEFAULT_PORT;
    function listenOn(p){
      const server = app.listen(p, () => {
        logger.info('服务器启动成功', {
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          port: p
        });
      });
      server.on('error', (err)=>{
        if (err && err.code === 'EADDRINUSE') {
          const msg = `端口 ${p} 已被占用。`+
            (process.env.AUTO_PORT_FALLBACK === '1' ? '尝试使用下一个端口…' : '可运行 scripts/kill_port.ps1 释放端口，或设置环境变量 PORT 切换端口。');
          try { logger.error(msg); } catch(_){ console.error(msg); }
          if (process.env.AUTO_PORT_FALLBACK === '1') {
            const next = p + 1;
            // 避免递归过深，仅尝试一次切到 p+1
            process.env.PORT = String(next);
            listenOn(next);
          } else {
            process.exit(1);
          }
        } else {
          try { logger.error('服务器监听失败', { error: err && err.message ? err.message : String(err) }); } catch(_){ }
          process.exit(1);
        }
      });
      return server;
    }
    return listenOn(port);
  } catch (error) {
    logger.error('服务器启动失败', { error: error.message });
    process.exit(1);
  }
}

// 仅在非测试环境注册进程级别信号/异常处理，避免测试关闭 logger 后再写入导致 write after end
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => {
    try { logger.info('收到SIGTERM信号，正在关闭服务器...'); } catch(_){}
    process.exit(0);
  });

  process.on('SIGINT', () => {
    try { logger.info('收到SIGINT信号，正在关闭服务器...'); } catch(_){}
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    try { logger.error('未捕获异常', { error: error.message, stack: error.stack }); } catch(_){}
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    try { logger.error('未处理的Promise拒绝', { reason: reason && reason.message ? reason.message : String(reason) }); } catch(_){}
    process.exit(1);
  });
}

if (require.main === module) {
  startServer();
} else {
  // 测试场景下提供 app 对象
  module.exports = app;
}

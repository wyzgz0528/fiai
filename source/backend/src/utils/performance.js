const { logger } = require('../middlewares/errorHandler');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: new Map(),
      memory: [],
      errors: []
    };
    this.startTime = Date.now();
  }

  // 记录请求开始时间
  startRequest(req) {
    const requestId = `${req.method}-${req.url}-${Date.now()}`;
    this.metrics.requests.set(requestId, {
      method: req.method,
      url: req.url,
      startTime: Date.now(),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    return requestId;
  }

  // 记录请求结束时间
  endRequest(requestId, statusCode, error = null) {
    const request = this.metrics.requests.get(requestId);
    if (!request) return;

    request.endTime = Date.now();
    request.duration = request.endTime - request.startTime;
    request.statusCode = statusCode;

    if (error) {
      request.error = error.message;
      this.metrics.errors.push({
        timestamp: new Date(),
        requestId,
        error: error.message,
        stack: error.stack
      });
    }

    // 记录慢请求
    if (request.duration > 1000) {
      logger.warn('慢请求检测', {
        url: request.url,
        method: request.method,
        duration: request.duration,
        statusCode: request.statusCode
      });
    }

    // 清理请求记录（保留最近1000条）
    if (this.metrics.requests.size > 1000) {
      const entries = Array.from(this.metrics.requests.entries());
      const toDelete = entries.slice(0, entries.length - 1000);
      toDelete.forEach(([key]) => this.metrics.requests.delete(key));
    }
  }

  // 记录内存使用情况
  recordMemoryUsage() {
    const usage = process.memoryUsage();
    this.metrics.memory.push({
      timestamp: new Date(),
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external
    });

    // 保留最近100条内存记录
    if (this.metrics.memory.length > 100) {
      this.metrics.memory = this.metrics.memory.slice(-100);
    }

    // 检查内存使用是否过高
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 500) { // 超过500MB
      logger.warn('内存使用过高', {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024)
      });
    }
  }

  // 获取性能统计
  getStats() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    // 计算请求统计
    const requests = Array.from(this.metrics.requests.values());
    const totalRequests = requests.length;
    const avgResponseTime = totalRequests > 0 
      ? requests.reduce((sum, req) => sum + req.duration, 0) / totalRequests 
      : 0;
    
    const slowRequests = requests.filter(req => req.duration > 1000).length;
    const errorRequests = requests.filter(req => req.statusCode >= 400).length;

    // 计算内存统计
    const memoryRecords = this.metrics.memory;
    const avgMemoryUsage = memoryRecords.length > 0
      ? memoryRecords.reduce((sum, record) => sum + record.heapUsed, 0) / memoryRecords.length
      : 0;

    return {
      uptime: Math.floor(uptime / 1000), // 秒
      requests: {
        total: totalRequests,
        averageResponseTime: Math.round(avgResponseTime),
        slowRequests,
        errorRequests,
        successRate: totalRequests > 0 ? ((totalRequests - errorRequests) / totalRequests * 100).toFixed(2) : 100
      },
      memory: {
        current: process.memoryUsage(),
        average: Math.round(avgMemoryUsage / 1024 / 1024), // MB
        records: memoryRecords.length
      },
      errors: {
        total: this.metrics.errors.length,
        recent: this.metrics.errors.slice(-10)
      }
    };
  }

  // 获取慢请求列表
  getSlowRequests(limit = 10) {
    const requests = Array.from(this.metrics.requests.values());
    return requests
      .filter(req => req.duration > 1000)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  // 获取错误统计
  getErrorStats() {
    const errors = this.metrics.errors;
    const errorCounts = {};
    
    errors.forEach(error => {
      const key = error.error || 'Unknown Error';
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    return {
      total: errors.length,
      byType: errorCounts,
      recent: errors.slice(-20)
    };
  }

  // 清理旧数据
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    // 清理旧请求记录
    for (const [key, request] of this.metrics.requests.entries()) {
      if (request.endTime && request.endTime < oneHourAgo) {
        this.metrics.requests.delete(key);
      }
    }

    // 清理旧内存记录
    this.metrics.memory = this.metrics.memory.filter(
      record => record.timestamp.getTime() > oneHourAgo
    );

    // 清理旧错误记录
    this.metrics.errors = this.metrics.errors.filter(
      error => error.timestamp.getTime() > oneHourAgo
    );
  }
}

// 创建单例实例
const performanceMonitor = new PerformanceMonitor();

// 定期记录内存使用情况（测试环境使用 unref 以免阻塞进程退出）
const __memInterval = setInterval(() => {
  performanceMonitor.recordMemoryUsage();
}, 60000);
// 定期清理旧数据
const __cleanupInterval = setInterval(() => {
  performanceMonitor.cleanup();
}, 300000);

function maybeUnref(i){ try { if(process.env.NODE_ENV==='test' || process.argv.some(a=>/mocha/.test(a))) i.unref && i.unref(); } catch(_){} }
maybeUnref(__memInterval);
maybeUnref(__cleanupInterval);

function shutdownPerformanceMonitor(){
  clearInterval(__memInterval);
  clearInterval(__cleanupInterval);
}

module.exports = performanceMonitor;
module.exports.shutdown = shutdownPerformanceMonitor;
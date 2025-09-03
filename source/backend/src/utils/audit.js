const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// 轻量兜底：确保 audit_events 表存在（兼容老环境）
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    event_type TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    detail TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
  )`).run();
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id)').run(); } catch(_){}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type)').run(); } catch(_){}
} catch(_) {}

// 新规范：audit_events 表（已由迁移 0003 创建）
function recordAudit({ userId, eventType, entity, entityId, detail = '', ip = '', reqId }) {
  try {
    const rid = reqId || uuidv4();
    db.prepare('INSERT INTO audit_events (user_id, event_type, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?)')
      .run(userId || null, eventType, entity || null, entityId || null, detail, ip);
    return rid;
  } catch (e) {
    return null; // swallow
  }
}

// 兼容旧调用语义 logAction -> 映射到 recordAudit(eventType=action, entity=null)
function logAction({ userId, action, detail = '', ip = '' }) {
  return recordAudit({ userId, eventType: action, detail, ip });
}

module.exports = { logAction, recordAudit };

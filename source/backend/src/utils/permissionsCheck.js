const fs = require('fs');
const path = require('path');
const { PERMISSIONS } = require('../auth/permissions');

function loadJsonMatrix() {
  try {
    const p = path.join(__dirname, '..', 'permissions.json');
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function diffPermissions() {
  const jsonMatrix = loadJsonMatrix();
  if (!jsonMatrix) return { ok: false, message: 'permissions.json 未找到' };
  const code = PERMISSIONS;
  const roleDiff = {};
  let mismatch = false;
  for (const role of Object.keys({ ...code, ...jsonMatrix })) {
    const a = new Set(code[role] || []);
    const b = new Set(jsonMatrix[role] || []);
    const onlyInCode = [...a].filter(x => !b.has(x));
    const onlyInJson = [...b].filter(x => !a.has(x));
    if (onlyInCode.length || onlyInJson.length) {
      mismatch = true;
      roleDiff[role] = { onlyInCode, onlyInJson };
    }
  }
  return { ok: !mismatch, diff: roleDiff };
}

function logPermissionDiff(logger) {
  const { ok, diff, message } = diffPermissions();
  if (!ok) {
    (logger || console).warn('[permissionsCheck] 权限矩阵存在差异', message || diff);
  } else {
    (logger || console).info('[permissionsCheck] 权限矩阵验证通过');
  }
}

module.exports = { diffPermissions, logPermissionDiff };

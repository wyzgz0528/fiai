const { hasPermission } = require('../auth/permissions');

function requirePermission(perm){
  return function(req,res,next){
    if(!req.user){ return res.status(401).json({ success:false, code:'UNAUTH', message:'未登录' }); }
    if(hasPermission(req.user.role, perm)) return next();
    return res.status(403).json({ success:false, code:'FORBIDDEN', message:'无权限', perm });
  };
}
module.exports = { requirePermission };

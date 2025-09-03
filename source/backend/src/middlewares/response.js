function responseHelper(req,res,next){
  res.ok = (data)=>res.json({ success:true, data });
  res.fail = (code,message,extra={})=>res.status(code>=100&&code<600?code:400).json({ success:false, code, message, ...extra });
  next();
}
module.exports = { responseHelper };

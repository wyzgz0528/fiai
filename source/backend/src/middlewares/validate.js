const { ZodError } = require('zod');

function validate(schema, pick = 'body') {
  return (req, res, next) => {
    try {
      const data = pick === 'query' ? req.query : pick === 'params' ? req.params : req.body;
      const parsed = schema.parse(data);
      if (pick === 'body') req.body = parsed;
      else if (pick === 'query') req.query = parsed;
      else if (pick === 'params') req.params = parsed;
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: '参数校验失败',
            errors: e.errors.map(err => ({ path: err.path.join('.'), message: err.message })),
          requestId: req.requestId
        });
      }
      next(e);
    }
  };
}

module.exports = { validate };

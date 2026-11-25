function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success) {
      return res.status(400).json({
        error: 'Please check the submitted information.',
        details: result.error.issues.map(issue => ({ field: issue.path.slice(1).join('.'), message: issue.message }))
      });
    }
    req.validated = result.data;
    next();
  };
}

module.exports = validate;
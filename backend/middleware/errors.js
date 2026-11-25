function notFound(req, res) {
  res.status(404).json({ error: 'The requested resource was not found.' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === 11000) return res.status(409).json({ error: 'A record with that value already exists.' });
  if (error.name === 'CastError') return res.status(404).json({ error: 'The requested record was not found.' });
  if (error.name === 'MulterError') return res.status(400).json({ error: error.message });
  if (error.statusCode && error.statusCode < 500) return res.status(error.statusCode).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
}

module.exports = { notFound, errorHandler };
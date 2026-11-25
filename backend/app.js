const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
	imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
	styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
	fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:']
} } }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(mongoSanitize());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));
app.use(express.static(path.resolve('public')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/waste', require('./routes/waste'));
app.use('/api/collection', require('./routes/collection'));
app.use('/api/recycler', require('./routes/recycler'));
app.use('/api/rewards', require('./routes/rewards'));
app.use('/api/blockchain', require('./routes/blockchain'));
app.use('/api/admin', require('./routes/admin'));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/recyclerController');

const router = Router();
router.use(authenticate);
router.get('/available', authorize('recycler'), controller.available);
router.post('/receive', authorize('recycler', 'admin'), controller.receive);
router.post('/complete', authorize('recycler', 'admin'), controller.complete);
router.get('/history', authorize('recycler', 'admin'), controller.history);

module.exports = router;
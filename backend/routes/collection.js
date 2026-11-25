const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/collectionController');

const router = Router();
router.use(authenticate);
router.post('/assign', authorize('admin'), controller.assign);
router.patch('/:id/verify', authorize('agent', 'admin'), controller.verify);
router.get('/history', authorize('agent', 'admin'), controller.history);

module.exports = router;
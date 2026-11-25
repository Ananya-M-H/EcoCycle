const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/rewardsController');

const router = Router();
router.use(authenticate, authorize('user'));
router.get('/balance', controller.balance);
router.get('/history', controller.history);
router.post('/redeem', controller.redeem);

module.exports = router;
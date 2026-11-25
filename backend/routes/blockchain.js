const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/blockchainController');

const router = Router();
router.use(authenticate);
router.get('/transactions', controller.transactions);
router.get('/verify/:requestId', controller.verify);
router.get('/contract-info', authorize('admin'), controller.contractInfo);

module.exports = router;
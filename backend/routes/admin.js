const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/adminController');

const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/dashboard', controller.dashboard);
router.get('/users', controller.listUsers);
router.post('/staff', controller.createStaff);
router.patch('/staff/:id', controller.updateStaff);
router.delete('/staff/:id', controller.deactivateStaff);
router.patch('/staff/:id/activate', controller.activateStaff);
router.get('/reports', controller.reports);

module.exports = router;
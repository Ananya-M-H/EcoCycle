const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const controller = require('../controllers/wasteController');

const router = Router();
router.use(authenticate);
router.post('/', authorize('user'), upload.single('photo'), controller.create);
router.get('/mine', authorize('user'), controller.mine);
router.get('/all', authorize('admin'), controller.listAll);
router.get('/:id/photo', controller.photo);
router.get('/:id', controller.getOne);
router.patch('/:id', authorize('admin'), controller.update);

module.exports = router;
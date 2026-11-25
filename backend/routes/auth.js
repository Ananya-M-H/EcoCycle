const { Router } = require('express');
const { z } = require('zod');
const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = Router();
const registerSchema = z.object({ body: z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(72)
}) });
const loginSchema = z.object({ body: z.object({ email: z.string().trim().email().transform(value => value.toLowerCase()), password: z.string().min(1).max(72) }) });
const walletSchema = z.object({ body: z.object({ walletAddress: z.union([z.string().trim().max(42), z.null()]) }) });
const profileSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().max(30).optional() }) });

router.post('/register', validate(registerSchema), controller.register);
router.post('/login', validate(loginSchema), controller.login);
router.get('/me', authenticate, controller.me);
router.patch('/wallet', authenticate, validate(walletSchema), controller.updateWallet);
router.patch('/profile', authenticate, validate(profileSchema), controller.updateProfile);

module.exports = router;
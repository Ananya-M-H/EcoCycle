const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { isAddress } = require('ethers');
const User = require('../models/User');

function createToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, walletAddress: user.walletAddress || null, phone: user.phone || '' };
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.validated.body;
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, role: 'user' });
    res.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.validated.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
}

async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

async function updateWallet(req, res, next) {
  try {
    const address = req.validated.body.walletAddress;
    if (address && !isAddress(address)) return res.status(400).json({ error: 'Enter a valid Ethereum wallet address.' });
    req.user.walletAddress = address ? address.toLowerCase() : undefined;
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  } catch (error) { next(error); }
}

async function updateProfile(req, res, next) {
  try {
    req.user.name = req.validated.body.name;
    req.user.phone = req.validated.body.phone || '';
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  } catch (error) { next(error); }
}

module.exports = { register, login, me, updateWallet, updateProfile };
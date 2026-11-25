require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in .env first.');
  if (ADMIN_PASSWORD.length > 72) throw new Error('ADMIN_PASSWORD must be 72 characters or fewer.');
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const existingEmailUser = await User.findOne({ email });
  if (existingEmailUser && existingEmailUser.role !== 'admin') {
    throw new Error('ADMIN_EMAIL is already used by a non-admin account.');
  }
  const user = existingEmailUser || await User.findOne({ role: 'admin' }) || new User();
  user.name = ADMIN_NAME;
  user.email = email;
  user.role = 'admin';
  user.passwordHash = passwordHash;
  user.active = true;
  await user.save();
  console.log(`Administrator ready: ${user.email}`);
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
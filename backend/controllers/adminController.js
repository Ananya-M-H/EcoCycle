const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const Recycler = require('../models/Recycler');
const WasteRequest = require('../models/WasteRequest');
const Reward = require('../models/Reward');
const BlockchainTransaction = require('../models/BlockchainTransaction');

const optionalStaffText = max => z.string().trim().max(max).optional()
  .transform(value => value || undefined)
  .refine(value => !value || value.length >= 2);

async function dashboard(req, res, next) {
  try {
    const [users, requestsByStatus, totals, rewardPoints, transactions] = await Promise.all([
      User.countDocuments({ role: 'user', active: true }),
      WasteRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      WasteRequest.aggregate([
        { $match: { status: { $in: ['COLLECTED', 'RECEIVED', 'RECYCLED'] } } },
        { $group: { _id: null, collectedKg: { $sum: '$weightKg' }, recycledKg: { $sum: { $cond: [{ $eq: ['$status', 'RECYCLED'] }, '$weightKg', 0] } } } }
      ]),
      Reward.aggregate([{ $match: { type: 'CREDIT' } }, { $group: { _id: null, points: { $sum: '$points' } } }]),
      BlockchainTransaction.countDocuments()
    ]);
    res.json({ users, requestsByStatus: Object.fromEntries(requestsByStatus.map(item => [item._id, item.count])), collectedKg: totals[0]?.collectedKg || 0, recycledKg: totals[0]?.recycledKg || 0, rewardsDistributed: rewardPoints[0]?.points || 0, blockchainTransactions: transactions });
  } catch (error) { next(error); }
}

async function listUsers(req, res, next) {
  try {
    const filter = {};
    if (req.query.role === 'staff') filter.role = { $in: ['agent', 'recycler'] };
    else if (['user', 'agent', 'recycler', 'admin'].includes(req.query.role)) filter.role = req.query.role;
    if (['agent', 'recycler'].includes(req.query.role)) filter.active = true;
    if (req.query.search) filter.$or = [
      { name: new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { email: new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    ];
    const users = await User.find(filter).select('-passwordHash').sort({ createdAt: -1 }).limit(200);
    const profiles = await Recycler.find({ user: { $in: users.filter(user => user.role === 'recycler').map(user => user._id) } });
    const profilesByUser = new Map(profiles.map(profile => [String(profile.user), profile]));
    res.json({ users: users.map(user => {
      const profile = profilesByUser.get(user.id);
      return {
        ...user.toJSON(),
        organization: profile?.organization || '',
        authorizationNumber: profile?.authorizationNumber || ''
      };
    }) });
  } catch (error) { next(error); }
}

async function createStaff(req, res, next) {
  try {
    const parsed = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
      password: z.string().min(1).max(72),
      role: z.enum(['agent', 'recycler']),
      organization: optionalStaffText(150),
      authorizationNumber: optionalStaffText(120)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please provide valid staff details.' });
    if (await User.exists({ email: parsed.data.email })) return res.status(409).json({ error: 'An account with this email already exists.' });
    if (parsed.data.role === 'recycler' && (!parsed.data.organization || !parsed.data.authorizationNumber)) return res.status(400).json({ error: 'Recycler organization and authorization number are required.' });
    const user = await User.create({ name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 12), role: parsed.data.role });
    if (user.role === 'recycler') await Recycler.create({ user: user.id, organization: parsed.data.organization, authorizationNumber: parsed.data.authorizationNumber });
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { next(error); }
}

async function updateStaff(req, res, next) {
  try {
    const id = z.string().regex(/^[a-f\d]{24}$/i).safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ error: 'Staff account not found.' });
    const parsed = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
      password: z.string().max(72).optional(),
      organization: optionalStaffText(150),
      authorizationNumber: optionalStaffText(120)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please provide valid staff details.' });

    const user = await User.findOne({ _id: id.data, role: { $in: ['agent', 'recycler'] } });
    if (!user) return res.status(404).json({ error: 'Staff account not found.' });
    if (await User.exists({ email: parsed.data.email, _id: { $ne: user._id } })) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    if (user.role === 'recycler' && (!parsed.data.organization || !parsed.data.authorizationNumber)) {
      return res.status(400).json({ error: 'Recycler organization and authorization number are required.' });
    }

    user.name = parsed.data.name;
    user.email = parsed.data.email;
    if (parsed.data.password) user.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await user.save();
    if (user.role === 'recycler') {
      await Recycler.findOneAndUpdate(
        { user: user.id },
        { $set: { organization: parsed.data.organization, authorizationNumber: parsed.data.authorizationNumber } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    }
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
  } catch (error) { next(error); }
}

async function deactivateStaff(req, res, next) {
  try {
    const id = z.string().regex(/^[a-f\d]{24}$/i).safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ error: 'Staff account not found.' });
    const user = await User.findOneAndUpdate(
      { _id: id.data, role: { $in: ['agent', 'recycler'] } },
      { active: false },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'Staff account not found.' });
    if (user.role === 'recycler') await Recycler.updateOne({ user: user.id }, { active: false });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
  } catch (error) { next(error); }
}

async function activateStaff(req, res, next) {
  try {
    const id = z.string().regex(/^[a-f\d]{24}$/i).safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ error: 'Staff account not found.' });
    const user = await User.findOneAndUpdate(
      { _id: id.data, role: { $in: ['agent', 'recycler'] } },
      { active: true },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'Staff account not found.' });
    if (user.role === 'recycler') await Recycler.updateOne({ user: user.id }, { active: true });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
  } catch (error) { next(error); }
}

async function reports(req, res, next) {
  try {
    const [categories, monthly] = await Promise.all([
      WasteRequest.aggregate([{ $group: { _id: '$category', requests: { $sum: 1 }, weightKg: { $sum: '$weightKg' } } }, { $sort: { weightKg: -1 } }]),
      WasteRequest.aggregate([{ $match: { status: 'RECYCLED' } }, { $group: { _id: { year: { $year: '$recycledAt' }, month: { $month: '$recycledAt' } }, weightKg: { $sum: '$weightKg' }, requests: { $sum: 1 } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }])
    ]);
    res.json({ categories, monthly });
  } catch (error) { next(error); }
}

module.exports = { dashboard, listUsers, createStaff, updateStaff, deactivateStaff, activateStaff, reports };
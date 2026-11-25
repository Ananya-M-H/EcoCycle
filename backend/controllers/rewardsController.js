const mongoose = require('mongoose');
const { z } = require('zod');
const Reward = require('../models/Reward');
const User = require('../models/User');

async function balance(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('pointsBalance');
    res.json({ points: user.pointsBalance });
  } catch (error) { next(error); }
}

async function history(req, res, next) {
  try {
    const rewards = await Reward.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100).populate('blockchainTransaction', 'transactionHash transactionId');
    res.json({ rewards });
  } catch (error) { next(error); }
}

async function redeem(req, res, next) {
  let session;
  try {
    const parsed = z.object({ points: z.number().int().min(1).max(100000), idempotencyKey: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a positive whole number of points and a valid idempotency key.' });
    session = await mongoose.startSession();
    let reward;
    let insufficient = false;
    await session.withTransaction(async () => {
      const previous = await Reward.findOne({ redemptionKey: parsed.data.idempotencyKey }).session(session);
      if (previous) {
        if (String(previous.user) !== req.user.id || previous.points !== parsed.data.points) throw Object.assign(new Error('This idempotency key was already used for a different redemption.'), { statusCode: 409 });
        reward = previous;
        return;
      }
      const user = await User.findOneAndUpdate(
        { _id: req.user.id, pointsBalance: { $gte: parsed.data.points } },
        { $inc: { pointsBalance: -parsed.data.points } },
        { new: true, session }
      );
      if (!user) { insufficient = true; return; }
      [reward] = await Reward.create([{
        user: req.user.id,
        type: 'REDEMPTION',
        points: parsed.data.points,
        redemptionKey: parsed.data.idempotencyKey,
        description: 'Points redemption'
      }], { session });
    });
    if (insufficient) return res.status(409).json({ error: 'Your available points balance is too low.' });
    res.status(201).json({ reward });
  } catch (error) { next(error); }
  finally { if (session) await session.endSession(); }
}

module.exports = { balance, history, redeem };
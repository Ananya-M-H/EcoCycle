const mongoose = require('mongoose');
const { z } = require('zod');
const WasteRequest = require('../models/WasteRequest');
const Recycler = require('../models/Recycler');
const Reward = require('../models/Reward');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const User = require('../models/User');
const blockchain = require('../services/blockchain');

async function profileFor(userId) {
  const [profile, user] = await Promise.all([
    Recycler.findOne({ user: userId, active: true }),
    User.findOne({ _id: userId, role: 'recycler', active: true }).select('_id')
  ]);
  return profile && user ? profile : null;
}

async function receive(req, res, next) {
  try {
    const request = await WasteRequest.findById(req.body.requestId);
    if (!request) return res.status(404).json({ error: 'Waste request not found.' });
    if (request.status !== 'COLLECTED') return res.status(409).json({ error: 'Only collected requests can be received for recycling.' });
    const recyclerId = req.user.role === 'admin' ? request.assignedRecycler : req.user.id;
    if (!recyclerId) return res.status(409).json({ error: 'Assign an authorized recycler before confirming receipt.' });
    if (!(await profileFor(recyclerId))) return res.status(403).json({ error: 'The assigned recycler authorization is not active.' });
    if (req.user.role !== 'admin' && request.assignedRecycler && String(request.assignedRecycler) !== req.user.id) {
      return res.status(403).json({ error: 'This request is assigned to another recycler.' });
    }
    request.assignedRecycler = recyclerId;
    request.status = 'RECEIVED';
    request.receivedAt = new Date();
    await request.save();
    res.json({ request });
  } catch (error) { next(error); }
}

async function available(req, res, next) {
  try {
    if (!(await profileFor(req.user.id))) return res.status(403).json({ error: 'Your recycler authorization is not active.' });
    const requests = await WasteRequest.find({
      status: { $in: ['COLLECTED', 'RECEIVED'] },
      $or: [{ assignedRecycler: null }, { assignedRecycler: req.user.id }]
    }).sort({ collectedAt: 1 }).populate('user', 'name walletAddress').populate('assignedAgent', 'name');
    res.json({ requests });
  } catch (error) { next(error); }
}

async function complete(req, res, next) {
  let session;
  try {
    const parsed = z.object({
      requestId: z.string().min(1),
      recyclerReference: z.string().trim().min(3).max(120),
      certificateNumber: z.string().trim().min(2).max(120)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'A valid recycler reference and certificate number are required.' });

    const request = await WasteRequest.findById(parsed.data.requestId).populate('user', 'walletAddress');
    if (!request) return res.status(404).json({ error: 'Waste request not found.' });
    const recyclerId = req.user.role === 'admin' ? request.assignedRecycler : req.user.id;
    if (!recyclerId || String(request.assignedRecycler) !== String(recyclerId)) {
      return res.status(403).json({ error: 'This request must be assigned to an authorized recycler.' });
    }
    if (!(await profileFor(recyclerId))) {
      return res.status(403).json({ error: 'The assigned recycler authorization is not active.' });
    }
    if (request.status === 'RECYCLED') {
      const [transaction, reward] = await Promise.all([
        BlockchainTransaction.findOne({ request: request.id }),
        Reward.findOne({ request: request.id, type: 'CREDIT' })
      ]);
      return res.json({ request, transaction, reward, alreadyCompleted: true });
    }
    if (request.status !== 'RECEIVED') return res.status(409).json({ error: 'Only received requests can be marked recycled.' });
    if (!request.user.walletAddress) return res.status(400).json({ error: 'The user must connect a wallet before recycling can be verified.' });

    const chainResult = await blockchain.recordOrFind({
      requestId: request.requestId,
      walletAddress: request.user.walletAddress,
      weightKg: request.weightKg,
      recyclerReference: parsed.data.recyclerReference
    });

    session = await mongoose.startSession();
    let response;
    await session.withTransaction(async () => {
      const existing = await BlockchainTransaction.findOne({ request: request.id }).session(session);
      if (existing) {
        response = {
          transaction: existing,
          reward: await Reward.findOne({ request: request.id, type: 'CREDIT' }).session(session),
          request: await WasteRequest.findById(request.id).session(session),
          alreadyCompleted: true
        };
        return;
      }

      const [transaction] = await BlockchainTransaction.create([{
        request: request.id,
        requestId: request.requestId,
        transactionHash: chainResult.transactionHash,
        transactionId: chainResult.transactionId,
        walletAddress: chainResult.walletAddress,
        weightGrams: chainResult.weightGrams,
        rewardPoints: chainResult.rewardPoints,
        recyclerReference: chainResult.recyclerReference,
        blockNumber: chainResult.blockNumber,
        confirmedAt: chainResult.timestamp
      }], { session });

      const [reward] = await Reward.create([{
        user: request.user.id,
        request: request.id,
        requestId: request.requestId,
        type: 'CREDIT',
        points: chainResult.rewardPoints,
        weightKg: request.weightKg,
        blockchainTransaction: transaction.id,
        description: `${request.weightKg} kg recycled; 10 points per kg`
      }], { session });

      const [updatedRequest] = await Promise.all([
        WasteRequest.findOneAndUpdate({ _id: request.id, status: 'RECEIVED', assignedRecycler: recyclerId }, {
          status: 'RECYCLED', recycledAt: chainResult.timestamp, recyclerReference: chainResult.recyclerReference, certificateNumber: parsed.data.certificateNumber
        }, { new: true, session, runValidators: true }),
        User.updateOne({ _id: request.user.id }, { $inc: { pointsBalance: chainResult.rewardPoints } }, { session })
      ]);
      if (!updatedRequest) throw new Error('Request state changed before reward confirmation could complete.');
      response = { request: updatedRequest, transaction, reward, alreadyCompleted: false };
    });
    res.json(response);
  } catch (error) { next(error); }
  finally { if (session) await session.endSession(); }
}

async function history(req, res, next) {
  try {
    const filter = req.user.role === 'admin' ? {} : { assignedRecycler: req.user.id };
    const requests = await WasteRequest.find(filter).sort({ updatedAt: -1 }).populate('user', 'name email walletAddress').populate('assignedAgent', 'name');
    res.json({ requests });
  } catch (error) { next(error); }
}

module.exports = { receive, available, complete, history };
const { z } = require('zod');
const blockchain = require('../services/blockchain');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const WasteRequest = require('../models/WasteRequest');

async function transactions(req, res, next) {
  try {
    if (req.user.role === 'user' && !req.user.walletAddress) return res.json({ transactions: [] });
    const filter = req.user.role === 'user' ? { walletAddress: req.user.walletAddress } : {};
    const transactions = await BlockchainTransaction.find(filter).sort({ confirmedAt: -1 }).limit(100).populate('request', 'deviceName category');
    res.json({ transactions });
  } catch (error) { next(error); }
}

async function verify(req, res, next) {
  try {
    const parsed = z.string().min(1).max(100).safeParse(req.params.requestId);
    if (!parsed.success) return res.status(400).json({ error: 'A valid request ID is required.' });
    const request = await WasteRequest.findOne({ requestId: parsed.data }).populate('user', '_id');
    if (req.user.role === 'user' && (!request || String(request.user._id) !== req.user.id)) return res.status(404).json({ error: 'Recycling record not found.' });
    const result = await blockchain.verify(parsed.data);
    res.json(result);
  } catch (error) { next(error); }
}

async function contractInfo(req, res, next) {
  try { res.json(blockchain.info()); }
  catch (error) { next(error); }
}

module.exports = { transactions, verify, contractInfo };
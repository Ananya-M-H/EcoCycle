const mongoose = require('mongoose');

const blockchainTransactionSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteRequest', required: true, unique: true },
  requestId: { type: String, required: true, unique: true },
  transactionHash: { type: String, required: true, unique: true },
  transactionId: { type: String, required: true, unique: true },
  walletAddress: { type: String, required: true, lowercase: true },
  weightGrams: { type: Number, required: true, min: 1 },
  rewardPoints: { type: Number, required: true, min: 0 },
  recyclerReference: { type: String, required: true },
  blockNumber: { type: Number, required: true },
  confirmedAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('BlockchainTransaction', blockchainTransactionSchema);
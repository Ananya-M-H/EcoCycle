const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteRequest', default: null },
  requestId: { type: String, default: null },
  redemptionKey: { type: String },
  type: { type: String, enum: ['CREDIT', 'REDEMPTION'], required: true },
  points: { type: Number, required: true, min: 1 },
  weightKg: { type: Number, min: 0 },
  blockchainTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockchainTransaction', default: null },
  description: { type: String, trim: true, maxlength: 300, required: true }
}, { timestamps: true });

rewardSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { type: 'CREDIT', requestId: { $type: 'string' } } });
rewardSchema.index({ redemptionKey: 1 }, { unique: true, sparse: true });
rewardSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('Reward', rewardSchema);
const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteRequest', required: true, unique: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['ASSIGNED', 'COLLECTED'], default: 'ASSIGNED', required: true },
  assignedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Collection', collectionSchema);
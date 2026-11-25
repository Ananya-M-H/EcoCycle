const mongoose = require('mongoose');

const wasteRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceName: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, enum: ['Mobile phones', 'Laptops', 'Desktop computers', 'Batteries', 'Televisions', 'Monitors', 'Printers', 'Other electronic devices'] },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  weightKg: { type: Number, required: true, min: 0.1, max: 10000 },
  condition: { type: String, required: true, enum: ['Working', 'Damaged', 'Non-functional', 'Mixed'] },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  photoPath: { type: String, default: '' },
  pickupAddress: { type: String, required: true, trim: true, maxlength: 500 },
  preferredDate: { type: Date, required: true },
  status: { type: String, enum: ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'RECEIVED', 'RECYCLED'], default: 'REQUESTED', index: true },
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedRecycler: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  pickupOtpHash: { type: String, required: true, select: false },
  collectedAt: { type: Date, default: null },
  receivedAt: { type: Date, default: null },
  recycledAt: { type: Date, default: null },
  recyclerReference: { type: String, trim: true, maxlength: 120, default: '' },
  certificateNumber: { type: String, trim: true, maxlength: 120, default: '' }
}, { timestamps: true });

wasteRequestSchema.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model('WasteRequest', wasteRequestSchema);
const mongoose = require('mongoose');

const recyclerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  organization: { type: String, required: true, trim: true, maxlength: 150 },
  authorizationNumber: { type: String, required: true, trim: true, maxlength: 120 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Recycler', recyclerSchema);
const bcrypt = require('bcryptjs');
const Collection = require('../models/Collection');
const WasteRequest = require('../models/WasteRequest');

async function assign(req, res, next) {
  try {
    const { requestId, agentId } = req.body;
    const [request, agent] = await Promise.all([
      WasteRequest.findById(requestId),
      require('../models/User').findOne({ _id: agentId, role: 'agent', active: true })
    ]);
    if (!request) return res.status(404).json({ error: 'Waste request not found.' });
    if (!agent) return res.status(400).json({ error: 'Choose an active collection agent.' });
    if (!['REQUESTED', 'ASSIGNED'].includes(request.status)) return res.status(409).json({ error: 'This request can no longer be assigned for collection.' });
    request.assignedAgent = agent.id;
    request.status = 'ASSIGNED';
    await request.save();
    const collection = await Collection.findOneAndUpdate({ request: request.id }, { request: request.id, agent: agent.id, status: 'ASSIGNED', assignedAt: new Date(), verifiedAt: null }, { upsert: true, new: true, runValidators: true }).populate('agent', 'name email');
    res.json({ collection, request });
  } catch (error) { next(error); }
}

async function verify(req, res, next) {
  try {
    const request = await WasteRequest.findById(req.params.id).select('+pickupOtpHash');
    if (!request) return res.status(404).json({ error: 'Waste request not found.' });
    const agentId = request.assignedAgent;
    if (!agentId) return res.status(409).json({ error: 'Assign a collection agent before verifying pickup.' });
    if (req.user.role !== 'admin' && String(agentId) !== req.user.id) return res.status(403).json({ error: 'This request is not assigned to you.' });
    if (request.status !== 'ASSIGNED') return res.status(409).json({ error: 'Only assigned requests can be verified as collected.' });
    if (!(await bcrypt.compare(String(req.body.otp || ''), request.pickupOtpHash))) return res.status(400).json({ error: 'The collection code is incorrect.' });
    const updated = await WasteRequest.findOneAndUpdate(
      { _id: request.id, assignedAgent: agentId, status: 'ASSIGNED' },
      { status: 'COLLECTED', collectedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(409).json({ error: 'This request has already changed state.' });
    const collection = await Collection.findOneAndUpdate({ request: request.id, agent: agentId }, { status: 'COLLECTED', verifiedAt: new Date() }, { new: true });
    res.json({ request: updated, collection });
  } catch (error) { next(error); }
}

async function history(req, res, next) {
  try {
    const filter = req.user.role === 'admin' ? {} : { agent: req.user.id };
    const collections = await Collection.find(filter).sort({ updatedAt: -1 }).populate({ path: 'request', populate: { path: 'user', select: 'name email' } }).populate('agent', 'name email');
    res.json({ collections });
  } catch (error) { next(error); }
}

module.exports = { assign, verify, history };
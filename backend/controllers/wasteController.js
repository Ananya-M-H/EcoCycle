const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const WasteRequest = require('../models/WasteRequest');
const Collection = require('../models/Collection');
const User = require('../models/User');

const categories = ['Mobile phones', 'Laptops', 'Desktop computers', 'Batteries', 'Televisions', 'Monitors', 'Printers', 'Other electronic devices'];
const conditions = ['Working', 'Damaged', 'Non-functional', 'Mixed'];
const wasteSchema = z.object({
  deviceName: z.string().trim().min(2).max(120),
  category: z.enum(categories),
  quantity: z.coerce.number().int().min(1).max(1000),
  weightKg: z.coerce.number().min(0.1).max(10000),
  condition: z.enum(conditions),
  description: z.string().trim().max(2000).optional().default(''),
  pickupAddress: z.string().trim().min(8).max(500),
  preferredDate: z.coerce.date().refine(date => date >= new Date(new Date().setHours(0, 0, 0, 0)), 'Choose today or a future date.')
});

function safeRequest(request) {
  const object = request.toObject();
  delete object.pickupOtpHash;
  return object;
}

async function create(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'A device photograph is required.' });
    const signature = Buffer.alloc(12);
    const descriptor = fs.openSync(req.file.path, 'r');
    try { fs.readSync(descriptor, signature, 0, signature.length, 0); } finally { fs.closeSync(descriptor); }
    const validImage = req.file.mimetype === 'image/jpeg' ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
      : req.file.mimetype === 'image/png' ? signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : req.file.mimetype === 'image/webp' ? signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP'
          : false;
    if (!validImage) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'The uploaded file is not a valid JPEG, PNG, or WebP image.' });
    }
    const parsed = wasteSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) require('fs').unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Please check the request details.', details: parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) });
    }
    const pickupOtp = String(crypto.randomInt(100000, 1000000));
    const request = await WasteRequest.create({
      ...parsed.data,
      requestId: `ECO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      user: req.user.id,
      pickupOtpHash: await bcrypt.hash(pickupOtp, 10),
      photoPath: req.file ? `/uploads/${req.file.filename}` : ''
    });
    res.status(201).json({ request: safeRequest(request), pickupOtp });
  } catch (error) { next(error); }
}

async function mine(req, res, next) {
  try {
    const requests = await WasteRequest.find({ user: req.user.id }).sort({ createdAt: -1 }).populate('assignedAgent', 'name').populate('assignedRecycler', 'name');
    res.json({ requests });
  } catch (error) { next(error); }
}

async function getOne(req, res, next) {
  try {
    const request = await WasteRequest.findById(req.params.id).select('+pickupOtpHash').populate('user', 'name email').populate('assignedAgent', 'name email').populate('assignedRecycler', 'name email');
    if (!request) return res.status(404).json({ error: 'Waste request not found.' });
    if (req.user.role === 'user' && String(request.user._id) !== req.user.id) return res.status(403).json({ error: 'You cannot view this request.' });
    if (req.user.role === 'agent' && String(request.assignedAgent?._id) !== req.user.id) return res.status(403).json({ error: 'This request is not assigned to you.' });
    if (req.user.role === 'recycler' && String(request.assignedRecycler?._id) !== req.user.id) return res.status(403).json({ error: 'This request is not assigned to you.' });
    request.pickupOtpHash = undefined;
    res.json({ request });
  } catch (error) { next(error); }
}

async function photo(req, res, next) {
  try {
    const request = await WasteRequest.findById(req.params.id).select('user assignedAgent assignedRecycler photoPath');
    if (!request || !request.photoPath) return res.status(404).json({ error: 'Request photo not found.' });
    const isOwner = req.user.role === 'user' && String(request.user) === req.user.id;
    const isAssignedStaff = (req.user.role === 'agent' && String(request.assignedAgent) === req.user.id)
      || (req.user.role === 'recycler' && String(request.assignedRecycler) === req.user.id);
    if (req.user.role !== 'admin' && !isOwner && !isAssignedStaff) return res.status(404).json({ error: 'Request photo not found.' });
    const directory = path.resolve(process.env.UPLOAD_DIR || 'uploads');
    const file = path.resolve(directory, path.basename(request.photoPath));
    if (!file.startsWith(`${directory}${path.sep}`)) return res.status(404).json({ error: 'Request photo not found.' });
    res.sendFile(file, error => { if (error && !res.headersSent) next(error); });
  } catch (error) { next(error); }
}

async function listAll(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {};
    if (req.query.status && ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'RECEIVED', 'RECYCLED'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.search) filter.$or = [
      { requestId: new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { deviceName: new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    ];
    const [requests, total] = await Promise.all([
      WasteRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email walletAddress').populate('assignedAgent', 'name email').populate('assignedRecycler', 'name email'),
      WasteRequest.countDocuments(filter)
    ]);
    res.json({ requests, page, pages: Math.ceil(total / limit), total });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    const { assignedAgent, assignedRecycler, preferredDate } = req.body;
    const request = await WasteRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Waste request not found.' });
    if (assignedAgent !== undefined) {
      const agent = await User.findOne({ _id: assignedAgent, role: 'agent', active: true });
      if (!agent) return res.status(400).json({ error: 'Choose an active collection agent.' });
      if (request.status !== 'REQUESTED' && request.status !== 'ASSIGNED') return res.status(409).json({ error: 'An agent can only be assigned before collection.' });
      request.assignedAgent = agent.id;
      request.status = 'ASSIGNED';
      await Collection.findOneAndUpdate({ request: request.id }, { request: request.id, agent: agent.id, status: 'ASSIGNED', assignedAt: new Date(), verifiedAt: null }, { upsert: true, new: true, runValidators: true });
    }
    if (assignedRecycler !== undefined) {
      if (request.status === 'RECYCLED') return res.status(409).json({ error: 'A recycler cannot be assigned after recycling is complete.' });
      const recycler = await User.findOne({ _id: assignedRecycler, role: 'recycler', active: true });
      if (!recycler) return res.status(400).json({ error: 'Choose an active authorized recycler.' });
      request.assignedRecycler = recycler.id;
    }
    if (preferredDate !== undefined) {
      const date = new Date(preferredDate);
      if (Number.isNaN(date.getTime()) || date < new Date()) return res.status(400).json({ error: 'Choose a future collection date.' });
      request.preferredDate = date;
    }
    await request.save();
    res.json({ request: safeRequest(request) });
  } catch (error) { next(error); }
}

module.exports = { create, mine, getOne, photo, listAll, update };
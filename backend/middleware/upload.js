const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, uploadDirectory),
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${extensions[file.mimetype] || '.bin'}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (allowedTypes.has(file.mimetype)) return callback(null, true);
    const error = new Error('Photo must be a JPEG, PNG, or WebP image.');
    error.statusCode = 400;
    callback(error);
  }
});

module.exports = upload;
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = express.Router();
const CHUNKS_DIR = path.resolve(process.env.CHUNKS_DIR || './uploads/chunks');
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

const chunkUpload = multer({ storage: multer.memoryStorage() });

// POST /api/photos/upload-chunk
// Fields: fileId, chunkIndex, totalChunks, chunk (file)
router.post('/upload-chunk', chunkUpload.single('chunk'), async (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks } = req.body;
    if (!fileId || chunkIndex == null || !req.file) {
      return res.status(400).json({ error: 'Missing fileId, chunkIndex, or chunk' });
    }
    const chunkPath = path.join(CHUNKS_DIR, `${fileId}.${chunkIndex}`);
    fs.writeFileSync(chunkPath, req.file.buffer);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/photos/assemble-chunks
// Fields: fileId, totalChunks, fileName, albumId, ...
router.post('/assemble-chunks', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { fileId, totalChunks, fileName, albumId, mimetype } = req.body;
    if (!fileId || !totalChunks || !fileName || !albumId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const buffers = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(CHUNKS_DIR, `${fileId}.${i}`);
      if (!fs.existsSync(chunkPath)) {
        return res.status(400).json({ error: `Missing chunk ${i}` });
      }
      buffers.push(fs.readFileSync(chunkPath));
    }
    const fileBuffer = Buffer.concat(buffers);
    // Clean up chunks
    for (let i = 0; i < totalChunks; i++) {
      fs.unlinkSync(path.join(CHUNKS_DIR, `${fileId}.${i}`));
    }
    // TODO: Insert into your normal upload pipeline here (e.g., uploadImageBufferToAzure, DB, etc.)
    // For now, just return size
    return res.status(201).json({ ok: true, fileName, size: fileBuffer.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

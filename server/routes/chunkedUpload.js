
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';
import mssql from '../mssql.cjs';
import { extractImageMetadata } from '../utils/exif.mjs';
import { computeImageSignature } from '../utils/imageSignature.js';

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
    const { fileId, totalChunks, fileName, albumId, mimetype, description = '', metadata = {} } = req.body;
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

    // Upload to Azure
    const blobName = `${albumId}/${Date.now()}_${fileName}`;
    const photoBlobPath = await uploadImageBufferToAzure(fileBuffer, blobName, mimetype || 'application/octet-stream');

    // Extract metadata
    let extractedMetadata = {};
    try {
      extractedMetadata = await extractImageMetadata(fileBuffer);
    } catch (e) {
      extractedMetadata = {};
    }
    const mergedMetadata = { ...extractedMetadata, ...metadata };
    const width = mergedMetadata.width || null;
    const height = mergedMetadata.height || null;

    // Compute image signature (optional, for deduplication/tagging)
    let signatureHash = null;
    try {
      signatureHash = await computeImageSignature(fileBuffer);
    } catch {}

    // Insert photo into DB
    const { queryRow } = mssql;
    const result = await queryRow(`
      INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, width, height, file_size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, album_id as "albumId", file_name as "fileName", thumbnail_url as "thumbnailUrl", full_image_url as "fullImageUrl", description, metadata, width, height
    `, [
      albumId,
      fileName,
      photoBlobPath,
      photoBlobPath,
      description,
      Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : null,
      width,
      height,
      fileBuffer.length
    ]);
    // ...existing code...

    return res.status(201).json({
      ...result,
      metadata: mergedMetadata,
      signatureHash,
      url: photoUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

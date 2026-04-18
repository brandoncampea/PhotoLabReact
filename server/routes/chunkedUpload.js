
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
    // Extract player name/number from filename if not provided
    let playerName = req.body.playerName;
    let playerNumber = req.body.playerNumber;
    if (!playerName || !playerNumber) {
      const base = fileName ? fileName.replace(/\.[^.]+$/, '') : '';
      const match = base.match(/([A-Za-z]+[ _-]?[A-Za-z]+)[ _-]?([0-9]{1,3})?$/);
      if (match) {
        if (!playerName) playerName = match[1].replace(/[_-]/g, ' ').trim();
        if (!playerNumber && match[2]) playerNumber = match[2];
      }
    }
    // Add player to roster if not present
    let studioId = null;
    const album = await mssql.queryRow('SELECT studio_id FROM albums WHERE id = $1', [albumId]);
    if (album && album.studio_id && playerName) {
      studioId = album.studio_id;
      const existing = await mssql.queryRow(
        `SELECT id FROM studio_player_roster WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2) AND COALESCE(LOWER(player_number), '') = COALESCE(LOWER($3), '')`,
        [studioId, playerName, playerNumber || null]
      );
      if (!existing) {
        await mssql.query(
          `INSERT INTO studio_player_roster (studio_id, player_name, player_number, roster_name, source_album_id) VALUES ($1, $2, $3, NULL, $4)`,
          [studioId, playerName, playerNumber || null, albumId]
        );
      }
    }
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


    // Upload original image to Azure
    // Remove spaces from filename
    const safeFileName = fileName.replace(/\s+/g, '_');
    const blobName = `${albumId}/${Date.now()}_${safeFileName}`;
    // Store only the blob path (relative to container)
    const photoBlobPath = await uploadImageBufferToAzure(fileBuffer, blobName, mimetype || 'application/octet-stream');

    // Generate thumbnail (max 400px width/height, JPEG)
    let thumbnailBuffer;
    try {
      const sharp = (await import('sharp')).default;
      thumbnailBuffer = await sharp(fileBuffer)
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (err) {
      // ...existing code...
      thumbnailBuffer = fileBuffer; // fallback to original if sharp fails
    }

    // Upload thumbnail to Azure
    const thumbBlobName = `${albumId}/thumb_${Date.now()}_${safeFileName.replace(/\.[^.]+$/, '.jpg')}`;
    // Store only the blob path (relative to container)
    const thumbnailBlobPath = await uploadImageBufferToAzure(thumbnailBuffer, thumbBlobName, 'image/jpeg');

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

    // Insert photo into DB with thumbnail
    const { queryRow } = mssql;
    // Ensure only the blob path is stored (not a signed URL)
    const result = await mssql.queryRow(`
      INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, width, height, file_size_bytes, player_names, player_numbers)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, album_id as "albumId", file_name as "fileName", thumbnail_url as "thumbnailUrl", full_image_url as "fullImageUrl", description, metadata, width, height
    `, [
      albumId,
      fileName,
      thumbnailBlobPath, // e.g. albums/68/thumb_{timestamp}_MORIA_ST_JOHN_77.jpg
      photoBlobPath,     // e.g. albums/68/{timestamp}_MORIA_ST_JOHN_77.jpg
      description,
      Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : null,
      width,
      height,
      fileBuffer.length,
      playerName || null,
      playerNumber || null
    ]);

    return res.status(201).json({
      ...result,
      metadata: mergedMetadata,
      signatureHash,
      url: photoBlobPath,
      thumbnailUrl: thumbnailBlobPath,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

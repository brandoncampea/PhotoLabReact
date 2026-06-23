
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';
import mssql from '../mssql.cjs';
import { extractImageMetadata } from '../utils/exif.mjs';
import { computeImageSignature } from '../utils/imageSignature.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();
const CHUNKS_DIR = path.resolve(process.env.CHUNKS_DIR || './uploads/chunks');
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

const chunkUpload = multer({ storage: multer.memoryStorage() });

const SAFE_FILE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/tiff']);

// POST /api/photos/upload-chunk
// Fields: fileId, chunkIndex, totalChunks, chunk (file)
router.post('/upload-chunk', authRequired, chunkUpload.single('chunk'), async (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks } = req.body;
    if (!fileId || chunkIndex == null || !req.file) {
      return res.status(400).json({ error: 'Missing fileId, chunkIndex, or chunk' });
    }
    if (!SAFE_FILE_ID.test(fileId)) {
      return res.status(400).json({ error: 'Invalid fileId' });
    }
    const chunkPath = path.join(CHUNKS_DIR, `${fileId}.${chunkIndex}`);
    await fs.promises.writeFile(chunkPath, req.file.buffer);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/photos/assemble-chunks
// Fields: fileId, totalChunks, fileName, albumId, ...
router.post('/assemble-chunks', authRequired, express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { fileId, totalChunks, fileName, albumId, mimetype, description = '', metadata = {} } = req.body;
    if (fileId && !SAFE_FILE_ID.test(fileId)) {
      return res.status(400).json({ error: 'Invalid fileId' });
    }
    if (mimetype && !ALLOWED_MIMETYPES.has(mimetype)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
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
    // Read all chunks in parallel and verify they all exist first
    const chunkPaths = Array.from({ length: totalChunks }, (_, i) => path.join(CHUNKS_DIR, `${fileId}.${i}`));
    for (let i = 0; i < totalChunks; i++) {
      if (!fs.existsSync(chunkPaths[i])) {
        return res.status(400).json({ error: `Missing chunk ${i}` });
      }
    }
    const buffers = await Promise.all(chunkPaths.map(p => fs.promises.readFile(p)));
    const fileBuffer = Buffer.concat(buffers);
    // Clean up chunks in parallel (fire-and-forget, don't block response)
    Promise.all(chunkPaths.map(p => fs.promises.unlink(p))).catch(() => {});

    // Prepare blob names
    const safeFileName = fileName.replace(/\s+/g, '_');
    const ts = Date.now();
    const blobName = `${albumId}/${ts}_${safeFileName}`;
    const thumbBlobName = `${albumId}/thumb_${ts}_${safeFileName.replace(/\.[^.]+$/, '.jpg')}`;
    const safeMimetype = (mimetype && ALLOWED_MIMETYPES.has(mimetype)) ? mimetype : 'image/jpeg';

    // Generate thumbnail while uploading full image in parallel
    let thumbnailBuffer;
    try {
      const sharp = (await import('sharp')).default;
      thumbnailBuffer = await sharp(fileBuffer)
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      thumbnailBuffer = fileBuffer;
    }

    // Upload full image and thumbnail to Azure in parallel
    const [photoBlobPath, thumbnailBlobPath] = await Promise.all([
      uploadImageBufferToAzure(fileBuffer, blobName, safeMimetype, 'Cool'),
      uploadImageBufferToAzure(thumbnailBuffer, thumbBlobName, 'image/jpeg', 'Hot'),
    ]);

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
    const { queryRow, query } = mssql;
    // Ensure only the blob path is stored (not a signed URL)
    const result = await queryRow(`
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

    // Update album's photo_count asynchronously — don't block the response
    query(
      'UPDATE albums SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1) WHERE id = $1',
      [albumId]
    ).catch(() => {});

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

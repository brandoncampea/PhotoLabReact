import express from 'express';
const router = express.Router();


// Clear all player tags and face signatures for all photos in an album
router.post('/album/:albumId/clear-tags', async (req, res) => {
  try {
    const albumId = Number(req.params.albumId);
    if (!Number.isInteger(albumId) || albumId <= 0) {
      return res.status(400).json({ error: 'Invalid album id' });
    }

    // Get all photos in the album
    const photos = await queryRows('SELECT id FROM photos WHERE album_id = $1', [albumId]);
    if (!photos.length) {
      return res.json({ cleared: 0 });
    }

    // Clear player tags for all photos
    await query('UPDATE photos SET player_names = NULL, player_numbers = NULL WHERE album_id = $1', [albumId]);

    // Remove face signatures for all photos in the album by joining with photos table (MSSQL compatible)
    try {
      console.log('[CLEAR-TAGS] Deleting studio_player_face_signatures for albumId:', albumId);
      await query(
        `DELETE sfs
         FROM studio_player_face_signatures sfs
         INNER JOIN photos p ON sfs.source_photo_id = p.id
         WHERE p.album_id = @p1`,
        [albumId]
      );
    } catch (err) {
      console.error('[CLEAR-TAGS] Error deleting from studio_player_face_signatures:', err.message);
      // Continue even if this fails (table/column may not exist in all environments)
    }

    res.json({ cleared: photos.length });
  } catch (error) {
    console.error('Error in clear-tags:', error);
    res.status(500).json({ error: error.message, details: error });
  }
});
// Batch update player names for multiple photos
router.post('/batch-update-players', async (req, res) => {
  try {
    await ensurePhotoUploadColumns();
    const { updates } = req.body; // [{ id, playerNames }]
    console.log('[BATCH UPDATE] Received updates:', JSON.stringify(updates, null, 2));
    if (!Array.isArray(updates) || updates.length === 0) {
      console.log('[BATCH UPDATE] No updates provided');
      return res.status(400).json({ error: 'No updates provided' });
    }
    let updatedCount = 0;
    for (const { id, playerNames } of updates) {
      if (!id || !playerNames) {
        console.log(`[BATCH UPDATE] Skipping update: id=${id}, playerNames=${playerNames}`);
        continue;
      }
      // Update photo player_names
      await query(
        `UPDATE photos SET player_names = $1 WHERE id = $2`,
        [Array.isArray(playerNames) ? playerNames.join(',') : playerNames, id]
      );
      console.log(`[BATCH UPDATE] Updated photo id=${id} with playerNames=${playerNames}`);
      updatedCount++;

      // Fetch album and studio for this photo
      const photo = await queryRow('SELECT album_id FROM photos WHERE id = $1', [id]);
      if (!photo || !photo.album_id) {
        console.log(`[BATCH UPDATE] Could not find album for photo id=${id}`);
        continue;
      }
      const album = await queryRow('SELECT studio_id FROM albums WHERE id = $1', [photo.album_id]);
      if (!album || !album.studio_id) {
        console.log(`[BATCH UPDATE] Could not find studio for album id=${photo.album_id}`);
        continue;
      }
      const studioId = album.studio_id;
      // For each player name, add to roster and face signatures if not present
      const playerList = Array.isArray(playerNames) ? playerNames : (typeof playerNames === 'string' ? playerNames.split(',') : []);
      for (const playerNameRaw of playerList) {
        const playerName = playerNameRaw.trim();
        if (!playerName) continue;
        // Check if player already exists in roster
        const existing = await queryRow(
          `SELECT id FROM studio_player_roster WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2)`,
          [studioId, playerName]
        );
        if (!existing) {
          await query(
            `INSERT INTO studio_player_roster (studio_id, player_name, player_number, roster_name, source_album_id) VALUES ($1, $2, NULL, NULL, $3)`,
            [studioId, playerName, photo.album_id]
          );
          console.log(`[BATCH UPDATE] Added player '${playerName}' to roster for studio ${studioId}`);
        }

        // Only add to face signatures if a real face signature is available
        // Assume the real face signature (hash or vector) would be provided in the batch update payload as playerSignatures: { [playerName]: signatureHash }
        // (You may need to update the frontend to send this if not already)
        if (updates.playerSignatures && updates.playerSignatures[playerName]) {
          const signatureHash = updates.playerSignatures[playerName];
          if (signatureHash) {
            const faceSigExists = await queryRow(
              `SELECT id FROM studio_player_face_signatures WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2)`,
              [studioId, playerName]
            );
            if (!faceSigExists) {
              await query(
                `INSERT INTO studio_player_face_signatures (studio_id, player_name, player_number, signature_hash, source_photo_id) VALUES ($1, $2, NULL, $3, $4)`,
                [studioId, playerName, signatureHash, id]
              );
              console.log(`[BATCH UPDATE] Added face signature for '${playerName}' in studio ${studioId} from photo ${id}`);
            }
          }
        }
      }
    }
    console.log(`[BATCH UPDATE] Total updated: ${updatedCount}`);
    res.json({ updated: updatedCount });
  } catch (error) {
    console.error('[BATCH UPDATE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
import multer from 'multer';
import path from 'path';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import csv from 'csv-parser';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { createWorker } from 'tesseract.js';
import { uploadImageBufferToAzure, deleteBlobByUrl, downloadBlob, getSignedReadUrl, getBlobNameFromUrlOrName } from '../services/azureStorage.js';
import { requireActiveSubscription, enforceStorageQuotaForStudio } from '../middleware/subscription.js';
import orderReceiptService from '../services/orderReceiptService.js';
// Direct-to-Blob: Record photo metadata and blob URL after upload
router.post('/record-blob', requireActiveSubscription, async (req, res) => {
  try {
    await ensurePhotoUploadColumns();
    const { albumId, fileName, blobUrl, description, metadata, width, height, fileSizeBytes } = req.body;
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
    let studioId = null;
    const album = await queryRow('SELECT studio_id FROM albums WHERE id = $1', [albumId]);
    if (album && album.studio_id && playerName) {
      studioId = album.studio_id;
      const existing = await queryRow(
        `SELECT id FROM studio_player_roster WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2) AND COALESCE(LOWER(player_number), '') = COALESCE(LOWER($3), '')`,
        [studioId, playerName, playerNumber || null]
      );
      if (!existing) {
        await query(
          `INSERT INTO studio_player_roster (studio_id, player_name, player_number, roster_name, source_album_id) VALUES ($1, $2, $3, NULL, $4)`,
          [studioId, playerName, playerNumber || null, albumId]
        );
      }
    }
    if (!albumId || !fileName || !blobUrl) {
      console.error('[RECORD-BLOB] Missing required fields:', { albumId, fileName, blobUrl });
      return res.status(400).json({ error: 'Missing required fields: albumId, fileName, blobUrl' });
    }

    // --- EXIF extraction for direct-to-blob uploads ---
    let mergedMetadata = metadata || {};
    let fileBuffer = null;
    try {
      // Download the blob from Azure to get the file buffer, with retry logic
      const maxAttempts = 5;
      const delayMs = 1000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          fileBuffer = await downloadBlob(blobUrl, 'buffer');
          if (fileBuffer && fileBuffer.length > 0) {
            console.log(`[RECORD-BLOB] Successfully downloaded fileBuffer for EXIF extraction, size: ${fileBuffer.length}`);
            break;
          } else {
            console.warn(`[RECORD-BLOB] Attempt ${attempt}: fileBuffer empty or invalid for blobUrl: ${blobUrl}`);
          }
        } catch (err) {
          console.error(`[RECORD-BLOB] Attempt ${attempt}: Error downloading blob for EXIF extraction:`, err);
        }
        if (attempt < maxAttempts) {
          await new Promise(res => setTimeout(res, delayMs));
        }
      }
      if (fileBuffer && fileBuffer.length > 0) {
        const extractedMetadata = await import('../utils/exif.mjs').then(m => m.extractImageMetadata(fileBuffer));
        console.log('[RECORD-BLOB] Extracted EXIF metadata:', extractedMetadata);
        mergedMetadata = { ...extractedMetadata, ...metadata };
      } else {
        console.warn('[RECORD-BLOB] No fileBuffer available for EXIF extraction after retries. Skipping EXIF extraction.');
      }
    } catch (err) {
      console.error('[RECORD-BLOB] Error during EXIF extraction:', err);
      mergedMetadata = metadata || {};
    }


    // --- Generate and upload thumbnail ---
    // Always sanitize file names for blobs (replace spaces with underscores)
    const safeFileName = fileName.replace(/\s+/g, '_');
    let thumbnailBlobPath = null;
    if (typeof fileBuffer !== 'undefined' && fileBuffer && fileBuffer.length > 0) {
      try {
        // Generate thumbnail (max 400px wide, JPEG)
        const thumbBuffer = await sharp(fileBuffer)
          .resize({ width: 400, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        // Compose thumbnail blob name in album folder (always albums/{albumId}/...)
        const thumbName = `albums/${albumId}/thumb_${safeFileName.replace(/\.[^.]+$/, '.jpg')}`;
        // Removed debug logging
        // Upload thumbnail to Azure (returns blob path)
        thumbnailBlobPath = await uploadImageBufferToAzure(thumbBuffer, thumbName, 'image/jpeg');
        // Removed debug logging
      } catch (err) {
        // Removed debug logging
        thumbnailBlobPath = null;
      }
    } else {
      // Removed debug logging
    }

    // Always store only blob paths in DB
    // file_name: just the base file name (e.g., MORIA_ST_JOHN_74_MM.jpg)
    // thumbnail_url: albums/{albumId}/thumb_...
    // full_image_url: albums/{albumId}/safeFileName
    let fileBlobPath = typeof blobUrl === 'string' && blobUrl.startsWith('albums/')
      ? blobUrl
      : (typeof blobUrl === 'string' ? getBlobNameFromUrlOrName(blobUrl) : blobUrl);
    if (typeof fileBlobPath === 'string' && !fileBlobPath.startsWith('albums/')) {
      fileBlobPath = `albums/${albumId}/${safeFileName}`;
    }
    const thumbBlobPath = thumbnailBlobPath || fileBlobPath; // fallback to full image blob path if thumb failed or fileBuffer is undefined

    // Only store the base file name in the DB
    const baseFileName = safeFileName;

    // Prevent duplicate photo insert (album_id + file_name)
    const existingPhoto = await queryRow(
      `SELECT id FROM photos WHERE album_id = $1 AND file_name = $2`,
      [albumId, baseFileName]
    );
    if (existingPhoto) {
      // Return the existing photo record
      const photoRecord = await queryRow(`
        SELECT 
          id, album_id as albumId, file_name as fileName, 
          thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl,
          description, metadata, player_names as playerNames, player_numbers as playerNumbers,
          width, height, created_at as createdDate
        FROM photos 
        WHERE id = $1
      `, [existingPhoto.id]);
      // Add baseFileName for UI display
      return res.status(200).json({ ...signPhotoForResponse(photoRecord), fileName: baseFileName });
    }

    // Log all variables before DB insert
    // Removed debug logging
    let result;
    try {
      console.log('[RECORD-BLOB] Inserting photo with mergedMetadata:', mergedMetadata);
      result = await queryRow(`
        INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, width, height, file_size_bytes, player_names, player_numbers)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        albumId,
        baseFileName,
        thumbBlobPath,
        `albums/${albumId}/${safeFileName}`,
        description || '',
        Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : null,
        width || null,
        height || null,
        fileSizeBytes || null,
        playerName || null,
        playerNumber || null,
      ]);
    } catch (err) {
      console.error('[RECORD-BLOB] DB insert error:', err && err.stack ? err.stack : err);
      try {
        console.error('[RECORD-BLOB] Insert variables:', {
          albumId, baseFileName, thumbBlobPath, safeFileName, description, mergedMetadata, width, height, fileSizeBytes, playerName, playerNumber
        });
      } catch (jsonErr) {
        console.error('[RECORD-BLOB] Error stringifying insert variables:', jsonErr);
      }
      return res.status(500).json({ error: 'DB insert error', details: err.message, stack: err.stack });
    }
    try {
      await query(`
        UPDATE albums 
        SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
        WHERE id = $1
      `, [albumId]);
    } catch (err) {
      // Not fatal for upload, continue
    }
    // Fetch the full photo record and return it in the response
    let photoRecord = null;
    try {
      photoRecord = await queryRow(`
        SELECT 
          id, album_id as albumId, file_name as fileName, 
          thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl,
          description, metadata, player_names as playerNames, player_numbers as playerNumbers,
          width, height, created_at as createdDate
        FROM photos 
        WHERE id = $1
      `, [result.id]);
    } catch (err) {
      // Removed debug logging
    }
    if (photoRecord) {
      // Use the same response shape as other photo endpoints
      // Add baseFileName for UI display
      res.status(200).json({ success: true, ...signPhotoForResponse(photoRecord), fileName: baseFileName });
    } else {
      res.status(200).json({ success: true, id: result.id, fileName: baseFileName });
    }
  } catch (error) {
    console.error('[RECORD-BLOB] Unhandled error:', error && error.stack ? error.stack : error);
    try {
      console.error('[RECORD-BLOB] Request body:', JSON.stringify(req.body));
    } catch (jsonErr) {
      console.error('[RECORD-BLOB] Error stringifying request body:', jsonErr);
    }
    res.status(500).json({ error: error.message });
  }
});

const getPhotoAssetUrl = (photoId, variant = 'full') => `/api/photos/${photoId}/asset?variant=${variant}`;
const getProxySourceUrl = (source) => `/api/photos/proxy?source=${encodeURIComponent(source)}`;

import { signPhotoForResponse } from './photos.utils.js';

// (duplicate import removed)

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);
    const allowedMimePrefixes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const extname = path.extname(file.originalname).toLowerCase();
    const mimetype = (file.mimetype || '').toLowerCase();

    const extAllowed = allowedExts.has(extname);
    const mimeAllowed = allowedMimePrefixes.some((t) => mimetype.startsWith(t));

    if (extAllowed || mimeAllowed) {
      return cb(null, true);
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'photos'));
  }
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB CSV limit
  fileFilter: (req, file, cb) => {
    const extname = path.extname(file.originalname).toLowerCase();
    const isCsvMime = file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel';
    if (extname === '.csv' || isCsvMime) {
      return cb(null, true);
    }
    cb(new Error('Only CSV files are allowed'));
  }
});

import { ensurePlayerRecognitionSchema } from './photos.utils.js';

import { ensurePhotoUploadColumns } from './photos.utils.js';

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const normalizeHeaderKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const getFieldFromRow = (row, aliases = []) => {
  if (!row || typeof row !== 'object') return '';
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  for (const [key, value] of Object.entries(row)) {
    if (!normalizedAliases.includes(normalizeHeaderKey(key))) continue;
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const parsePlayerRosterRows = (rows = []) => {
  const parsed = [];
  for (const row of rows) {
    const fileName = getFieldFromRow(row, [
      'file_name',
      'fileName',
      'filename',
      'File Name',
      'file name',
    ]);

    const directPlayerName = getFieldFromRow(row, [
      'player_name',
      'playerName',
      'Player Name',
      'name',
      'player',
      'full_name',
      'fullname',
      'firstName',
      'firstname',
      'first',
      'given_name',
      'givenname',
      'First Name',
      'Firstname',
    ]);

    const lastName = getFieldFromRow(row, [
      'last_name',
      'lastName',
      'lastname',
      'last',
      'surname',
      'family_name',
      'familyname',
      'Last Name',
      'Lastname',
    ]);

    const playerName =
      directPlayerName
      || [firstName, lastName].filter(Boolean).join(' ').trim()
      || [lastName, firstName].filter(Boolean).join(' ').trim();

    const playerNumber = getFieldFromRow(row, [
      'player_number',
      'playerNumber',
      'number',
      'Player Number',
      'jersey',
      'jerseynumber',
      'uniformnumber',
      'bib',
    ]);

    if (!fileName && !playerName && !playerNumber) continue;
    parsed.push({ fileName, playerName, playerNumber });
  }
  return parsed;
};

const parseCsvRowsFromBuffer = async (buffer) => {
  if (!buffer) return [];
  const stream = await import('node:stream');
  const rows = [];
  await new Promise((resolve, reject) => {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });
  return parsePlayerRosterRows(rows);
};

const computeImageSignature = async (buffer) => {
  if (!buffer) return null;
  const resized = await sharp(buffer)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  const bits = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = resized[y * 9 + x];
      const right = resized[y * 9 + x + 1];
      bits.push(left > right ? '1' : '0');
    }
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4).join(''), 2).toString(16);
  }
  return hex;
};

const computeImageCandidateSignatures = async (buffer) => {
  if (!buffer) return [];

  try {
    const metadata = await sharp(buffer).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);

    const regions = [{ left: 0, top: 0, width, height }];

    if (width > 0 && height > 0) {
      const upperHeight = Math.max(1, Math.round(height * 0.6));
      const centerWidth = Math.max(1, Math.round(width * 0.5));
      const centerHeight = Math.max(1, Math.round(height * 0.5));
      const centerLeft = Math.max(0, Math.round((width - centerWidth) / 2));
      const centerTop = Math.max(0, Math.round((height - centerHeight) / 2));
      const upperLeft = Math.max(0, Math.round(width * 0.15));
      const upperWidth = Math.max(1, Math.round(width * 0.7));

      regions.push(
        { left: centerLeft, top: centerTop, width: centerWidth, height: centerHeight },
        { left: upperLeft, top: 0, width: upperWidth, height: upperHeight },
        { left: 0, top: 0, width: Math.max(1, Math.round(width * 0.5)), height: upperHeight },
        { left: Math.max(0, width - Math.max(1, Math.round(width * 0.5))), top: 0, width: Math.max(1, Math.round(width * 0.5)), height: upperHeight },
      );
    }

    const signatures = [];
    const seen = new Set();

    for (const region of regions) {
      let regionBuffer = buffer;
      if (region.width !== width || region.height !== height || region.left !== 0 || region.top !== 0) {
        regionBuffer = await sharp(buffer)
          .extract(region)
          .toBuffer();
      }

      const signature = await computeImageSignature(regionBuffer);
      if (!signature || seen.has(signature)) continue;
      seen.add(signature);
      signatures.push(signature);
    }

    return signatures;
  } catch {
    const fallback = await computeImageSignature(buffer);
    return fallback ? [fallback] : [];
  }
};

const popCountLookup = [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];

const hammingHexDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number.parseInt(a[i], 16);
    const bv = Number.parseInt(b[i], 16);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return Number.POSITIVE_INFINITY;
    distance += popCountLookup[(av ^ bv) & 15];
  }
  return distance;
};

const buildRosterNameFromAlbum = (album) => {
  const category = String(album?.category || '').trim();
  const albumName = String(album?.albumName || album?.name || album?.title || '').trim();
  if (category && albumName) return `${category} - ${albumName}`;
  return albumName || category || 'Roster';
};

const saveRosterPlayers = async (studioId, rosterRows = [], options = {}) => {
  if (!studioId || !rosterRows.length) return 0;
  const rosterName = String(options?.rosterName || '').trim() || null;
  const sourceAlbumId = Number(options?.sourceAlbumId || 0) || null;
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rosterRows) {
    const playerName = String(row.playerName || '').trim();
    if (!playerName) continue;
    const playerNumber = String(row.playerNumber || '').trim();
    const key = `${normalizeToken(playerName)}|${normalizeToken(playerNumber)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push({ playerName, playerNumber });
  }

  let saved = 0;
  for (const row of uniqueRows) {
    const existing = await queryRow(
      `SELECT TOP 1 id
       FROM studio_player_roster
       WHERE studio_id = $1
         AND LOWER(player_name) = LOWER($2)
         AND COALESCE(LOWER(player_number), '') = COALESCE(LOWER($3), '')`,
      [studioId, row.playerName, row.playerNumber || null]
    );

    if (existing?.id) {
      await query(
        `UPDATE studio_player_roster
         SET updated_at = CURRENT_TIMESTAMP,
             roster_name = COALESCE($1, roster_name),
             source_album_id = COALESCE($2, source_album_id)
         WHERE id = $3`,
        [rosterName, sourceAlbumId, existing.id]
      );
      continue;
    }

    await query(
      `INSERT INTO studio_player_roster (studio_id, player_name, player_number, roster_name, source_album_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [studioId, row.playerName, row.playerNumber || null, rosterName, sourceAlbumId]
    );
    // --- Connect pending watch requests for this player name (case-insensitive, trimmed) ---
    const pendingWatches = await queryRows(
      `SELECT id, user_id FROM customer_player_watchlist
       WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2)`,
      [studioId, row.playerName.trim()]
    );
    for (const watch of pendingWatches) {
      // TODO: Trigger notification logic here (email, in-app, etc.)
      // Example: await notifyUserPlayerNowExists(watch.user_id, row.playerName, studioId);
      // For now, just log:
      console.log(`[Watchlist] User ${watch.user_id} is now watching new player '${row.playerName}' in studio ${studioId}`);
    }
    saved += 1;
  }

  return saved;
};

import { fetchStudioRoster } from './photos.utils.js';

const fetchStudioFaceSignatures = async (studioId) => {
  if (!studioId) return [];
  return queryRows(
    `SELECT id,
            player_name as playerName,
            player_number as playerNumber,
            signature_hash as signatureHash
     FROM studio_player_face_signatures
     WHERE studio_id = $1`,
    [studioId]
  );
};

const saveFaceSignature = async ({ studioId, playerName, playerNumber, signatureHash, sourcePhotoId }) => {
  if (!studioId || !playerName || !signatureHash) return;

  const existing = await queryRow(
    `SELECT TOP 1 id
     FROM studio_player_face_signatures
     WHERE studio_id = $1
       AND LOWER(player_name) = LOWER($2)
       AND COALESCE(LOWER(player_number), '') = COALESCE(LOWER($3), '')
       AND signature_hash = $4`,
    [studioId, playerName, playerNumber || null, signatureHash]
  );

  if (existing?.id) return;

  await query(
    `INSERT INTO studio_player_face_signatures (studio_id, player_name, player_number, signature_hash, source_photo_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [studioId, playerName, playerNumber || null, signatureHash, sourcePhotoId || null]
  );
};

const parseMetadataObject = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const extractFaceTagsFromMetadata = (metadataValue) => {
  const metadata = parseMetadataObject(metadataValue);
  const faceTags = Array.isArray(metadata?.faceTags) ? metadata.faceTags : [];

  return faceTags
    .map((tag, index) => ({
      id: String(tag?.id || `face-${index + 1}`),
      leftPct: Number(tag?.leftPct),
      topPct: Number(tag?.topPct),
      widthPct: Number(tag?.widthPct),
      heightPct: Number(tag?.heightPct),
      playerName: String(tag?.playerName || '').trim() || null,
      playerNumber: String(tag?.playerNumber || '').trim() || null,
    }))
    .filter((tag) => (
      Number.isFinite(tag.leftPct)
      && Number.isFinite(tag.topPct)
      && Number.isFinite(tag.widthPct)
      && Number.isFinite(tag.heightPct)
      && tag.widthPct > 0
      && tag.heightPct > 0
    ));
};

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const cropBufferFromFaceTag = async (imageBuffer, faceTag) => {
  if (!imageBuffer || !faceTag) return null;

  try {
    const image = sharp(imageBuffer);
    const meta = await image.metadata();
    const imageWidth = Number(meta.width || 0);
    const imageHeight = Number(meta.height || 0);
    if (!imageWidth || !imageHeight) return null;

    const leftPct = clampPercent(faceTag.leftPct);
    const topPct = clampPercent(faceTag.topPct);
    const widthPct = clampPercent(faceTag.widthPct);
    const heightPct = clampPercent(faceTag.heightPct);
    if (!widthPct || !heightPct) return null;

    const baseLeft = Math.round((leftPct / 100) * imageWidth);
    const baseTop = Math.round((topPct / 100) * imageHeight);
    const baseWidth = Math.max(1, Math.round((widthPct / 100) * imageWidth));
    const baseHeight = Math.max(1, Math.round((heightPct / 100) * imageHeight));

    const padX = Math.round(baseWidth * 0.18);
    const padY = Math.round(baseHeight * 0.18);

    const left = Math.max(0, baseLeft - padX);
    const top = Math.max(0, baseTop - padY);
    const width = Math.max(1, Math.min(imageWidth - left, baseWidth + (padX * 2)));
    const height = Math.max(1, Math.min(imageHeight - top, baseHeight + (padY * 2)));

    return await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .toBuffer();
  } catch {
    return null;
  }
};

const saveFaceSignaturesForPlayers = async ({ studioId, taggedNames = [], taggedNumbers = [], imageBuffer, sourcePhotoId, faceTags = [] }) => {
  if (!studioId || !imageBuffer || taggedNames.length === 0) return 0;

  const normalizedFaceTags = Array.isArray(faceTags) ? faceTags : [];
  let fallbackSignatures = null;

  let saved = 0;
  for (let i = 0; i < taggedNames.length; i += 1) {
    const playerName = String(taggedNames[i] || '').trim();
    if (!playerName) continue;
    const playerNumber = taggedNumbers[i] || taggedNumbers[0] || null;

    let signatures = [];
    const matchedFaceTag = normalizedFaceTags.find((tag) => {
      if (normalizeToken(tag.playerName) !== normalizeToken(playerName)) return false;
      if (!playerNumber) return true;
      return normalizeToken(tag.playerNumber) === normalizeToken(playerNumber);
    });

    if (matchedFaceTag) {
      const croppedFaceBuffer = await cropBufferFromFaceTag(imageBuffer, matchedFaceTag);
      signatures = croppedFaceBuffer ? await computeImageCandidateSignatures(croppedFaceBuffer) : [];
    }

    if (signatures.length === 0) {
      if (!fallbackSignatures) {
        fallbackSignatures = await computeImageCandidateSignatures(imageBuffer);
      }
      signatures = fallbackSignatures;
    }

    if (!Array.isArray(signatures) || signatures.length === 0) continue;

    for (const signatureHash of signatures) {
      const beforeSave = await queryRow(
        `SELECT TOP 1 id
         FROM studio_player_face_signatures
         WHERE studio_id = $1
           AND LOWER(player_name) = LOWER($2)
           AND COALESCE(LOWER(player_number), '') = COALESCE(LOWER($3), '')
           AND signature_hash = $4`,
        [studioId, playerName, playerNumber, signatureHash]
      );
      if (beforeSave?.id) continue;

      await saveFaceSignature({
        studioId,
        playerName,
        playerNumber,
        signatureHash,
        sourcePhotoId,
      });
      saved += 1;
    }
  }

  return saved;
};

const findBestPlayerFaceMatch = async ({ imageBuffer, signatures, allowedPlayers = [] }) => {
  if (!imageBuffer || !Array.isArray(signatures) || signatures.length === 0) {
    return { matchedPlayers: [], bestDistance: Number.POSITIVE_INFINITY };
  }

  const candidateSignatures = await computeImageCandidateSignatures(imageBuffer);
  if (candidateSignatures.length === 0) {
    return { matchedPlayers: [], bestDistance: Number.POSITIVE_INFINITY };
  }

  const allowedKeys = new Set(
    allowedPlayers.map((player) => `${normalizeToken(player.playerName)}|${normalizeToken(player.playerNumber)}`)
  );

  const bestByPlayer = new Map();
  for (const sig of signatures) {
    const playerKey = `${normalizeToken(sig.playerName)}|${normalizeToken(sig.playerNumber)}`;
    if (allowedKeys.size > 0 && !allowedKeys.has(playerKey)) continue;

    for (const candidate of candidateSignatures) {
      const distance = hammingHexDistance(candidate, sig.signatureHash);
      if (!Number.isFinite(distance) || distance > 8) continue;
      const existing = bestByPlayer.get(playerKey);
      if (!existing || distance < existing.distance) {
        bestByPlayer.set(playerKey, {
          playerName: sig.playerName,
          playerNumber: sig.playerNumber || null,
          distance,
        });
      }
    }
  }

  const matchedPlayers = Array.from(bestByPlayer.values()).sort((a, b) => a.distance - b.distance);
  return {
    matchedPlayers,
    bestDistance: matchedPlayers[0]?.distance ?? Number.POSITIVE_INFINITY,
  };
};

const resolvePlayerTagForFile = ({ fileName, rosterRows, fileNameTagMap }) => {
  const direct = fileNameTagMap.get(normalizeToken(fileName));
  if (direct) return direct;

  // Normalize: remove all non-alphanumeric chars and lowercase
  const normalizeForMatch = (str) => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const baseName = normalizeForMatch(fileName).replace(/\.[^.]+$/, '');
  const roster = Array.isArray(rosterRows) ? rosterRows : [];
  for (const row of roster) {
    const playerName = String(row.playerName || '').trim();
    const playerNumber = String(row.playerNumber || '').trim();
    if (!playerName && !playerNumber) continue;
    const nameToken = normalizeForMatch(playerName);
    const numberToken = normalizeForMatch(playerNumber);
    const nameMatch = nameToken && baseName.includes(nameToken);
    const numberMatch = numberToken && baseName.includes(numberToken);
    if (nameMatch || numberMatch) {
      return { playerName, playerNumber };
    }
  }

  return null;
};

const normalizeTextValue = (value) => {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeTextValue(entry))
      .filter(Boolean)
      .join(', ')
      .trim();
  }

  if (Buffer.isBuffer(value)) {
    const utf8 = value.toString('utf8').replace(/\u0000/g, '').trim();
    if (utf8) return utf8;
    return value.toString('utf16le').replace(/\u0000/g, '').trim();
  }

  if (typeof value === 'object') {
    if ('description' in value) return normalizeTextValue(value.description);
    if ('value' in value) return normalizeTextValue(value.value);
    return '';
  }

  return String(value).replace(/\u0000/g, '').trim();
};

const pickFirstText = (...values) => {
  for (const value of values) {
    const text = normalizeTextValue(value);
    if (text) return text;
  }
  return '';
};

const splitKeywordTokens = (value) => normalizeTextValue(value)
  .split(/[,;|\n\r]+/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const mergeKeywordValues = (...values) => {
  const tokens = [];
  const seen = new Set();
  for (const value of values) {
    for (const token of splitKeywordTokens(value)) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(token);
    }
  }
  return tokens.join(', ');
};

const parseIptcBuffer = (iptcBuffer) => {
  if (!iptcBuffer || !Buffer.isBuffer(iptcBuffer)) {
    return { keywords: [], caption: '', headline: '', city: '', stateOrProvince: '' };
  }

  const fields = {
    keywords: [],
    caption: '',
    headline: '',
    city: '',
    stateOrProvince: '',
  };

  let i = 0;
  while (i + 5 < iptcBuffer.length) {
    if (iptcBuffer[i] !== 0x1c) {
      i += 1;
      continue;
    }

    const record = iptcBuffer[i + 1];
    const dataset = iptcBuffer[i + 2];
    const length = (iptcBuffer[i + 3] << 8) | iptcBuffer[i + 4];
    const start = i + 5;
    const end = start + length;

    if (end > iptcBuffer.length) break;

    const raw = iptcBuffer.subarray(start, end);
    const value = raw.toString('utf8').replace(/\u0000/g, '').trim();

    if (record === 2 && value) {
      if (dataset === 25) fields.keywords.push(value); // 2:25 Keywords
      if (dataset === 120 && !fields.caption) fields.caption = value; // 2:120 Caption/Abstract
      if (dataset === 105 && !fields.headline) fields.headline = value; // 2:105 Headline
      if (dataset === 90 && !fields.city) fields.city = value; // 2:90 City
      if (dataset === 95 && !fields.stateOrProvince) fields.stateOrProvince = value; // 2:95 Province/State
    }

    i = end;
  }

  return fields;
};

const extractXmpTag = (xmpText, tagName) => {
  if (!xmpText) return '';
  const directTagRegex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const direct = xmpText.match(directTagRegex)?.[1];
  if (direct) {
    const liMatches = [...direct.matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi)]
      .map((match) => normalizeTextValue(match[1]))
      .filter(Boolean);

    if (liMatches.length > 0) {
      return liMatches.join(', ');
    }

    return normalizeTextValue(direct);
  }
  return '';
};

const extractImageMetadata = async (buffer) => {
  if (!buffer) return {};
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let parsedExif = null;
    try {
      parsedExif = metadata.exif ? exifReader(metadata.exif) : null;
    } catch {
      parsedExif = null;
    }

    const imageExif = parsedExif?.image || {};
    const photoExif = parsedExif?.exif || {};
    const xmpText = metadata.xmp ? Buffer.from(metadata.xmp).toString('utf8') : '';
    const iptcFields = parseIptcBuffer(metadata.iptc ? Buffer.from(metadata.iptc) : null);

    const caption = pickFirstText(
      imageExif.ImageDescription,
      imageExif.XPTitle,
      imageExif.XPSubject,
      photoExif.UserComment,
      iptcFields.caption,
      extractXmpTag(xmpText, 'dc:description'),
      extractXmpTag(xmpText, 'photoshop:Headline')
    );

    const headline = pickFirstText(
      iptcFields.headline,
      extractXmpTag(xmpText, 'photoshop:Headline'),
      imageExif.XPTitle,
      imageExif.ImageDescription
    );

    const keywords = mergeKeywordValues(
      imageExif.XPKeywords,
      imageExif.Keywords,
      iptcFields.keywords,
      extractXmpTag(xmpText, 'dc:subject'),
      extractXmpTag(xmpText, 'lr:hierarchicalSubject')
    );
    
    // Extract all available EXIF and metadata fields
    const result = {
      // Basic dimensions
      width: metadata.width || null,
      height: metadata.height || null,
      
      // Camera info (if available in EXIF)
      cameraMake: pickFirstText(imageExif.Make),
      cameraModel: pickFirstText(imageExif.Model),
      
      // Photo timing
      dateTaken: pickFirstText(photoExif.DateTimeOriginal, photoExif.CreateDate, imageExif.DateTime),
      
      // Exposure settings (EXIF)
      iso: photoExif.ISO ? String(photoExif.ISO) : null,
      aperture: photoExif.FNumber ? String(photoExif.FNumber) : null,
      shutterSpeed: photoExif.ExposureTime ? String(photoExif.ExposureTime) : null,
      focalLength: photoExif.FocalLength ? String(photoExif.FocalLength) : null,
      
      // Advanced exposure data
      fNumber: photoExif.FNumber || null,
      exposureProgram: photoExif.ExposureProgram || null,
      exposureTime: photoExif.ExposureTime || null,
      meteringMode: photoExif.MeteringMode || null,
      
      // Keywords and description (EXIF/XMP)
      caption: caption || null,
      keywords: keywords || null,
      headline: headline || null,
      
      // Location data (XMP)
      city: pickFirstText(iptcFields.city, extractXmpTag(xmpText, 'Iptc4xmpCore:City')) || null,
      stateOrProvince: pickFirstText(iptcFields.stateOrProvince, extractXmpTag(xmpText, 'Iptc4xmpCore:ProvinceState')) || null,
      
      // Color and format info
      colorSpace: metadata.space || metadata.colorspace || null,
      colorProfile: metadata.hasProfile ? 'Yes' : null,
      
      // Additional info
      alphaChannel: metadata.hasAlpha ? 'Yes' : null,
      redEye: photoExif.RedEyeReduction ? 'Yes' : null,
      
      // File-level info
      fileSize: buffer.length,
      format: metadata.format,
    };
    
    // Clean up null values
    Object.keys(result).forEach(key => {
      if (result[key] === null || result[key] === undefined) {
        delete result[key];
      }
    });
    
    return result;
  } catch (err) {
    console.error('Failed to extract image metadata:', err);
    return {};
  }
};

const resolvePlayerTagBySignature = ({ signatureHash, signatures }) => {
  if (!signatureHash || !Array.isArray(signatures) || signatures.length === 0) return null;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sig of signatures) {
    const distance = hammingHexDistance(signatureHash, sig.signatureHash);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = sig;
    }
  }

  // dHash distance threshold tuned for conservative matching.
  if (!best || bestDistance > 8) return null;
  return {
    playerName: best.playerName,
    playerNumber: best.playerNumber,
    matchDistance: bestDistance,
  };
};

const toCsvValue = (value) => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return normalized.length ? normalized.join(', ') : null;
  }
  if (value === undefined) return undefined;
  const text = String(value || '').trim();
  return text ? text : null;
};

const csvToList = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const mergeCsvLists = (currentValue, incomingValues = []) => {
  const merged = [];
  const seen = new Set();

  for (const entry of [...csvToList(currentValue), ...incomingValues]) {
    const normalized = normalizeToken(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(entry);
  }

  return merged.length ? merged.join(', ') : null;
};

const photoTextContainsNumber = ({ fileName, description, metadata, number }) => {
  const token = String(number || '').trim();
  if (!token) return false;

  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundaryRegex = new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`, 'i');

  const haystacks = [
    String(fileName || ''),
    String(description || ''),
    typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}),
  ];

  return haystacks.some((text) => boundaryRegex.test(text));
};

const downloadImageBufferFromSource = async (source) => {
  if (!source) return null;

  try {
    if (String(source).startsWith('http')) {
      const upstream = await fetch(source);
      if (!upstream.ok) return null;
      return Buffer.from(await upstream.arrayBuffer());
    }

    const blob = await downloadBlob(source);
    if (!blob?.readableStreamBody) return null;

    const chunks = [];
    await new Promise((resolve, reject) => {
      blob.readableStreamBody.on('data', (chunk) => chunks.push(chunk));
      blob.readableStreamBody.on('end', resolve);
      blob.readableStreamBody.on('error', reject);
    });

    return Buffer.concat(chunks);
  } catch {
    return null;
  }
};

let ocrWorkerPromise = null;

const getOcrWorker = async () => {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return ocrWorkerPromise;
};

const extractDetectedNumbersFromImage = async (imageBuffer) => {
  if (!imageBuffer) return [];

  try {
    const processed = await sharp(imageBuffer)
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    const worker = await getOcrWorker();
    const result = await worker.recognize(processed);
    const rawText = String(result?.data?.text || '');
    const candidates = rawText.match(/\b\d{1,3}\b/g) || [];

    const detected = [];
    const seen = new Set();
    for (const token of candidates) {
      const normalized = String(token).trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      detected.push(normalized);
    }

    return detected;
  } catch (error) {
    console.error('OCR number detection failed:', error);
    return [];
  }
};

const parseDetectedNumbersCache = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
      }
    } catch {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }

  return [];
};

const normalizeJerseyNumber = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const digitsOnly = raw.replace(/\D+/g, '');
  if (!digitsOnly) return raw.toLowerCase();

  const normalizedDigits = digitsOnly.replace(/^0+(?=\d)/, '');
  return normalizedDigits || '0';
};

const mergeDetectionSuggestions = ({ numberMatches = [], faceMatches = [] }) => {
  const byPlayer = new Map();

  for (const match of numberMatches) {
    const key = `${normalizeToken(match.playerName)}|${normalizeToken(match.playerNumber)}`;
    const current = byPlayer.get(key) || {
      playerName: match.playerName,
      playerNumber: match.playerNumber || null,
      reasons: [],
      confidence: 0,
    };
    current.reasons.push('number');
    current.confidence += 50;
    byPlayer.set(key, current);
  }

  for (const match of faceMatches) {
    const key = `${normalizeToken(match.playerName)}|${normalizeToken(match.playerNumber)}`;
    const current = byPlayer.get(key) || {
      playerName: match.playerName,
      playerNumber: match.playerNumber || null,
      reasons: [],
      confidence: 0,
    };
    current.reasons.push('face');
    current.confidence += Math.max(10, 70 - Number(match.distance || 0) * 5);
    byPlayer.set(key, current);
  }

  return Array.from(byPlayer.values())
    .map((entry) => ({
      ...entry,
      reasons: Array.from(new Set(entry.reasons)),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);
};

function makeBlobName(albumId, originalName) {
  const extension = path.extname(originalName).toLowerCase();
  const safeBaseName = path.basename(originalName, extension).replace(/[^a-zA-Z0-9-_]/g, '-');
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `albums/${albumId}/${safeBaseName || 'photo'}-${uniqueSuffix}${extension}`;
}

// Get photos by album
router.get('/album/:albumId', async (req, res) => {
  try {
    const { playerName } = req.query;
    let query = `
      SELECT 
        id, album_id as albumId, file_name as fileName, 
        thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl,
        description, metadata, player_names as playerNames, player_numbers as playerNumbers,
        width, height, created_at as createdDate
      FROM photos 
      WHERE album_id = $1
    `;
    
    const params = [req.params.albumId];
    
    // Filter by player name if provided
    if (playerName) {
      query += ` AND player_names LIKE $2`;
      params.push(`%${playerName}%`);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const photos = await queryRows(query, params);
    res.json(photos.map(signPhotoForResponse));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/album/:albumId/roster', async (req, res) => {
  try {
    const albumId = Number(req.params.albumId);
    if (!Number.isInteger(albumId) || albumId <= 0) {
      return res.status(400).json({ error: 'Invalid album id' });
    }

    const album = await queryRow(
      `SELECT id, studio_id as studioId
       FROM albums
       WHERE id = $1`,
      [albumId]
    );

    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const studioId = Number(album.studioId || 0) || null;
    if (!studioId) {
      return res.json([]);
    }

    await ensurePlayerRecognitionSchema();
    const roster = await fetchStudioRoster(studioId);
    res.json(roster || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



router.get('/:id/detections', async (req, res) => {
  try {
    await ensurePlayerRecognitionSchema();
    await ensurePhotoUploadColumns();
    const forceRefresh = String(req.query.refresh || '').trim() === '1';

    const photo = await queryRow(
      `SELECT p.id,
              p.album_id as albumId,
              p.file_name as fileName,
              p.description,
              p.metadata,
              p.player_names as playerNames,
              p.player_numbers as playerNumbers,
              p.detected_numbers as detectedNumbers,
              p.detected_numbers_updated_at as detectedNumbersUpdatedAt,
              p.full_image_url as fullImageUrl,
              a.studio_id as studioId
       FROM photos p
       LEFT JOIN albums a ON a.id = p.album_id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const studioId = Number(photo.studioId || 0) || null;
    const roster = studioId ? await fetchStudioRoster(studioId) : [];
    const sourceBuffer = photo.fullImageUrl ? await downloadImageBufferFromSource(photo.fullImageUrl) : null;
    let detectedNumbers = parseDetectedNumbersCache(photo.detectedNumbers);
    let usedCachedDetections = detectedNumbers.length > 0 && !forceRefresh;

    if (!usedCachedDetections) {
      detectedNumbers = await extractDetectedNumbersFromImage(sourceBuffer);
      await query(
        `UPDATE photos
         SET detected_numbers = $1,
             detected_numbers_updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(detectedNumbers), photo.id]
      );
      usedCachedDetections = false;
    }

    const normalizedDetectedNumbers = Array.from(new Set(
      detectedNumbers
        .map((value) => normalizeJerseyNumber(value))
        .filter(Boolean)
    ));

    const rosterPlayersWithNumbers = roster.filter((player) => normalizeJerseyNumber(player.playerNumber));

    const numberMatches = rosterPlayersWithNumbers
      .filter((player) => {
        const playerNumber = normalizeJerseyNumber(player.playerNumber);
        return playerNumber && normalizedDetectedNumbers.includes(playerNumber);
      })
      .map((player) => ({
        playerName: player.playerName,
        playerNumber: player.playerNumber || null,
        matchedNumber: String(player.playerNumber || ''),
      }));

    let faceMatches = [];
    let faceMatchingAvailable = false;
    if (studioId && photo.fullImageUrl) {
      const signatures = sourceBuffer ? await fetchStudioFaceSignatures(studioId) : [];
      faceMatchingAvailable = signatures.length > 0;

      if (sourceBuffer && signatures.length > 0) {
        const matchResult = await findBestPlayerFaceMatch({
          imageBuffer: sourceBuffer,
          signatures,
        });

        faceMatches = matchResult.matchedPlayers.slice(0, 10);
      }
    }

    const suggestions = mergeDetectionSuggestions({ numberMatches, faceMatches });

    res.json({
      photoId: photo.id,
      detectedNumbers,
      usedCachedDetections,
      detectedNumbersUpdatedAt: photo.detectedNumbersUpdatedAt || null,
      numberMatchingAvailable: rosterPlayersWithNumbers.length > 0,
      rosterPlayersWithNumbersCount: rosterPlayersWithNumbers.length,
      faceMatches,
      faceMatchingAvailable,
      numberMatches,
      suggestions,
      currentlyTagged: {
        playerNames: csvToList(photo.playerNames),
        playerNumbers: csvToList(photo.playerNumbers),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload photos
const upload = multer({ storage: multer.memoryStorage() });
router.post('/upload', requireActiveSubscription, upload.fields([
  { name: 'photos', maxCount: 50 },
  { name: 'csv', maxCount: 1 }
]), async (req, res) => {
  try {
    await ensurePlayerRecognitionSchema();
    await ensurePhotoUploadColumns();
    const rawFiles = req.files?.photos || [];
    const csvFile = req.files?.csv?.[0];
    if (!rawFiles.length) {
      return res.status(400).json({ error: 'No photos provided' });
    }

    const { albumId, descriptions, metadata, duplicateMode } = req.body;
    const normalizedDuplicateMode = String(duplicateMode || 'allow').trim().toLowerCase();
    if (!['allow', 'skip', 'overwrite'].includes(normalizedDuplicateMode)) {
      return res.status(400).json({ error: 'Invalid duplicateMode. Use allow, skip, or overwrite.' });
    }

    let parsedDescriptions = [];
    let parsedMetadata = [];

    try {
      parsedDescriptions = descriptions ? JSON.parse(descriptions) : [];
    } catch {
      parsedDescriptions = [];
    }

    try {
      parsedMetadata = metadata ? JSON.parse(metadata) : [];
    } catch {
      parsedMetadata = [];
    }

    const parsedAlbumId = Number(albumId);
    if (!parsedAlbumId) {
      return res.status(400).json({ error: 'albumId is required' });
    }

    const csvRosterRows = csvFile ? await parseCsvRowsFromBuffer(csvFile.buffer) : [];

    const targetAlbum = await queryRow(
      `SELECT id,
              studio_id as studioId,
              description,
              category,
              COALESCE(name, title) as albumName
       FROM albums
       WHERE id = $1`,
      [parsedAlbumId]
    );
    if (!targetAlbum) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const studioId = Number(targetAlbum.studioId || req.studioId || 0) || null;
    const rosterName = buildRosterNameFromAlbum(targetAlbum);
    if (req.studioId && targetAlbum.studioId && Number(targetAlbum.studioId) !== Number(req.studioId)) {
      return res.status(403).json({ error: 'Cannot upload to an album outside your studio' });
    }

    let uploadEntries = rawFiles.map((file, index) => ({
      file,
      description: parsedDescriptions[index] || '',
      metadata: parsedMetadata[index] || {},
    }));

    const incomingNames = Array.from(new Set(uploadEntries.map((entry) => normalizeToken(entry.file.originalname)).filter(Boolean)));
    let duplicateRows = [];

    if (incomingNames.length > 0) {
      const namePlaceholders = incomingNames.map((_, i) => `$${i + 2}`).join(', ');
      duplicateRows = await queryRows(
        `SELECT id,
                file_name as fileName,
                full_image_url as fullImageUrl,
                thumbnail_url as thumbnailUrl
         FROM photos
         WHERE album_id = $1
           AND LOWER(file_name) IN (${namePlaceholders})`,
        [parsedAlbumId, ...incomingNames]
      );
    }

    const duplicateNameSet = new Set(duplicateRows.map((row) => normalizeToken(row.fileName)));

    if (normalizedDuplicateMode === 'skip') {
      uploadEntries = uploadEntries.filter((entry) => !duplicateNameSet.has(normalizeToken(entry.file.originalname)));
    }

    if (normalizedDuplicateMode === 'overwrite' && duplicateRows.length > 0) {
      const duplicateIds = duplicateRows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
      const blobUrls = new Set();
      for (const row of duplicateRows) {
        if (row?.fullImageUrl) blobUrls.add(row.fullImageUrl);
        if (row?.thumbnailUrl) blobUrls.add(row.thumbnailUrl);
      }

      await Promise.allSettled(
        Array.from(blobUrls).map(async (url) => {
          if (typeof url === 'string' && url.startsWith('http')) {
            await deleteBlobByUrl(url);
          }
        })
      );

      if (duplicateIds.length > 0) {
        const idPlaceholders = duplicateIds.map((_, i) => `$${i + 1}`).join(', ');
        await query(`DELETE FROM order_items WHERE photo_id IN (${idPlaceholders})`, duplicateIds);
        await query(`DELETE FROM photos WHERE id IN (${idPlaceholders})`, duplicateIds);

        const coverIdPlaceholders = duplicateIds.map((_, i) => `$${i + 2}`).join(', ');

        const coverHit = await queryRow(
          `SELECT id
           FROM albums
           WHERE id = $1
             AND cover_photo_id IN (${coverIdPlaceholders})`,
          [parsedAlbumId, ...duplicateIds]
        );

        if (coverHit?.id) {
          await query(
            `UPDATE albums
             SET cover_photo_id = NULL,
                 cover_image_url = NULL
             WHERE id = $1`,
            [parsedAlbumId]
          );
        }
      }
    }

    if (studioId) {
      const additionalBytes = uploadEntries.reduce((sum, entry) => sum + Number(entry.file.size || entry.file.buffer?.length || 0), 0);
      await enforceStorageQuotaForStudio(studioId, additionalBytes);
      if (csvRosterRows.length > 0) {
        await saveRosterPlayers(studioId, csvRosterRows, {
          rosterName,
          sourceAlbumId: parsedAlbumId,
        });
      }
    }

    const studioRoster = studioId ? await fetchStudioRoster(studioId) : [];
    const knownSignatures = studioId ? await fetchStudioFaceSignatures(studioId) : [];
    const fileNameTagMap = new Map();
    for (const row of csvRosterRows) {
      if (!row.fileName || !row.playerName) continue;
      fileNameTagMap.set(normalizeToken(row.fileName), {
        playerName: row.playerName,
        playerNumber: row.playerNumber || '',
      });
    }

    const photos = [];
    let firstExifCaption = '';
    for (let index = 0; index < uploadEntries.length; index++) {
      const entry = uploadEntries[index];
      const file = entry.file;

      // Generate blob name for full image
      const blobName = makeBlobName(albumId, file.originalname);
      const photoUrl = await uploadImageBufferToAzure(file.buffer, blobName, file.mimetype);

      // --- THUMBNAIL GENERATION AND UPLOAD ---
      // Generate a thumbnail buffer (e.g., 400px wide, preserve aspect)
      let thumbnailUrl = null;
      try {
        const thumbExt = path.extname(file.originalname).toLowerCase() || '.jpg';
        const thumbBase = path.basename(file.originalname, thumbExt).replace(/[^a-zA-Z0-9-_]/g, '-');
        const thumbName = `albums/${albumId}/${thumbBase}-thumb-${Date.now()}-${Math.round(Math.random() * 1e9)}${thumbExt}`;
        const thumbBuffer = await sharp(file.buffer)
          .resize({ width: 400, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        thumbnailUrl = await uploadImageBufferToAzure(thumbBuffer, thumbName, 'image/jpeg');
      } catch (err) {
        console.error(`[Photo Upload] Failed to generate/upload thumbnail for ${file.originalname}:`, err);
      }

      // Extract comprehensive metadata from EXIF and image properties
      const extractedMetadata = await extractImageMetadata(file.buffer);
      const clientMetadata = entry.metadata || {};

      // Merge extracted EXIF metadata with any client-provided metadata (client takes precedence)
      const mergedMetadata = {
        ...extractedMetadata,
        ...clientMetadata,
      };

      if (!firstExifCaption) {
        const captionCandidate = String(mergedMetadata.caption || mergedMetadata.headline || '').trim();
        if (captionCandidate) {
          firstExifCaption = captionCandidate;
        }
      }

      // Always extract dimensions from Sharp independently
      let width = null;
      let height = null;
      try {
        const sharpMeta = await sharp(file.buffer).metadata();
        if (sharpMeta.width && sharpMeta.height) {
          width = sharpMeta.width;
          height = sharpMeta.height;
          console.log(`[Photo Upload] Sharp dimensions for ${file.originalname}: width=${width}, height=${height}`);
        }
      } catch (err) {
        console.error(`[Photo Upload] Failed to extract dimensions from Sharp for ${file.originalname}:`, err);
      }
      // If EXIF has dimensions, prefer those only if they differ and are valid
      if (mergedMetadata.width && mergedMetadata.height) {
        if (mergedMetadata.width !== width || mergedMetadata.height !== height) {
          console.log(`[Photo Upload] EXIF dimensions for ${file.originalname}: width=${mergedMetadata.width}, height=${mergedMetadata.height}`);
        }
        // Optionally, you could compare and decide which to trust more
      }
      // Log if dimensions are missing after Sharp
      if (!width || !height) {
        console.warn(`[Photo Upload] WARNING: Missing dimensions for ${file.originalname} after Sharp extraction. width=${width}, height=${height}`);
      }

      const signatureHash = await computeImageSignature(file.buffer);
      const fileTag = resolvePlayerTagForFile({
        fileName: file.originalname,
        rosterRows: studioRoster,
        fileNameTagMap,
      });
      const signatureTag = !fileTag
        ? resolvePlayerTagBySignature({ signatureHash, signatures: knownSignatures })
        : null;
      const player = fileTag || signatureTag;


      // Use the correct thumbnail path (album folder)
      const result = await queryRow(`
        INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, width, height, file_size_bytes, player_names, player_numbers)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        parsedAlbumId,
        file.originalname,
        thumbnailUrl && typeof thumbnailUrl === 'string' ? require('../services/azureStorage.js').getBlobNameFromUrlOrName(thumbnailUrl) : thumbnailUrl,
        photoUrl && typeof photoUrl === 'string' ? require('../services/azureStorage.js').getBlobNameFromUrlOrName(photoUrl) : photoUrl,
        entry.description || '',
        Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : null,
        width,
        height,
        Number(file.size || file.buffer?.length || 0),
        player?.playerName || null,
        player?.playerNumber || null,
      ]);

      if (studioId && player?.playerName && signatureHash) {
        await saveFaceSignature({
          studioId,
          playerName: player.playerName,
          playerNumber: player.playerNumber || null,
          signatureHash,
          sourcePhotoId: result.id,
        });
      }

      photos.push({
        id: result.id,
        albumId: parsedAlbumId,
        fileName: file.originalname,
        thumbnailUrl: thumbnailUrl && typeof thumbnailUrl === 'string' ? require('../services/azureStorage.js').getBlobNameFromUrlOrName(thumbnailUrl) : thumbnailUrl,
        fullImageUrl: photoUrl && typeof photoUrl === 'string' ? require('../services/azureStorage.js').getBlobNameFromUrlOrName(photoUrl) : photoUrl,
        description: entry.description || '',
        metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null,
        width: width,
        height: height,
        playerName: player?.playerName || null,
        playerNumber: player?.playerNumber || null
      });
    }

    // If album description is empty, populate it from the first uploaded photo caption/headline
    const existingAlbumDescription = String(targetAlbum.description || '').trim();
    if (!existingAlbumDescription && firstExifCaption) {
      await query(
        `UPDATE albums SET description = $1 WHERE id = $2`,
        [firstExifCaption, parsedAlbumId]
      );
    }

    // Update album photo count
    await query(`
      UPDATE albums 
      SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
      WHERE id = $1
    `, [parsedAlbumId]);

    // Auto-select cover photo if none is currently selected
    const album = await queryRow(
      `SELECT cover_photo_id as coverPhotoId, cover_image_url as coverImageUrl FROM albums WHERE id = $1`,
      [parsedAlbumId]
    );

    if ((!album?.coverPhotoId || !album?.coverImageUrl) && photos.length > 0) {
      const fallback = photos[0];
      await query(
        `UPDATE albums
         SET cover_photo_id = $1,
             cover_image_url = $2
         WHERE id = $3`,
        [fallback.id, fallback.fullImageUrl, parsedAlbumId]
      );
    }

    res.status(201).json(photos.map(signPhotoForResponse));
  } catch (error) {
    if (error.code === 'STORAGE_QUOTA_EXCEEDED') {
      return res.status(403).json({ error: error.message, quotaExceeded: true });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update photo
router.put('/:id', async (req, res) => {
  try {
    await ensurePlayerRecognitionSchema();
    await ensurePhotoUploadColumns();

    const { description, metadata, playerNames, playerNumbers } = req.body;
    const currentPhoto = await queryRow(
      `SELECT id,
              album_id as albumId,
              file_name as fileName,
              full_image_url as fullImageUrl,
              description,
              metadata,
              player_names as playerNames,
              player_numbers as playerNumbers
       FROM photos
       WHERE id = $1`,
      [req.params.id]
    );

    if (!currentPhoto) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const nextDescription = description !== undefined ? description : currentPhoto.description;
    const nextMetadata = metadata !== undefined
      ? (metadata ? JSON.stringify(metadata) : null)
      : currentPhoto.metadata;
    const nextPlayerNames = playerNames !== undefined ? toCsvValue(playerNames) : currentPhoto.playerNames;
    const nextPlayerNumbers = playerNumbers !== undefined ? toCsvValue(playerNumbers) : currentPhoto.playerNumbers;

    await query(`
      UPDATE photos 
      SET description = $1, metadata = $2, player_names = $3, player_numbers = $4
      WHERE id = $5
    `, [nextDescription, nextMetadata, nextPlayerNames, nextPlayerNumbers, req.params.id]);

    let autoTaggedCount = 0;
    let faceMatchedCount = 0;
    let numberMatchedCount = 0;
    let trainedFaceSamples = 0;
    let album = null; // hoisted so notification block can reference it

    const taggedNames = csvToList(nextPlayerNames);
    const taggedNumbers = csvToList(nextPlayerNumbers);
    const hasAnyTag = taggedNames.length > 0 || taggedNumbers.length > 0;

    if (hasAnyTag) {
      try {
        album = await queryRow(
          `SELECT id, name, title, studio_id as studioId
           FROM albums
           WHERE id = $1`,
          [currentPhoto.albumId]
        );

        const studioId = Number(album?.studioId || 0) || null;
        const sourceBuffer = await downloadImageBufferFromSource(currentPhoto.fullImageUrl);
        const faceTags = extractFaceTagsFromMetadata(nextMetadata);

        if (studioId && sourceBuffer && taggedNames.length > 0) {
          trainedFaceSamples = await saveFaceSignaturesForPlayers({
            studioId,
            taggedNames,
            taggedNumbers,
            imageBuffer: sourceBuffer,
            sourcePhotoId: currentPhoto.id,
            faceTags,
          });
        }

        const trainingSignatures = studioId && taggedNames.length > 0
          ? (await fetchStudioFaceSignatures(studioId)).filter((sig) =>
              taggedNames.some((name, index) =>
                normalizeToken(sig.playerName) === normalizeToken(name)
                && normalizeToken(sig.playerNumber) === normalizeToken(taggedNumbers[index] || taggedNumbers[0] || null)
              )
            )
          : [];

        const siblingPhotos = await queryRows(
          `SELECT id,
                  file_name as fileName,
                  full_image_url as fullImageUrl,
                  description,
                  metadata,
                  player_names as playerNames,
                  player_numbers as playerNumbers
           FROM photos
           WHERE album_id = $1
             AND id <> $2`,
          [currentPhoto.albumId, currentPhoto.id]
        );

        for (const sibling of siblingPhotos) {
          let matchedByFace = false;
          let matchedByNumber = false;

          if (trainingSignatures.length > 0 && sibling.fullImageUrl) {
            const siblingBuffer = await downloadImageBufferFromSource(sibling.fullImageUrl);
            const faceMatchResult = siblingBuffer
              ? await findBestPlayerFaceMatch({
                  imageBuffer: siblingBuffer,
                  signatures: trainingSignatures,
                  allowedPlayers: taggedNames.map((name, index) => ({
                    playerName: name,
                    playerNumber: taggedNumbers[index] || taggedNumbers[0] || null,
                  })),
                })
              : { matchedPlayers: [], bestDistance: Number.POSITIVE_INFINITY };

            matchedByFace = faceMatchResult.matchedPlayers.length > 0;
          }

          if (!matchedByFace && taggedNumbers.length > 0) {
            matchedByNumber = taggedNumbers.some((number) => photoTextContainsNumber({
              fileName: sibling.fileName,
              description: sibling.description,
              metadata: sibling.metadata,
              number,
            }));
          }

          if (!matchedByFace && !matchedByNumber) continue;

          const mergedNames = mergeCsvLists(sibling.playerNames, taggedNames);
          const mergedNumbers = mergeCsvLists(sibling.playerNumbers, taggedNumbers);

          const changed = (mergedNames || null) !== (sibling.playerNames || null)
            || (mergedNumbers || null) !== (sibling.playerNumbers || null);

          if (!changed) continue;

          await query(
            `UPDATE photos
             SET player_names = $1,
                 player_numbers = $2
             WHERE id = $3`,
            [mergedNames, mergedNumbers, sibling.id]
          );

          autoTaggedCount += 1;
          if (matchedByFace) faceMatchedCount += 1;
          if (matchedByNumber) numberMatchedCount += 1;
        }
      } catch (recognitionError) {
        console.error('Photo tag recognition follow-up failed:', recognitionError);
      }
    }

    // ── Player watchlist notifications ────────────────────────────────────────
    // Send emails to customers who are watching any of the newly-tagged players.
    // We only notify for players that were NOT already on this photo before this update.
    try {
      const previousNames = csvToList(currentPhoto.playerNames);
      const previousSet = new Set(previousNames.map((n) => n.toLowerCase()));
      const newlyTaggedNames = taggedNames.filter((n) => !previousSet.has(n.toLowerCase()));

      if (newlyTaggedNames.length > 0 && album?.studioId) {
        const studioId = Number(album.studioId);

        // album is already loaded above; use it directly
        const albumName = album?.title || album?.name || null;

        // Get studio slug for a friendly URL
        const studioRow = await queryRow(
          `SELECT public_slug as publicSlug, name FROM studios WHERE id = $1`,
          [studioId]
        ).catch(() => null);
        const studioSlug = studioRow?.publicSlug || null;
        const studioName = studioRow?.name || 'Photo Lab';

        const appBase = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
        const albumUrl = appBase
          ? (studioSlug
              ? `${appBase}/s/${encodeURIComponent(studioSlug)}/albums/${album?.id}`
              : `${appBase}/albums/${album?.id}`)
          : null;

        for (const playerName of newlyTaggedNames) {
          try {
            // Find customers watching this player in this studio
            const subscribers = await queryRows(
              `SELECT w.id, w.player_number as playerNumber, u.email, u.name as customerName
               FROM customer_player_watchlist w
               JOIN users u ON u.id = w.user_id
               WHERE w.studio_id = $1
                 AND LOWER(w.player_name) = LOWER($2)
                 AND u.email IS NOT NULL
                 AND u.is_active = 1`,
              [studioId, playerName]
            );

            for (const sub of subscribers) {
              orderReceiptService.sendPlayerPhotoNotification({
                to: sub.email,
                customerName: sub.customerName || null,
                playerName,
                playerNumber: sub.playerNumber || null,
                albumName,
                albumUrl,
                studioName,
                photoCount: 1,
              }).catch((e) => console.error('[watchlist notify] email error:', e?.message));
            }
          } catch (notifyErr) {
            console.error('[watchlist notify] lookup error for player', playerName, notifyErr?.message);
          }
        }
      }
    } catch (notifyTopErr) {
      console.error('[watchlist notify] top-level error:', notifyTopErr?.message);
    }
    // ── End watchlist notifications ───────────────────────────────────────────

    const photo = await queryRow(`
      SELECT 
        id, album_id as albumId, file_name as fileName, 
        thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl,
        description, metadata, player_names as playerNames, player_numbers as playerNumbers, created_at as createdDate
      FROM photos 
      WHERE id = $1
    `, [req.params.id]);
    res.json({
      ...signPhotoForResponse(photo),
      autoTaggedCount,
      trainedFaceSamples,
      autoTagMatches: {
        face: faceMatchedCount,
        number: numberMatchedCount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete photo
router.delete('/:id', async (req, res) => {
  try {
    const photo = await queryRow('SELECT * FROM photos WHERE id = $1', [req.params.id]);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Try to delete blobs (full image and thumbnail), but ignore errors (missing blob, etc)
    const blobPaths = [];
    if (photo.full_image_url) blobPaths.push(photo.full_image_url);
    if (photo.thumbnail_url && photo.thumbnail_url !== photo.full_image_url) blobPaths.push(photo.thumbnail_url);
    for (const blobPath of blobPaths) {
      try {
        await deleteBlobByUrl(blobPath);
      } catch (err) {
        console.warn('Failed to delete blob for photo', req.params.id, blobPath, err?.message);
      }
    }

    // Always attempt to delete DB record
    await query('DELETE FROM photos WHERE id = $1', [req.params.id]);

    // Update album photo count
    try {
      await query(`
        UPDATE albums 
        SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
        WHERE id = $1
      `, [photo.album_id]);
    } catch (err) {
      console.warn('Failed to update album photo count for album', photo.album_id, err?.message);
    }

    // If album cover is missing (or deleted), pick the most recent remaining photo as fallback
    try {
      const album = await queryRow(
        `SELECT id, cover_photo_id as coverPhotoId, cover_image_url as coverImageUrl
         FROM albums
         WHERE id = $1`,
        [photo.album_id]
      );

      const coverWasDeleted = Number(album?.coverPhotoId) === Number(req.params.id);
      if (album && (coverWasDeleted || !album.coverPhotoId || !album.coverImageUrl)) {
        const fallback = await queryRow(
          `SELECT id, full_image_url as fullImageUrl
           FROM photos
           WHERE album_id = $1
           ORDER BY created_at DESC`,
          [photo.album_id]
        );

        await query(
          `UPDATE albums
           SET cover_photo_id = $1,
               cover_image_url = $2
           WHERE id = $3`,
          [fallback?.id || null, fallback?.fullImageUrl || null, photo.album_id]
        );
      }
    } catch (err) {
      console.warn('Failed to update album cover after photo delete', err?.message);
    }

    res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Photo delete failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search photos
router.get('/search', async (req, res) => {
  try {
    const { q, field } = req.query;
    const searchPattern = `%${q}%`;
    
    let query = `
      SELECT p.id, p.album_id as albumId, p.file_name as fileName, 
             p.thumbnail_url as thumbnailUrl, p.full_image_url as fullImageUrl,
             p.description, p.metadata, p.player_names as playerNames, p.created_at as createdDate,
             a.name as albumName
      FROM photos p
      JOIN albums a ON p.album_id = a.id
      WHERE`;
    
    // If specific field is requested, search only that field
    if (field && ['filename', 'camera', 'iso', 'aperture', 'shutterSpeed', 'focalLength', 'player', 'description'].includes(field)) {
      switch(field) {
        case 'filename':
          query += ` p.file_name LIKE $1`;
          break;
        case 'camera':
          query += ` (p.metadata LIKE $1 OR p.metadata LIKE $2)`;
          break;
        case 'player':
          query += ` p.player_names LIKE $1`;
          break;
        case 'description':
          query += ` p.description LIKE $1`;
          break;
        default:
          query += ` p.metadata LIKE $1`;
      }
      const result = field === 'camera' 
        ? await queryRows(query, [searchPattern, searchPattern])
        : await queryRows(query, [searchPattern]);
      res.json(result.map(signPhotoForResponse));
    } else {
      // Search all fields (default)
      query += ` p.file_name LIKE $1 
        OR p.description LIKE $2 
        OR p.metadata LIKE $3
        OR p.player_names LIKE $4
      ORDER BY p.created_at DESC
      OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY`;
      
      const photos = await queryRows(query, [searchPattern, searchPattern, searchPattern, searchPattern]);
      res.json(photos.map(signPhotoForResponse));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search photos by metadata (advanced)
router.get('/search/metadata', async (req, res) => {
  try {
    const { q, type } = req.query;
    const searchPattern = `%${q}%`;
    
    // Parse metadata JSON and search specific fields
    const photos = await queryRows(`
      SELECT p.id, p.album_id as albumId, p.file_name as fileName, 
             p.thumbnail_url as thumbnailUrl, p.full_image_url as fullImageUrl,
             p.description, p.metadata, p.player_names as playerNames, p.created_at as createdDate,
             a.name as albumName
      FROM photos p
      JOIN albums a ON p.album_id = a.id
      WHERE 1=1
    `);
    
    // Client-side filtering of parsed JSON metadata
    const filtered = photos.filter(photo => {
      if (!photo.metadata) return false;
      
      try {
        const metadata = JSON.parse(photo.metadata);
        
        // Search based on type
        switch(type) {
          case 'camera':
            return (metadata.cameraMake || '').toLowerCase().includes(q.toLowerCase()) ||
                   (metadata.cameraModel || '').toLowerCase().includes(q.toLowerCase());
          case 'iso':
            return (metadata.iso || '').toLowerCase().includes(q.toLowerCase());
          case 'aperture':
            return (metadata.aperture || '').toLowerCase().includes(q.toLowerCase());
          case 'shutterSpeed':
            return (metadata.shutterSpeed || '').toLowerCase().includes(q.toLowerCase());
          case 'focalLength':
            return (metadata.focalLength || '').toLowerCase().includes(q.toLowerCase());
          case 'date':
            return (metadata.dateTaken || '').toLowerCase().includes(q.toLowerCase());
          default:
            // Search all metadata fields
            return Object.values(metadata).some(val => 
              val && val.toString().toLowerCase().includes(q.toLowerCase())
            );
        }
      } catch (e) {
        return false;
      }
    }).slice(0, 100);
    
    res.json(filtered.map(signPhotoForResponse));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload player names CSV (also persists studio roster for future albums)
router.post('/album/:albumId/upload-players', csvUpload.single('csv'), async (req, res) => {
  try {
    await ensurePlayerRecognitionSchema();
    const albumId = Number(req.params.albumId);
    if (!Number.isInteger(albumId) || albumId <= 0) {
      return res.status(400).json({ error: 'Invalid album id' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const album = await queryRow(
      `SELECT id,
              studio_id as studioId,
              category,
              COALESCE(name, title) as albumName
       FROM albums
       WHERE id = $1`,
      [albumId]
    );
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const studioId = Number(album.studioId || 0) || null;
    const rosterName = buildRosterNameFromAlbum(album);
    const csvRows = await parseCsvRowsFromBuffer(req.file.buffer);
    const rowCount = csvRows.length;

    if (rowCount === 0) {
      return res.status(400).json({
        error: 'No player names could be extracted from CSV. Expected columns like player_name or Firstname/Lastname. Please map columns and try again.',
      });
    }

    let rosterPlayersSaved = 0;
    if (studioId) {
      rosterPlayersSaved = await saveRosterPlayers(studioId, csvRows, {
        rosterName,
        sourceAlbumId: albumId,
      });
    }

    const playerMapping = new Map();
    for (const row of csvRows) {
      if (!row.fileName || !row.playerName) continue;
      playerMapping.set(normalizeToken(row.fileName), {
        playerName: row.playerName,
        playerNumber: row.playerNumber || null,
      });
    }

    let updatedCount = 0;
    const photos = await queryRows(
      `SELECT id,
              file_name as fileName,
              full_image_url as fullImageUrl
       FROM photos
       WHERE album_id = $1`,
      [albumId]
    );

    for (const photo of photos) {
      const match = playerMapping.get(normalizeToken(photo.fileName));
      if (!match?.playerName) continue;

      await query(
        `UPDATE photos
         SET player_names = $1,
             player_numbers = $2
         WHERE id = $3`,
        [match.playerName, match.playerNumber || null, photo.id]
      );
      updatedCount += 1;

      if (studioId && photo.fullImageUrl) {
        try {
          const imageBuffer = await (async () => {
            if (String(photo.fullImageUrl).startsWith('http')) {
              const upstream = await fetch(photo.fullImageUrl);
              if (!upstream.ok) return null;
              return Buffer.from(await upstream.arrayBuffer());
            }
            const blob = await downloadBlob(photo.fullImageUrl);
            if (!blob?.readableStreamBody) return null;
            const chunks = [];
            await new Promise((resolve, reject) => {
              blob.readableStreamBody.on('data', (c) => chunks.push(c));
              blob.readableStreamBody.on('end', resolve);
              blob.readableStreamBody.on('error', reject);
            });
            return Buffer.concat(chunks);
          })();

          const signatureHash = imageBuffer ? await computeImageSignature(imageBuffer) : null;
          if (signatureHash) {
            await saveFaceSignature({
              studioId,
              playerName: match.playerName,
              playerNumber: match.playerNumber || null,
              signatureHash,
              sourcePhotoId: photo.id,
            });
          }
        } catch {
          // Non-fatal: player tags still saved even if signature extraction fails.
        }
      }
    }

    res.json({
      message: 'Player roster uploaded successfully',
      rosterName,
      rowsParsed: rowCount,
      photosUpdated: updatedCount,
      totalPhotos: photos.length,
      rosterPlayersSaved,
      facialRecognitionTrained: updatedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product recommendations based on photo dimensions
router.get('/:id/recommendations', async (req, res) => {
  try {
    const photoId = req.params.id;
    
    // Get photo dimensions
    const photo = await queryRow(`
      SELECT id, width, height, file_name as fileName
      FROM photos 
      WHERE id = $1
    `, [photoId]);
    
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    if (!photo.width || !photo.height) {
      return res.json({
        photo: photo,
        recommendations: [],
        message: 'Photo dimensions not available'
      });
    }
    
    // Calculate aspect ratio
    const aspectRatio = photo.width / photo.height;
    const isLandscape = aspectRatio > 1;
    const isPortrait = aspectRatio < 1;
    const isSquare = Math.abs(aspectRatio - 1) < 0.1;
    
    // Get all products
    const products = await queryRows('SELECT * FROM products ORDER BY category, name');
    
    // Recommendation algorithm
    let bestFitPrint = null;
    let bestFitPrintDiff = Infinity;
    let bestFitPrintProduct = null;
    const recommendations = products.map(product => {
      let score = 0;
      let reasons = [];
      let isBestFitPrint = false;
      let isPackage = false;

      // Parse product options to find dimensions
      let productOptions = null;
      try {
        productOptions = product.options ? JSON.parse(product.options) : null;
      } catch (e) {
        // ignore
      }

      // Check if product has size information
      if (productOptions && productOptions.sizes) {
        let closestMatch = null;
        let closestDiff = Infinity;

        productOptions.sizes.forEach(size => {
          if (size.width && size.height) {
            const sizeRatio = size.width / size.height;
            const ratioDiff = Math.abs(sizeRatio - aspectRatio);
            if (ratioDiff < closestDiff && ratioDiff < 0.5) {
              closestMatch = size;
              closestDiff = ratioDiff;
            }
          }
        });

        if (closestMatch) {
          // Track best fit paper print
          if ((product.category && product.category.toLowerCase().includes('print')) && closestDiff < bestFitPrintDiff) {
            bestFitPrintDiff = closestDiff;
            bestFitPrint = { ...product, options: productOptions, closestMatch, recommendationScore: score, reasons: [...reasons], matchQuality: '' };
            bestFitPrintProduct = product;
          }
          // Score based on how close the match is (0-50 points)
          const matchScore = Math.max(0, 50 * (1 - closestDiff / 0.5));
          score += Math.round(matchScore);
          reasons.push(`${closestMatch.width}x${closestMatch.height} is close to your photo ratio`);
        }
      }

      // Category-based recommendations
      if (product.category === 'Print') {
        if (isLandscape && product.name.toLowerCase().includes('landscape')) {
          score += 30;
          reasons.push('Perfect for landscape orientation');
        }
        if (isPortrait && product.name.toLowerCase().includes('portrait')) {
          score += 30;
          reasons.push('Perfect for portrait orientation');
        }
        if (isSquare && product.name.toLowerCase().includes('square')) {
          score += 30;
          reasons.push('Perfect for square format');
        }
      }

      // Common aspect ratios
      if (Math.abs(aspectRatio - 1.5) < 0.1) {
        if (product.name.match(/4x6|6x4|8x12|12x8|12x18|18x12/)) {
          score += 40;
          reasons.push('Matches standard 3:2 camera ratio');
        }
      } else if (Math.abs(aspectRatio - 1.33) < 0.1) {
        if (product.name.match(/4x3|8x6|6x8|12x9|16x12/)) {
          score += 40;
          reasons.push('Matches 4:3 aspect ratio');
        }
      } else if (Math.abs(aspectRatio - 1.0) < 0.1) {
        if (product.name.match(/5x5|8x8|10x10|12x12/)) {
          score += 40;
          reasons.push('Perfect square format');
        }
      }

      // Resolution-based recommendations
      const megapixels = (photo.width * photo.height) / 1000000;
      if (megapixels > 12) {
        if (product.name.match(/16x20|20x30|24x36/)) {
          score += 20;
          reasons.push('High resolution supports large prints');
        }
      } else if (megapixels < 3) {
        if (product.name.match(/4x6|5x7|wallet/i)) {
          score += 20;
          reasons.push('Resolution best suited for smaller prints');
        }
      }

      // Digital download always applicable
      if (product.category.toLowerCase().includes('digital')) {
        score += 10;
        reasons.push('Always available for digital use');
      }

      // Mark as package if category or name includes 'package'
      if ((product.category && product.category.toLowerCase().includes('package')) || (product.name && product.name.toLowerCase().includes('package'))) {
        isPackage = true;
      }

      return {
        ...product,
        options: productOptions,
        recommendationScore: score,
        reasons: reasons,
        matchQuality: score > 60 ? 'excellent' : score > 30 ? 'good' : 'fair',
        isBestFitPrint,
        isPackage
      };
    });

    // Always include best fit paper print (if not already in recommendations)
    let recs = [...recommendations];
    if (bestFitPrint && !recs.some(r => r.id === bestFitPrintProduct.id)) {
      recs.push({
        ...bestFitPrintProduct,
        options: bestFitPrint.options,
        recommendationScore: 100,
        reasons: [
          ...(bestFitPrint.reasons || []),
          'Best fit paper print for your photo'
        ],
        matchQuality: 'excellent',
        isBestFitPrint: true
      });
    }

    // Always include all packages
    const packageProducts = recommendations.filter(r => r.isPackage && !recs.some(x => x.id === r.id));
    for (const pkg of packageProducts) {
      recs.push({
        ...pkg,
        recommendationScore: Math.max(pkg.recommendationScore, 80),
        reasons: [...(pkg.reasons || []), 'Popular package option'],
        matchQuality: 'excellent',
        isPackage: true
      });
    }

    // Sort by score, show all products
    const sortedRecommendations = recs.sort((a, b) => b.recommendationScore - a.recommendationScore);
    res.json({
      photo: {
        id: photo.id,
        fileName: photo.fileName,
        width: photo.width,
        height: photo.height,
        aspectRatio: aspectRatio.toFixed(2),
        orientation: isSquare ? 'square' : isLandscape ? 'landscape' : 'portrait',
        megapixels: ((photo.width * photo.height) / 1000000).toFixed(1)
      },
      recommendations: sortedRecommendations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Serve photo asset (thumbnail or full image)
import { pipeAssetToResponse } from './photos.utils.js';
router.get('/:id/asset', async (req, res) => {
  try {
    const photoId = req.params.id;
    const variant = req.query.variant === 'thumb' ? 'thumb' : 'full';
    // Fetch photo from DB
    const photo = await queryRow('SELECT thumbnail_url, full_image_url FROM photos WHERE id = $1', [photoId]);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    const assetUrl = variant === 'thumb' ? photo.thumbnail_url : photo.full_image_url;
    if (!assetUrl) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    await pipeAssetToResponse(assetUrl, res);
  } catch (error) {
    console.error('Error serving photo asset:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

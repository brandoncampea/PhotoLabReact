import express from 'express';
import { exiftool } from 'exiftool-vendored';
// import fs from 'fs'; // Duplicate import removed
import os from 'os';
import path from 'path';




const router = express.Router();

// Load SmugMug OAuth credentials from .env.smugmug if present
if (fs.existsSync(process.cwd() + '/.env.smugmug')) {
  dotenv.config({ path: process.cwd() + '/.env.smugmug' });
}

// --- POST /import ---
router.post('/import', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req) || req.user.studio_id || req.user.studioId || req.user.id;
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

      for (const image of images) {
        let imageBuffer = null;
        let width = null;
        let height = null;
        try {
          // Always prefer OriginalUrl if available
          let downloadUrl = image.OriginalUrl || image.sourceUrl;
          if (!downloadUrl) throw new Error('No valid image URL');
          console.log('[SMUGMUG IMPORT] Downloading image:', {
            fileName: image.fileName,
            downloadUrl,
            importMethod: image.importMethod,
          });
          const fetch = (await import('node-fetch')).default;
          const imgRes = await fetch(downloadUrl);
          if (!imgRes.ok) throw new Error('Failed to download image');
          imageBuffer = Buffer.from(await imgRes.arrayBuffer());
          console.log('[SMUGMUG IMPORT] Downloaded image', image.fileName, 'size:', imageBuffer.length, 'url:', downloadUrl);
          // --- EXIF ANNOTATION AND PRESERVATION ---
          // Write import method to EXIF and preserve all EXIF data
          const tmpDir = os.tmpdir();
          const tmpFile = path.join(tmpDir, `smugmug-import-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
          let exifWritten = false;
          try {
            fs.writeFileSync(tmpFile, imageBuffer);
            // Compose EXIF update: annotate ImageDescription, preserve all else
            const origDescription = image?.Caption || image?.Title || '';
            const importMethod = image?.importMethod || 'SmugMug';
            const description = `[Imported via ${importMethod}] ${origDescription}`.trim();
            await exiftool.write(tmpFile, {
              ImageDescription: description,
              XPComment: description,
              UserComment: description,
            });
            const exifBuffer = fs.readFileSync(tmpFile);
            if (exifBuffer && exifBuffer.length > 0) {
              imageBuffer = exifBuffer;
              exifWritten = true;
              console.log('[SMUGMUG IMPORT] EXIF written for', image.fileName, 'size:', imageBuffer.length);
            }
          } catch (exifErr) {
            console.error('[SMUGMUG IMPORT] Failed to write EXIF', exifErr);
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
          if (!exifWritten) {
            console.warn('[SMUGMUG IMPORT] EXIF not written, using original buffer for', image.fileName);
          }
          // Optionally, get image dimensions
        } catch (error) {
          importJob.totals.photosProcessed += 1;
          importJob.totals.photosFailed += 1;
          pushPhotoProgress(importJob, {
            albumKey,
            albumName,
            fileName: image.fileName,
            status: 'failed',
            detail: error instanceof Error ? error.message : 'Download failed',
          });
          console.error('[SMUGMUG IMPORT] Failed to download image', image.fileName, error);
          // continue; // Removed because it's outside of a loop
        }
        // ...rest of the import logic...
      }
      // End for loop
        let imageBuffer = null;
        let width = null;
        let height = null;
        try {
          // Always prefer OriginalUrl if available
          let downloadUrl = image.OriginalUrl || image.sourceUrl;
          if (!downloadUrl) throw new Error('No valid image URL');
          console.log('[SMUGMUG IMPORT] Downloading image:', {
            fileName: image.fileName,
            downloadUrl,
            importMethod: image.importMethod,
          });
          const fetch = (await import('node-fetch')).default;
          const imgRes = await fetch(downloadUrl);
          if (!imgRes.ok) throw new Error('Failed to download image');
          imageBuffer = Buffer.from(await imgRes.arrayBuffer());
          console.log('[SMUGMUG IMPORT] Downloaded image', image.fileName, 'size:', imageBuffer.length, 'url:', downloadUrl);

          // --- EXIF ANNOTATION AND PRESERVATION ---
          // Write import method to EXIF and preserve all EXIF data
          const tmpDir = os.tmpdir();
          const tmpFile = path.join(tmpDir, `smugmug-import-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
          let exifWritten = false;
          try {
            fs.writeFileSync(tmpFile, imageBuffer);
            // Compose EXIF update: annotate ImageDescription, preserve all else
            const origDescription = image?.Caption || image?.Title || '';
            const importMethod = image?.importMethod || 'SmugMug';
            const description = `[Imported via ${importMethod}] ${origDescription}`.trim();
            await exiftool.write(tmpFile, {
              ImageDescription: description,
              XPComment: description,
              UserComment: description,
            });
            const exifBuffer = fs.readFileSync(tmpFile);
            if (exifBuffer && exifBuffer.length > 0) {
              imageBuffer = exifBuffer;
              exifWritten = true;
              console.log('[SMUGMUG IMPORT] EXIF written for', image.fileName, 'size:', imageBuffer.length);
            }
          } catch (exifErr) {
            console.error('[SMUGMUG IMPORT] Failed to write EXIF', exifErr);
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
          if (!exifWritten) {
            console.warn('[SMUGMUG IMPORT] EXIF not written, using original buffer for', image.fileName);
          }
          // Optionally, get image dimensions
        } catch (error) {
          importJob.totals.photosProcessed += 1;
          importJob.totals.photosFailed += 1;
          pushPhotoProgress(importJob, {
            albumKey,
            albumName,
            fileName: image.fileName,
            status: 'failed',
            detail: error instanceof Error ? error.message : 'Download failed',
          });
          console.error('[SMUGMUG IMPORT] Failed to download image', image.fileName, error);
          continue;
        }
        // ...rest of the import logic...
      } catch (error) {
        console.error('SmugMug import error:', error);
        const requestedJobId = String(req.body?.jobId || '').trim();
        if (requestedJobId) {
          finishImportJob(smugMugImportJobs.get(requestedJobId), {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Failed to import SmugMug albums',
          });
        }
        res.status(500).json({ error: 'Failed to import SmugMug albums' });
      }
    });

    // --- GET /import-progress/:jobId ---
    router.get('/import-progress/:jobId', authRequired, async (req, res) => {
      try {
        if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        const studioId = getStudioIdFromRequest(req);
        if (!studioId) return res.status(400).json({ error: 'Studio context is required' });
        const jobId = String(req.params.jobId || '').trim();
        if (!jobId) {
          return res.status(400).json({ error: 'Import job id is required' });
        }
        const job = smugMugImportJobs.get(jobId);
        if (!job || Number(job.studioId) !== Number(studioId)) {
          return res.status(404).json({ error: 'Import job not found' });
        }
        res.json(job);
      } catch (error) {
        console.error('SmugMug import progress error:', error);
        res.status(500).json({ error: 'Failed to load SmugMug import progress' });
      }
    });
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });
    const jobId = String(req.params.jobId || '').trim();
    if (!jobId) {
      return res.status(400).json({ error: 'Import job id is required' });
    }
    const job = smugMugImportJobs.get(jobId);
    if (!job || Number(job.studioId) !== Number(studioId)) {
      return res.status(404).json({ error: 'Import job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('SmugMug import progress error:', error);
    res.status(500).json({ error: 'Failed to load SmugMug import progress' });
  }
});
// --- PORTED: Import Job State Helpers and /import endpoint ---
// Helpers: smugMugImportJobs, createImportJob, touchImportJob, pushPhotoProgress, finishImportJob
const smugMugImportJobs = new Map();
const createImportJob = ({ jobId, studioId, albums }) => {
  const normalizedJobId = String(jobId || crypto.randomUUID());
  const now = new Date().toISOString();
  const job = {
    jobId: normalizedJobId,
    studioId,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    currentAlbumKey: null,
    currentAlbumName: '',
    storageMode: process.env.AZURE_STORAGE_CONNECTION_STRING ? 'azure' : 'smugmug-source',
    totals: {
      albumsTotal: Array.isArray(albums) ? albums.length : 0,
      albumsCompleted: 0,
      photosTotal: 0,
      photosProcessed: 0,
      photosImported: 0,
      photosSkipped: 0,
      photosFailed: 0,
    },
    albums: Array.isArray(albums)
      ? albums.map((album) => ({
          albumKey: String(album?.albumKey || ''),
          name: String(album?.name || '').trim() || 'SmugMug Album',
          status: 'pending',
          photosTotal: 0,
          photosProcessed: 0,
          photosImported: 0,
          photosSkipped: 0,
          photosFailed: 0,
        }))
      : [],
    recentPhotos: [],
    imported: [],
    error: null,
  };
  smugMugImportJobs.set(normalizedJobId, job);
  return job;
};
const touchImportJob = (job) => {
  if (!job) return;
  job.updatedAt = new Date().toISOString();
};
const pushPhotoProgress = (job, payload) => {
  if (!job) return;
  job.recentPhotos.unshift({
    timestamp: new Date().toISOString(),
    ...payload,
  });
  if (job.recentPhotos.length > 200) {
    job.recentPhotos.length = 200;
  }
  touchImportJob(job);
};
const finishImportJob = (job, updates = {}) => {
  if (!job) return;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
};

// Helper: listAlbumImages (uses fetchAllSmugMugObjects)
const listAlbumImages = async (albumKey, apiKey) => {
  const rows = await fetchAllSmugMugObjects(
    `/api/v2/album/${encodeURIComponent(albumKey)}!images?count=100&_verbosity=1`,
    apiKey,
    ['AlbumImage', 'Image']
  );
  const out = [];
  for (const image of rows) {
    if (!image?.OriginalUrl) {
      console.warn('[SMUGMUG IMPORT] Skipping image without OriginalUrl:', {
        fileName: image?.FileName || image?.Name || image?.ImageKey || image?.Key,
        availableKeys: Object.keys(image || {}),
        imageKeys: {
          SmallUrl: image?.SmallUrl,
          MediumUrl: image?.MediumUrl,
          LargeUrl: image?.LargeUrl,
          XLargeUrl: image?.XLargeUrl,
          ThumbnailUrl: image?.ThumbnailUrl,
          TinyUrl: image?.TinyUrl,
        },
      });
      continue;
    }
    const sourceUrl = image.OriginalUrl;
    const importMethod = 'OriginalUrl';
    const origDescription = image?.Caption || image?.Title || '';
    const description = `[Imported via ${importMethod}] ${origDescription}`.trim();
    console.log('[SMUGMUG IMPORT] Preparing image for import:', {
      id: image?.ImageKey || image?.Key,
      fileName: image?.FileName || image?.Name,
      sourceUrl,
      importMethod,
      Caption: image?.Caption,
      Title: image?.Title,
      OriginalUrl: image?.OriginalUrl,
    });
    out.push({
      id: image?.ImageKey || image?.Key || crypto.randomUUID(),
      fileName: image?.FileName || image?.Name || `smugmug-${Date.now()}.jpg`,
      description,
      sourceUrl,
      importMethod,
      Caption: image?.Caption,
      Title: image?.Title,
      OriginalUrl: image?.OriginalUrl,
    });
  }
  console.log(`[SMUGMUG IMPORT] Total images prepared for import: ${out.length}`);
  return out;
};

// Helper: uploadImportedImage (stub, just returns sourceUrl unless Azure is configured)
const uploadImportedImage = async (albumId, image, imageBuffer) => {
  const contentType = 'image/jpeg';
  const blobName = `albums/${albumId}/${Date.now()}-${image.fileName}`;
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return {
      url: image.sourceUrl,
      storage: 'smugmug-source',
    };
  }
  // Azure upload logic would go here
  return {
    url: image.sourceUrl,
    storage: 'azure',
  };
};

// --- POST /import ---
// PUT /config - Update SmugMug config for the current studio
router.put('/config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const studioId = req.user.studio_id || req.user.studioId || req.user.id;
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    const { nickname, apiKey, apiSecret } = req.body || {};
    if (!nickname || !apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Upsert config
    await query(
      `IF EXISTS (SELECT 1 FROM studio_smugmug_config WHERE studio_id = $1)
         UPDATE studio_smugmug_config SET nickname = $2, api_key = $3, api_secret = $4, updated_at = CURRENT_TIMESTAMP WHERE studio_id = $1
       ELSE
         INSERT INTO studio_smugmug_config (studio_id, nickname, api_key, api_secret) VALUES ($1, $2, $3, $4)`,
      [studioId, nickname, apiKey, apiSecret]
    );
    res.json({ message: 'SmugMug config updated', storageMode: 'db' });
  } catch (error) {
    console.error('SmugMug config put error:', error);
    res.status(500).json({ error: 'Failed to update SmugMug config' });
  }
});

// GET /config - Return SmugMug config for the current studio
router.get('/config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Helper to get studioId from request (reuse from smugmug.js if available)
    const studioId = req.user.studio_id || req.user.studioId || req.user.id;
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    const config = await queryRow(
      `SELECT studio_id as studioId, nickname, api_key as apiKey, api_secret as apiSecret, access_token as accessToken, access_token_secret as accessTokenSecret
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );
    res.json({
      ...(config || { studioId, nickname: '', apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '' }),
      storageMode: 'db', // or use a helper if needed
    });
  } catch (error) {
    console.error('SmugMug config get error:', error);
    res.status(500).json({ error: 'Failed to fetch SmugMug config' });
  }
});
// (Removed stray block of code that caused SyntaxError)
// --- PORTED: GET /albums ---
// Requires helpers: getStudioIdFromRequest, ensureSmugMugConfigTable, ensureSmugMugImportTable, fetchAllSmugMugObjects, normalizeAlbums, queryRow, queryRows
// These helpers are copied/adapted from smugmug.js

// Helper: getStudioIdFromRequest
const getStudioIdFromRequest = (req) => {
  if (req.user?.role === 'studio_admin') {
    return Number(req.user.studio_id) || null;
  }
  if (req.user?.role === 'super_admin') {
    return Number(req.user.acting_studio_id || req.user.studio_id) || null;
  }
  return null;
};

// Helper: ensureSmugMugImportTable
const ensureSmugMugImportTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_smugmug_imports')
    BEGIN
      CREATE TABLE studio_smugmug_imports (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
        smugmug_album_key NVARCHAR(255) NOT NULL,
        local_album_id INT NULL FOREIGN KEY REFERENCES albums(id),
        imported_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_studio_smugmug_album UNIQUE (studio_id, smugmug_album_key)
      )
    END
  `);
};

// Helper: fetchAllSmugMugObjects
const requestSmugMugJson = async (path, apiKey) => {
  const url = new URL(`https://api.smugmug.com${path}`);
  if (apiKey) {
    url.searchParams.set('APIKey', apiKey);
  }
  const headers = {
    Accept: 'application/json',
    'Accept-Version': 'v2',
  };
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SmugMug request failed (${response.status}): ${text.slice(0, 250)}`);
  }
  return response.json();
};

const fetchAllSmugMugObjects = async (initialPath, apiKey, locatorNames = []) => {
  const collected = [];
  let nextPath = initialPath;
  let page = 0;
  while (nextPath && page < 100) {
    page += 1;
    const payload = await requestSmugMugJson(nextPath, apiKey);
    const response = payload?.Response || {};
    for (const locatorName of locatorNames) {
      const rows = response?.[locatorName];
      if (Array.isArray(rows) && rows.length) {
        collected.push(...rows);
      }
    }
    nextPath = response?.Pages?.NextPage || null;
  }
  return collected;
};

// Helper: normalizeAlbums
const normalizeAlbums = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((album) => ({
      albumKey: album?.AlbumKey || album?.Key || '',
      name: album?.Name || album?.Title || 'Untitled Album',
      description: album?.Description || '',
      imageCount: Number(album?.ImageCount || 0),
      webUri: album?.WebUri || '',
    }))
    .filter((a) => a.albumKey);
};

// --- GET /albums ---
router.get('/albums', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();

    const config = await queryRow(
      `SELECT nickname, api_key as apiKey
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );

    const nickname = String(req.query.nickname || config?.nickname || '').trim();
    const apiKey = String(req.query.apiKey || config?.apiKey || process.env.SMUGMUG_API_KEY || '').trim();

    if (!nickname) {
      return res.status(400).json({ error: 'SmugMug nickname is required' });
    }

    const albumRows = await fetchAllSmugMugObjects(
      `/api/v2/user/${encodeURIComponent(nickname)}!albums?count=100`,
      apiKey,
      ['Album', 'Albums']
    );
    const albums = normalizeAlbums(albumRows);

    const importedRows = await queryRows(
      `SELECT
         smugmug_album_key as albumKey,
         local_album_id as localAlbumId,
         imported_at as importedAt
       FROM studio_smugmug_imports
       WHERE studio_id = $1`,
      [studioId]
    );

    const importedMap = new Map(
      importedRows.map((row) => [String(row.albumKey || ''), {
        localAlbumId: row.localAlbumId ? Number(row.localAlbumId) : null,
        importedAt: row.importedAt || null,
      }])
    );

    res.json({
      nickname,
      albums: albums.map((album) => {
        const imported = importedMap.get(String(album.albumKey || ''));
        return {
          ...album,
          imported: !!imported,
          localAlbumId: imported?.localAlbumId || null,
          importedAt: imported?.importedAt || null,
        };
      }),
    });
  } catch (error) {
    console.error('SmugMug albums list error:', error);
    res.status(500).json({ error: 'Failed to load SmugMug albums' });
  }
});
// Helper to ensure the studio_smugmug_token_map table exists
const ensureSmugMugTokenMapTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_smugmug_token_map')
    BEGIN
      CREATE TABLE studio_smugmug_token_map (
        id INT IDENTITY(1,1) PRIMARY KEY,
        oauth_token NVARCHAR(255) NOT NULL,
        request_token_secret NVARCHAR(255) NOT NULL,
        studio_id INT NOT NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    END
    IF COL_LENGTH('studio_smugmug_token_map', 'request_token_secret') IS NULL
      ALTER TABLE studio_smugmug_token_map ADD request_token_secret NVARCHAR(255) NULL;
    IF COL_LENGTH('studio_smugmug_token_map', 'studio_id') IS NULL
      ALTER TABLE studio_smugmug_token_map ADD studio_id INT NULL;
  `);
};

// Helper to ensure the studio_smugmug_config table exists
const ensureSmugMugConfigTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_smugmug_config')
    BEGIN
      CREATE TABLE studio_smugmug_config (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL UNIQUE FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
        nickname NVARCHAR(255) NULL,
        api_key NVARCHAR(255) NULL,
        api_secret NVARCHAR(255) NULL,
        access_token NVARCHAR(255) NULL,
        access_token_secret NVARCHAR(255) NULL,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    END
    IF COL_LENGTH('studio_smugmug_config', 'api_secret') IS NULL
      ALTER TABLE studio_smugmug_config ADD api_secret NVARCHAR(255) NULL;
    IF COL_LENGTH('studio_smugmug_config', 'access_token') IS NULL
      ALTER TABLE studio_smugmug_config ADD access_token NVARCHAR(255) NULL;
    IF COL_LENGTH('studio_smugmug_config', 'access_token_secret') IS NULL
      ALTER TABLE studio_smugmug_config ADD access_token_secret NVARCHAR(255) NULL;
  `);
};
// New SmugMug route handler for refactor, based on the original smugmug.js
// Copy of all logic, ready for isolated testing and migration

import { authRequired } from '../middleware/auth.js';
import { query, queryRow, queryRows } from '../mssql.cjs';
import * as crypto from 'crypto';
import OAuth from 'oauth-1.0a';
import dotenv from 'dotenv';
import fs from 'fs';

// Load SmugMug OAuth credentials from .env.smugmug if present
if (fs.existsSync(process.cwd() + '/.env.smugmug')) {
  dotenv.config({ path: process.cwd() + '/.env.smugmug' });
}


// POST /oauth/request-token - Initiate SmugMug OAuth 1.0a
router.post('/oauth/request-token', authRequired, async (req, res) => {
  try {
    // Only allow studio_admin or super_admin
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const studioId = req.user.studio_id || req.user.studioId || req.user.id;
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });
    await ensureSmugMugConfigTable();
    // Fetch per-studio API key/secret
    const config = await queryRow(
      `SELECT api_key as apiKey, api_secret as apiSecret FROM studio_smugmug_config WHERE studio_id = $1`,
      [studioId]
    );
    const apiKey = String(config?.apiKey || process.env.SMUGMUG_API_KEY || '').trim();
    const apiSecret = String(config?.apiSecret || process.env.SMUGMUG_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'SmugMug API key/secret not configured for this studio.' });
    }
    const callbackUrl = req.body.callbackUrl || process.env.SMUGMUG_OAUTH_CALLBACK || 'http://localhost:3004/admin/smugmug';
    const oauth = OAuth({
      consumer: { key: apiKey, secret: apiSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });
    const request_data = {
      url: 'https://api.smugmug.com/services/oauth/1.0a/getRequestToken',
      method: 'POST',
      data: { oauth_callback: callbackUrl },
    };
    const fetch = (await import('node-fetch')).default;
    const headers = oauth.toHeader(oauth.authorize(request_data));
    const params = new URLSearchParams({ oauth_callback: callbackUrl });
    const response = await fetch(request_data.url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error('[SmugMug OAuth] Failed to get request token:', {
        status: response.status,
        statusText: response.statusText,
        responseText: text,
        apiKey,
        apiSecret,
        callbackUrl,
      });
      return res.status(500).json({ error: 'Failed to get request token', details: text });
    }
    const result = Object.fromEntries(new URLSearchParams(text));
    if (!result.oauth_token) {
      console.error('[SmugMug OAuth] No oauth_token in response:', { result, text });
      return res.status(500).json({ error: 'No oauth_token in response', details: result });
    }
    // Save the request token and secret to the token map table for later lookup in the callback
    await ensureSmugMugTokenMapTable();
    await query(
      'INSERT INTO studio_smugmug_token_map (oauth_token, request_token_secret, studio_id) VALUES ($1, $2, $3)',
      [result.oauth_token, result.oauth_token_secret, studioId]
    );
    const authorizeUrl = `https://secure.smugmug.com/services/oauth/1.0a/authorize?oauth_token=${encodeURIComponent(result.oauth_token)}`;
    res.json({
      requestToken: result.oauth_token,
      requestTokenSecret: result.oauth_token_secret,
      authorizeUrl,
      callbackUrl,
    });
  } catch (error) {
    console.error('SmugMug OAuth request-token error:', error);
    res.status(500).json({ error: 'Failed to initiate SmugMug OAuth', details: error?.message });
  }
});


// --- BEGIN FULL ROUTE HANDLER CODE WITH VERBOSE LOGGING ---

// Helper to log entry/exit for all routes
router.get('/oauth/callback', async (req, res) => {
  try {
    console.log('[SmugMug OAuth] Callback hit. Query:', req.query);
    await ensureSmugMugConfigTable();

    const { oauth_token, oauth_verifier } = req.query;
    console.log('[SmugMug OAuth] Extracted params:', { oauth_token, oauth_verifier });
    if (!oauth_token || !oauth_verifier) {
      console.error('[SmugMug OAuth] Missing OAuth parameters:', req.query);
      return res.status(400).send('<h2>Missing OAuth parameters</h2>');
    }

    await ensureSmugMugTokenMapTable();
    const tokenMapRow = await queryRow(
      `SELECT request_token_secret, studio_id FROM studio_smugmug_token_map WHERE oauth_token = $1`,
      [oauth_token]
    );
    if (!tokenMapRow) {
      console.error('[SmugMug OAuth] No token map found for oauth_token:', oauth_token);
      return res.status(400).send('<h2>Could not find token mapping for oauth_token.</h2>');
    }
    const requestTokenSecret = tokenMapRow.request_token_secret;
    const studioId = tokenMapRow.studio_id;
    console.log('[SmugMug OAuth] Looked up studioId:', studioId, 'requestTokenSecret:', requestTokenSecret, 'for oauth_token:', oauth_token);

    const config = await queryRow(
      `SELECT api_key as apiKey, api_secret as apiSecret FROM studio_smugmug_config WHERE studio_id = $1`,
      [studioId]
    );
    console.log('[SmugMug OAuth] DB config:', config);
    const apiKey = String(config?.apiKey || process.env.SMUGMUG_API_KEY || '').trim();
    const apiSecret = String(config?.apiSecret || process.env.SMUGMUG_API_SECRET || '').trim();
    console.log('[SmugMug OAuth] Using apiKey:', apiKey, 'apiSecret:', apiSecret ? '[REDACTED]' : null);
    if (!apiKey || !apiSecret) {
      console.error('[SmugMug OAuth] API key/secret missing for studio', studioId);
      return res.status(400).send('<h2>SmugMug API key/secret not configured for this studio.</h2>');
    }

    const OAuth = (await import('oauth-1.0a')).default || require('oauth-1.0a');
    const oauth = OAuth({
      consumer: { key: apiKey, secret: apiSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });
    const request_data = {
      url: 'https://api.smugmug.com/services/oauth/1.0a/getAccessToken',
      method: 'POST',
      data: { oauth_token, oauth_verifier },
    };
    const fetch = (await import('node-fetch')).default;
    const token = {
      key: oauth_token,
      secret: requestTokenSecret,
    };
    const headers = oauth.toHeader(oauth.authorize(request_data, token));
    const params = new URLSearchParams({ oauth_token, oauth_verifier });
    console.log('[SmugMug OAuth] Requesting access token from SmugMug...', {
      url: request_data.url,
      headers,
      params: params.toString(),
    });
    const response = await fetch(request_data.url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });
    const text = await response.text();
    console.log('[SmugMug OAuth] Response status:', response.status, response.statusText);
    console.log('[SmugMug OAuth] Response text:', text);
    if (!response.ok) {
      console.error('[SmugMug OAuth] Failed to get access token:', {
        status: response.status,
        statusText: response.statusText,
        responseText: text,
      });
      return res.status(500).send('<h2>Failed to get access token from SmugMug.</h2>');
    }
    const result = Object.fromEntries(new URLSearchParams(text));
    await ensureSmugMugTokenMapTable();
    await query(
      'INSERT INTO studio_smugmug_token_map (oauth_token, request_token_secret, studio_id) VALUES ($1, $2, $3)',
      [result.oauth_token, result.oauth_token_secret, studioId]
    );
    console.log('[SmugMug OAuth] Parsed token result:', result);
    if (!result.oauth_token || !result.oauth_token_secret) {
      console.error('[SmugMug OAuth] No access token in response:', result);
      return res.status(500).send('<h2>No access token in response from SmugMug.</h2>');
    }
    // Store access token/secret in DB
    console.log('[SmugMug OAuth] Saving access token for studio', studioId, {
      access_token: result.oauth_token,
      access_token_secret: result.oauth_token_secret
    });
    const updateResult = await query(
      `UPDATE studio_smugmug_config SET access_token = $1, access_token_secret = $2, updated_at = CURRENT_TIMESTAMP WHERE studio_id = $3`,
      [result.oauth_token, result.oauth_token_secret, studioId]
    );
    console.log('[SmugMug OAuth] Update result:', updateResult);
    // Redirect to frontend with script to close popup and notify main window
    res.send(`
      <html><body>
      <script>
        if (window.opener) {
          window.opener.postMessage('smugmug-oauth-success', '*');
          window.close();
        } else {
          window.location = '/admin/smugmug?connected=1';
        }
      </script>
      </body></html>
    `);
  } catch (error) {
    // Enhanced error logging for debugging
    console.error('SmugMug OAuth callback error:', error && error.stack ? error.stack : error);
    res.status(500).send(`
      <h2>Failed to complete SmugMug OAuth.</h2>
      <pre>${error && error.stack ? error.stack : JSON.stringify(error, null, 2)}</pre>
    `);
  }
});

// GET /config - Return SmugMug config for the current studio
router.get('/config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Helper to get studioId from request (reuse from smugmug.js if available)
    const studioId = req.user.studio_id || req.user.studioId || req.user.id;
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    const config = await queryRow(
      `SELECT studio_id as studioId, nickname, api_key as apiKey, api_secret as apiSecret, access_token as accessToken, access_token_secret as accessTokenSecret
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );
    res.json({
      ...(config || { studioId, nickname: '', apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '' }),
      storageMode: 'db', // or use a helper if needed
    });
  } catch (error) {
    console.error('SmugMug config get error:', error);
    res.status(500).json({ error: 'Failed to fetch SmugMug config' });
  }
});

export default router;

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, queryRow, queryRows } from '../mssql.cjs';
import * as crypto from 'crypto';
const router = express.Router();
// Temporary table for mapping oauth_token to requestTokenSecret and studioId
const ensureSmugMugTokenMapTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_smugmug_token_map')
    BEGIN
      CREATE TABLE studio_smugmug_token_map (
        oauth_token NVARCHAR(255) PRIMARY KEY,
        request_token_secret NVARCHAR(255) NOT NULL,
        studio_id INT NOT NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    END
  `);
};
// --- SmugMug OAuth 1.0a Callback Endpoint ---
// NOTE: This route must NOT require authentication, as the callback from SmugMug will not have a session or JWT.
// If you need to verify the studio, use a state parameter or look up by oauth_token/requestTokenSecret.
router.get('/oauth/callback', async (req, res) => {
  try {
    console.log('[SmugMug OAuth] Callback hit. Query:', req.query);
    await ensureSmugMugConfigTable();

const { oauth_token, oauth_verifier } = req.query;
console.log('[SmugMug OAuth] Extracted params:', { oauth_token, oauth_verifier });
if (!oauth_token || !oauth_verifier) {
      console.error('[SmugMug OAuth] Missing OAuth parameters:', req.query);
      return res.status(400).json({ error: 'Missing OAuth parameters' });
    }

    // Look up studioId using the oauth_token and requestTokenSecret
    // (Assumes you stored the request token and studioId mapping when starting the OAuth flow)
    // Look up requestTokenSecret and studioId using oauth_token
await ensureSmugMugTokenMapTable();
const tokenMapRow = await queryRow(
  `SELECT request_token_secret, studio_id FROM studio_smugmug_token_map WHERE oauth_token = $1`,
  [oauth_token]
);
if (!tokenMapRow) {
  console.error('[SmugMug OAuth] No token map found for oauth_token:', oauth_token);
  return res.status(400).json({ error: 'Could not find token mapping for oauth_token.' });
}
const requestTokenSecret = tokenMapRow.request_token_secret;
const studioId = tokenMapRow.studio_id;
console.log('[SmugMug OAuth] Looked up studioId:', studioId, 'requestTokenSecret:', requestTokenSecret, 'for oauth_token:', oauth_token);



    // Get API key/secret for this studio
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
      return res.status(400).json({ error: 'SmugMug API key/secret not configured for this studio.' });
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
      return res.status(500).json({ error: 'Failed to get access token', details: text });
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
      return res.status(500).json({ error: 'No access token in response', details: result });
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
    // Optionally, redirect to admin UI with success message
    res.redirect('/admin/smugmug?connected=1');
  } catch (error) {
    console.error('SmugMug OAuth callback error:', error);
    res.status(500).json({ error: 'Failed to complete SmugMug OAuth', details: error?.message, stack: error?.stack });
  }
});

const smugMugImportJobs = new Map();
const getSmugMugStorageMode = () => (process.env.AZURE_STORAGE_CONNECTION_STRING ? 'azure' : 'smugmug-source');

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
    storageMode: getSmugMugStorageMode(),
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

const getAlbumProgress = (job, albumKey) => {
  if (!job || !albumKey) return null;
  return job.albums.find((album) => String(album.albumKey) === String(albumKey)) || null;
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

const getStudioIdFromRequest = (req) => {
  if (req.user?.role === 'studio_admin') {
    return Number(req.user.studio_id) || null;
  }
  if (req.user?.role === 'super_admin') {
    return Number(req.user.acting_studio_id || req.user.studio_id) || null;
  }
  return null;
};

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
import OAuth from 'oauth-1.0a';
import dotenv from 'dotenv';
import fs from 'fs';

// Load SmugMug OAuth credentials from .env.smugmug if present
if (fs.existsSync(process.cwd() + '/.env.smugmug')) {
  dotenv.config({ path: process.cwd() + '/.env.smugmug' });
}

const SMUGMUG_API_KEY = process.env.SMUGMUG_API_KEY;
const SMUGMUG_API_SECRET = process.env.SMUGMUG_API_SECRET;

// --- SmugMug OAuth 1.0a Initiation Endpoint ---
router.post('/oauth/request-token', authRequired, async (req, res) => {
  try {
    // Only allow studio_admin or super_admin
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const studioId = getStudioIdFromRequest(req);
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

const requestSmugMugJson = async (path, apiKey) => {
  const url = new URL(`https://api.smugmug.com${path}`);
  if (apiKey) {
    url.searchParams.set('APIKey', apiKey);
  }

  const headers = {
    Accept: 'application/json',
    'Accept-Version': 'v2',
  };

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

const pickBestImageUrl = (image) => {
  const direct = [
    image?.OriginalUrl,
    image?.LargestVideoUrl,
    image?.X5LargeUrl,
    image?.X4LargeUrl,
    image?.X3LargeUrl,
    image?.X2LargeUrl,
    image?.XLargeUrl,
    image?.LargeUrl,
    image?.MediumUrl,
    image?.SmallUrl,
    image?.ThumbnailUrl,
    image?.Url,
  ].find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));

  if (direct) return direct;
  return null;
};

const pickLargestFromImageSizes = (sizes) => {
  if (!Array.isArray(sizes) || !sizes.length) return null;

  const withUrl = sizes
    .map((size) => {
      const url = [
        size?.OriginalUrl,
        size?.Url,
        size?.UrlTemplate,
        size?.Uri,
      ].find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
      const width = Number(size?.Width || 0);
      const height = Number(size?.Height || 0);
      const area = width > 0 && height > 0 ? width * height : 0;
      const label = String(size?.Label || size?.Key || '').toLowerCase();
      return { url, area, label };
    })
    .filter((row) => row.url);

  if (!withUrl.length) return null;

  const explicitOriginal = withUrl.find((row) => row.label === 'original');
  if (explicitOriginal?.url) {
    return explicitOriginal.url;
  }

  withUrl.sort((a, b) => b.area - a.area);
  return withUrl[0]?.url || null;
};

const resolveSmugMugSourceUrl = async (image, apiKey) => {
  const directOriginal = typeof image?.OriginalUrl === 'string' && /^https?:\/\//i.test(image.OriginalUrl)
    ? image.OriginalUrl
    : null;
  if (directOriginal) {
    return { sourceUrl: directOriginal, urlType: 'OriginalUrl' };
  }

  const detailUris = [
    image?.Uri,
    image?.ArchivedUri,
  ].filter((uri, index, arr) => typeof uri === 'string' && uri.startsWith('/api/v2/') && arr.indexOf(uri) === index);

  for (const uri of detailUris) {
    try {
      const imagePayload = await requestSmugMugJson(uri, apiKey);
      const nested = imagePayload?.Response?.Image || imagePayload?.Response || {};

      if (typeof nested?.OriginalUrl === 'string' && /^https?:\/\//i.test(nested.OriginalUrl)) {
        return { sourceUrl: nested.OriginalUrl, urlType: `detail:${uri}:OriginalUrl` };
      }

      const nestedBest = pickBestImageUrl(nested);
      if (nestedBest) {
        return { sourceUrl: nestedBest, urlType: `detail:${uri}:best` };
      }

      const sizesUri = nested?.Uris?.ImageSizes?.Uri;
      if (typeof sizesUri === 'string' && sizesUri.startsWith('/api/v2/')) {
        const sizesPayload = await requestSmugMugJson(sizesUri, apiKey);
        const sizeRows = sizesPayload?.Response?.ImageSizes || sizesPayload?.Response?.ImageSize || [];
        const largestUrl = pickLargestFromImageSizes(sizeRows);
        if (largestUrl) {
          return { sourceUrl: largestUrl, urlType: `sizes:${sizesUri}` };
        }
      }
    } catch {
      // ignore per-image failures and continue to next strategy
    }
  }

  const topLevelSizesUri = image?.Uris?.ImageSizes?.Uri;
  if (typeof topLevelSizesUri === 'string' && topLevelSizesUri.startsWith('/api/v2/')) {
    try {
      const sizesPayload = await requestSmugMugJson(topLevelSizesUri, apiKey);
      const sizeRows = sizesPayload?.Response?.ImageSizes || sizesPayload?.Response?.ImageSize || [];
      const largestUrl = pickLargestFromImageSizes(sizeRows);
      if (largestUrl) {
        return { sourceUrl: largestUrl, urlType: `sizes:${topLevelSizesUri}` };
      }
    } catch {
      // ignore and fall back
    }
  }

  const fallback = pickBestImageUrl(image);
  if (fallback) {
    return { sourceUrl: fallback, urlType: 'fallback-best' };
  }

  return { sourceUrl: null, urlType: 'none' };
};

const listAlbumImages = async (albumKey, apiKey) => {
  const rows = await fetchAllSmugMugObjects(
    `/api/v2/album/${encodeURIComponent(albumKey)}!images?count=100&_verbosity=1`,
    apiKey,
    ['AlbumImage', 'Image']
  );

  const out = [];
  for (const image of rows) {
    const { sourceUrl, urlType } = await resolveSmugMugSourceUrl(image, apiKey);
    if (!sourceUrl) continue;
    // Log which URL is used for import
    console.log(`[SmugMug Import] Album ${albumKey} - Image ${image?.FileName || image?.Name}: Using ${urlType} (${sourceUrl})`);
    out.push({
      id: image?.ImageKey || image?.Key || crypto.randomUUID(),
      fileName: image?.FileName || image?.Name || `smugmug-${Date.now()}.jpg`,
      description: image?.Caption || image?.Title || '',
      sourceUrl,
    });
  }
  return out;
};

const makeBlobName = (albumId, originalName) => {
  const safe = String(originalName || 'smugmug-image').replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = Date.now();
  const random = crypto.randomBytes(6).toString('hex');
  return `albums/${albumId}/${stamp}-${random}-${safe}`;
};

const uploadImportedImage = async (albumId, image, imageBuffer) => {
  const contentType = 'image/jpeg';
  const blobName = makeBlobName(albumId, image.fileName);

  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return {
      url: image.sourceUrl,
      storage: 'smugmug-source',
    };
  }

  const uploadedUrl = await uploadImageBufferToAzure(imageBuffer, blobName, contentType);
  return {
    url: uploadedUrl,
    storage: 'azure',
  };
};

router.get('/config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();
    const config = await queryRow(
      `SELECT studio_id as studioId, nickname, api_key as apiKey, api_secret as apiSecret, access_token as accessToken, access_token_secret as accessTokenSecret
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );
    console.log('[SmugMug Config] Returning config for studio', studioId, {
      accessToken: config?.accessToken,
      accessTokenSecret: config?.accessTokenSecret,
      nickname: config?.nickname,
      apiKey: config?.apiKey
    });
    res.json({
      ...(config || { studioId, nickname: '', apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '' }),
      storageMode: getSmugMugStorageMode(),
    });
  } catch (error) {
    console.error('SmugMug config get error:', error);
    res.status(500).json({ error: 'Failed to fetch SmugMug config' });
  }
});

router.put('/config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    const nickname = String(req.body?.nickname || '').trim();
    const apiKey = String(req.body?.apiKey || '').trim();
    const apiSecret = String(req.body?.apiSecret || '').trim();

    await ensureSmugMugConfigTable();

    await query(
      `IF EXISTS (SELECT 1 FROM studio_smugmug_config WHERE studio_id = $1)
       BEGIN
         UPDATE studio_smugmug_config
         SET nickname = $2,
             api_key = $3,
             api_secret = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE studio_id = $1
       END
       ELSE
       BEGIN
         INSERT INTO studio_smugmug_config (studio_id, nickname, api_key, api_secret)
         VALUES ($1, $2, $3, $4)
       END`,
      [studioId, nickname || null, apiKey || null, apiSecret || null]
    );

    res.json({ studioId, nickname, apiKey, apiSecret, storageMode: getSmugMugStorageMode() });
  } catch (error) {
    console.error('SmugMug config save error:', error);
    res.status(500).json({ error: 'Failed to save SmugMug config' });
  }
});

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

router.post('/import', authRequired, async (req, res) => {
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

    const nickname = String(req.body?.nickname || config?.nickname || '').trim();
    const apiKey = String(config?.apiKey || process.env.SMUGMUG_API_KEY || '').trim();
    const selectedAlbums = Array.isArray(req.body?.albums) ? req.body.albums : [];
    const requestedJobId = String(req.body?.jobId || '').trim();

    if (!nickname) {
      return res.status(400).json({ error: 'SmugMug nickname is required' });
    }

    if (!selectedAlbums.length) {
      return res.status(400).json({ error: 'Select at least one album to import' });
    }

    const importJob = createImportJob({
      jobId: requestedJobId,
      studioId,
      albums: selectedAlbums,
    });

    const imported = [];

    for (const selected of selectedAlbums) {
      const albumKey = String(selected?.albumKey || '').trim();
      const albumName = String(selected?.name || '').trim() || 'SmugMug Album';
      const albumDescription = String(selected?.description || '').trim() || null;
            // ...existing code...

      let album = null;
      if (existingImport?.localAlbumId) {
        album = await queryRow(
          `SELECT id
           FROM albums
           WHERE id = $1 AND studio_id = $2`,
          [existingImport.localAlbumId, studioId]
        );
      }

      if (!album) {
        album = await queryRow(
          `SELECT id
           FROM albums
           WHERE studio_id = $1 AND COALESCE(name, title) = $2`,
          [studioId, albumName]
        );
      }

      if (!album) {
        const created = await queryRow(
          `INSERT INTO albums (name, title, description, studio_id, category)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [albumName, albumName, albumDescription, studioId, 'SmugMug']
        );
        album = { id: created.id };
      }

      const albumId = Number(album.id);
      const images = await listAlbumImages(albumKey, apiKey);

      if (albumProgress) {
        albumProgress.status = 'importing';
        albumProgress.photosTotal = images.length;
      }
      importJob.totals.photosTotal += images.length;
      touchImportJob(importJob);

      let importedPhotoCount = 0;
      for (const image of images) {
        const exists = await queryRow(
          'SELECT TOP 1 id FROM photos WHERE album_id = $1 AND file_name = $2',
          [albumId, image.fileName]
        );
        if (exists) {
          importJob.totals.photosProcessed += 1;
          importJob.totals.photosSkipped += 1;
          if (albumProgress) {
            albumProgress.photosProcessed += 1;
            albumProgress.photosSkipped += 1;
          }
          pushPhotoProgress(importJob, {
            albumKey,
            albumName,
            fileName: image.fileName,
            status: 'skipped',
            detail: 'Already imported',
          });
          continue;
        }

        let imageBuffer;
        let width = null;
        let height = null;
        try {
          const response = await fetch(image.sourceUrl);
          if (!response.ok) {
            importJob.totals.photosProcessed += 1;
            importJob.totals.photosFailed += 1;
            if (albumProgress) {
              albumProgress.photosProcessed += 1;
              albumProgress.photosFailed += 1;
            }
            pushPhotoProgress(importJob, {
              albumKey,
              albumName,
              fileName: image.fileName,
              status: 'failed',
              detail: `Download failed (${response.status})`,
            });
            continue;
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);

          // Log imageBuffer size and image dimensions
          try {
            const sharp = await import('sharp');
            const metadata = await sharp.default(imageBuffer).metadata();
            width = metadata.width;
            height = metadata.height;
          } catch (metaErr) {
            console.warn('Failed to get image dimensions:', metaErr);
          }
          console.log(`SmugMug import: fileName=${image.fileName}, bufferSize=${imageBuffer.length}, width=${width}, height=${height}`);
        } catch (error) {
          importJob.totals.photosProcessed += 1;
          importJob.totals.photosFailed += 1;
          if (albumProgress) {
            albumProgress.photosProcessed += 1;
            albumProgress.photosFailed += 1;
          }
          pushPhotoProgress(importJob, {
            albumKey,
            albumName,
            fileName: image.fileName,
            status: 'failed',
            detail: error instanceof Error ? error.message : 'Download failed',
          });
          continue;
        }

        const uploadedImage = await uploadImportedImage(albumId, image, imageBuffer);

        await query(
          `INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, file_size_bytes, width, height)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            albumId,
            image.fileName,
            uploadedImage.url,
            uploadedImage.url,
            image.description || '',
            JSON.stringify({
              source: 'smugmug',
              smugmugImageId: image.id,
              importedAt: new Date().toISOString(),
              storage: uploadedImage.storage,
              originalSourceUrl: image.sourceUrl,
            }),
            imageBuffer.length,
            width,
            height,
          ]
        );

        importJob.totals.photosProcessed += 1;
        importJob.totals.photosImported += 1;
        if (albumProgress) {
          albumProgress.photosProcessed += 1;
          albumProgress.photosImported += 1;
        }
        pushPhotoProgress(importJob, {
          albumKey,
          albumName,
          fileName: image.fileName,
          status: 'imported',
          detail: uploadedImage.storage === 'azure' ? 'Imported successfully' : 'Imported using SmugMug source URL',
        });
        importedPhotoCount += 1;
      }

      await query(
        `UPDATE albums
         SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
         WHERE id = $1`,
        [albumId]
      );

      await query(
        `IF EXISTS (SELECT 1 FROM studio_smugmug_imports WHERE studio_id = $1 AND smugmug_album_key = $2)
         BEGIN
           UPDATE studio_smugmug_imports
           SET local_album_id = $3,
               imported_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE studio_id = $1 AND smugmug_album_key = $2
         END
         ELSE
         BEGIN
           INSERT INTO studio_smugmug_imports (studio_id, smugmug_album_key, local_album_id)
           VALUES ($1, $2, $3)
         END`,
        [studioId, albumKey, albumId]
      );

      imported.push({
        albumId,
        albumKey,
        name: albumName,
        importedPhotoCount,
      });

      importJob.totals.albumsCompleted += 1;
      if (albumProgress) {
        albumProgress.status = 'completed';
      }
      importJob.imported = imported;
      touchImportJob(importJob);
    }

    finishImportJob(importJob, {
      status: 'completed',
      currentAlbumKey: null,
      currentAlbumName: '',
      imported,
    });

    res.json({
      message: 'SmugMug import complete',
      jobId: importJob.jobId,
      storageMode: importJob.storageMode,
      imported,
    });
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
export default router;

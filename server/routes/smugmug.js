import express from 'express';
import { authRequired, adminRequired } from '../middleware/auth.js';
import * as crypto from 'crypto';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';
const router = express.Router();

// MSSQL dynamic import helper
let query, queryRow, queryRows;
const loadMssql = async () => {
  if (!query || !queryRow || !queryRows) {
    const mssqlModule = await import('../mssql.cjs');
    const mssql = mssqlModule?.default || mssqlModule;
    query = mssql.query;
    queryRow = mssql.queryRow;
    queryRows = mssql.queryRows;
  }
};
// Temporary table for mapping oauth_token to requestTokenSecret and studioId
const ensureSmugMugTokenMapTable = async () => {
  await loadMssql();
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
// Removed duplicate and incomplete router.get('/oauth/callback') block
router.get('/oauth/callback', async (req, res) => {
  try {
    await loadMssql();
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

    const apiKey = String(process.env.SMUGMUG_API_KEY || '').trim();
    const apiSecret = String(process.env.SMUGMUG_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) {
      console.error('[SmugMug OAuth] SMUGMUG_API_KEY/SMUGMUG_API_SECRET env vars not set');
      return res.status(400).json({ error: 'SmugMug API key/secret not configured.' });
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
      `IF EXISTS (SELECT 1 FROM studio_smugmug_config WHERE studio_id = $3)
         UPDATE studio_smugmug_config SET access_token = $1, access_token_secret = $2, updated_at = CURRENT_TIMESTAMP WHERE studio_id = $3
       ELSE
         INSERT INTO studio_smugmug_config (studio_id, access_token, access_token_secret, updated_at) VALUES ($3, $1, $2, CURRENT_TIMESTAMP)`,
      [result.oauth_token, result.oauth_token_secret, studioId]
    );
    console.log('[SmugMug OAuth] Upsert result:', updateResult);
    await query(
      `DELETE FROM studio_smugmug_token_map
       WHERE oauth_token = $1`,
      [oauth_token]
    );

    // Auto-fetch and store the authenticated user's nickname
    try {
      const authuserOauth = OAuth({
        consumer: { key: apiKey, secret: apiSecret },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
          return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
      });
      const authuserContext = {
        oauth: authuserOauth,
        token: { key: result.oauth_token, secret: result.oauth_token_secret },
      };
      const userPayload = await requestSmugMugJson('/api/v2!authuser', apiKey, authuserContext);
      const nickname = userPayload?.Response?.User?.NickName || '';
      if (nickname) {
        await query(
          `UPDATE studio_smugmug_config SET nickname = $1 WHERE studio_id = $2`,
          [nickname, studioId]
        );
        console.log('[SmugMug OAuth] Saved nickname for studio', studioId, nickname);
      }
    } catch (nickErr) {
      console.error('[SmugMug OAuth] Failed to fetch nickname (non-fatal):', nickErr?.message);
    }

    res.redirect('/admin/smugmug?connected=1');
  } catch (error) {
    console.error('SmugMug OAuth callback error:', error);
    res.status(500).json({ error: 'Failed to complete SmugMug OAuth', details: error?.message, stack: error?.stack });
  }
});
// Removed stray/duplicate code after /oauth/callback handler

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

const smugMugImportJobs = new Map();

const createImportJob = ({ jobId, studioId, albums }) => {
  const normalizedJobId = String(jobId || crypto.randomUUID());
  const selectedAlbums = Array.isArray(albums) ? albums : [];
  const now = new Date().toISOString();
  const hasAzureStorage = (
    !!String(process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim()
    || (
      !!String(process.env.AZURE_STORAGE_ACCOUNT || '').trim()
      && !!String(process.env.AZURE_STORAGE_KEY || '').trim()
    )
  ) && !!String(process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_CONTAINER_NAME || '').trim();

  const job = {
    jobId: normalizedJobId,
    studioId,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    currentAlbumKey: null,
    currentAlbumName: '',
    storageMode: hasAzureStorage ? 'azure' : 'smugmug-source',
    totals: {
      albumsTotal: selectedAlbums.length,
      albumsCompleted: 0,
      photosTotal: 0,
      photosProcessed: 0,
      photosImported: 0,
      photosSkipped: 0,
      photosFailed: 0,
    },
    albums: selectedAlbums.map((album) => ({
      albumKey: String(album?.albumKey || '').trim(),
      name: String(album?.name || '').trim() || 'SmugMug Album',
      status: 'pending',
      photosTotal: 0,
      photosProcessed: 0,
      photosImported: 0,
      photosSkipped: 0,
      photosFailed: 0,
    })),
    recentPhotos: [],
    imported: [],
    error: null,
  };

  smugMugImportJobs.set(job.jobId, job);
  return job;
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
  await loadMssql();
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
router.post('/oauth/request-token', adminRequired, async (req, res) => {
  try {
    // Only allow studio_admin or super_admin
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });
    await ensureSmugMugConfigTable();
    const apiKey = String(process.env.SMUGMUG_API_KEY || '').trim();
    const apiSecret = String(process.env.SMUGMUG_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'SmugMug API key/secret not configured.' });
    }
    const callbackUrl = req.body.callbackUrl
      || process.env.SMUGMUG_OAUTH_CALLBACK
      || `${req.protocol}://${req.get('host')}/api/smugmug/oauth/callback`;
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
        callbackUrl,
      });
      return res.status(500).json({ error: 'Failed to get request token', details: text });
    }
    const result = Object.fromEntries(new URLSearchParams(text));
    if (!result.oauth_token) {
      console.error('[SmugMug OAuth] No oauth_token in response:', { result, text });
      return res.status(500).json({ error: 'No oauth_token in response', details: result });
    }

    await ensureSmugMugTokenMapTable();
    await query(
      `IF EXISTS (SELECT 1 FROM studio_smugmug_token_map WHERE oauth_token = $1)
       BEGIN
         UPDATE studio_smugmug_token_map
         SET request_token_secret = $2,
             studio_id = $3,
             created_at = CURRENT_TIMESTAMP
         WHERE oauth_token = $1
       END
       ELSE
       BEGIN
         INSERT INTO studio_smugmug_token_map (oauth_token, request_token_secret, studio_id)
         VALUES ($1, $2, $3)
       END`,
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

const requestSmugMugJson = async (path, apiKey, authContext = null) => {
  const url = new URL(`https://api.smugmug.com${path}`);
  if (apiKey) {
    url.searchParams.set('APIKey', apiKey);
  }

  const headers = {
    Accept: 'application/json',
    'Accept-Version': 'v2',
  };

  if (authContext?.oauth && authContext?.token?.key && authContext?.token?.secret) {
    const signed = authContext.oauth.toHeader(
      authContext.oauth.authorize(
        {
          url: url.toString(),
          method: 'GET',
        },
        authContext.token
      )
    );
    Object.assign(headers, signed);
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SmugMug request failed (${response.status}): ${text.slice(0, 250)}`);
  }
  return response.json();
};

const fetchAllSmugMugObjects = async (initialPath, apiKey, locatorNames = [], authContext = null) => {
  const collected = [];
  let nextPath = initialPath;
  let page = 0;

  while (nextPath && page < 100) {
    page += 1;
    const payload = await requestSmugMugJson(nextPath, apiKey, authContext);
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

const isThumbnailLikeUrl = (url) => {
  const value = String(url || '');
  return /\/Th\//i.test(value)
    || /\/Ti\//i.test(value)
    || /-Th\./i.test(value)
    || /-Ti\./i.test(value);
};

const isHttpUrl = (value) => (
  typeof value === 'string' && /^https?:\/\//i.test(value)
);

const scoreImageUrl = (url) => {
  const value = String(url || '');
  let score = 0;
  if (/\/O\//i.test(value) || /original/i.test(value)) score += 80;
  if (/\/X6\//i.test(value) || /\/X5\//i.test(value)) score += 60;
  if (/\/5K\//i.test(value) || /\/4K\//i.test(value) || /\/3K\//i.test(value)) score += 50;
  if (/\/X4\//i.test(value) || /\/X3\//i.test(value) || /\/X2\//i.test(value)) score += 40;
  if (/\/XL\//i.test(value) || /\/L\//i.test(value) || /large/i.test(value)) score += 30;
  if (/archive/i.test(value)) score += 20;
  if (isThumbnailLikeUrl(value)) score -= 200;
  return score;
};

const collectHttpUrls = (value, seen = new WeakSet(), depth = 0) => {
  if (depth > 5 || value == null) return [];
  if (typeof value === 'string') {
    return isHttpUrl(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectHttpUrls(item, seen, depth + 1));
  }
  if (typeof value !== 'object') {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  const out = [];
  for (const key of Object.keys(value)) {
    const nested = value[key];
    if (isHttpUrl(nested)) {
      out.push(nested);
      continue;
    }
    out.push(...collectHttpUrls(nested, seen, depth + 1));
  }
  return out;
};

const pickBestCandidateUrl = (urls) => {
  const unique = Array.from(new Set((Array.isArray(urls) ? urls : []).filter(isHttpUrl)));
  if (!unique.length) return null;

  const sorted = unique.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
  return sorted.find((url) => !isThumbnailLikeUrl(url)) || null;
};

const pickBestImageUrl = (image) => {
  const direct = [
    image?.OriginalUrl,
    image?.ArchiveUrl,
    image?.X6LargeUrl,
    image?.LargestVideoUrl,
    image?.X5LargeVideoUrl,
    image?.X5LargeUrl,
    image?.X4LargeUrl,
    image?.FiveKUrl,
    image?.FourKUrl,
    image?.ThreeKUrl,
    image?.X3LargeUrl,
    image?.X2LargeUrl,
    image?.XLargeUrl,
    image?.LargeUrl,
    image?.LargestImageUrl,
    image?.DownloadUrl,
    image?.Url,
  ].find((value) => isHttpUrl(value));

  if (direct) return direct;
  return null;
};

const pickLargestFromImageSizes = (sizes) => {
  const normalized = Array.isArray(sizes)
    ? sizes
    : (sizes && typeof sizes === 'object' ? Object.values(sizes) : []);
  if (!normalized.length) return null;

  const withUrl = normalized
    .map((size) => {
      const url = [
        size?.OriginalUrl,
        size?.Url,
        size?.MediaUri,
        size?.Cdn,
      ].find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
      const width = Number(size?.Width || 0);
      const height = Number(size?.Height || 0);
      const area = width > 0 && height > 0 ? width * height : 0;
      const label = String(size?.Label || size?.Key || size?.Name || '').toLowerCase();
      const labelScore =
        label === 'original' ? 100
          : /x6|x5|5k|4k|3k/.test(label) ? 80
            : /x4|x3|x2/.test(label) ? 60
              : /xl|large/.test(label) ? 40
                : /thumbnail|thumb|ti|th/.test(label) ? -100
                  : 0;
      return { url, area, label, labelScore };
    })
    .filter((row) => row.url);

  if (!withUrl.length) return null;

  const explicitOriginal = withUrl.find((row) => row.label === 'original');
  if (explicitOriginal?.url) {
    return explicitOriginal.url;
  }

  withUrl.sort((a, b) => {
    if (b.labelScore !== a.labelScore) return b.labelScore - a.labelScore;
    if (b.area !== a.area) return b.area - a.area;
    return scoreImageUrl(b.url) - scoreImageUrl(a.url);
  });
  return withUrl[0]?.url || null;
};

const pickOriginalFromImageSizes = (sizes) => {
  const normalized = Array.isArray(sizes)
    ? sizes
    : (sizes && typeof sizes === 'object' ? Object.values(sizes) : []);
  if (!normalized.length) return null;

  const withUrl = normalized
    .map((size) => {
      const url = [
        size?.OriginalUrl,
        size?.Url,
        size?.MediaUri,
        size?.Cdn,
      ].find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
      const label = String(size?.Label || size?.Key || size?.Name || '').toLowerCase();
      return { url, label };
    })
    .filter((row) => row.url);

  if (!withUrl.length) return null;

  const explicitOriginal = withUrl.find((row) => /original/.test(row.label));
  if (explicitOriginal?.url) {
    return explicitOriginal.url;
  }

  return null;
};

const extractSizeRows = (response) => {
  // SmugMug !sizedetails returns: { ImageSizeDetails: { ImageSizeOriginal: { Url, Width, Height, ... }, ImageSizeLarge: {...}, ... } }
  // Each key's value IS a size row. We collect all values.
  const candidate = response?.ImageSizeDetails
    || response?.ImageSizes
    || response?.ImageSize
    || [];
  if (Array.isArray(candidate)) return candidate;
  if (candidate && typeof candidate === 'object') {
    return Object.entries(candidate).map(([key, val]) => {
      // Attach the key as a Label/Name so scoring can identify 'original'
      if (val && typeof val === 'object' && !val.Label && !val.Name) {
        return { ...val, Name: key };
      }
      return val;
    }).filter(Boolean);
  }
  return [];
};

const resolveSmugMugSourceUrl = async (image, apiKey, authContext = null) => {
  const directOriginal = isHttpUrl(image?.OriginalUrl)
    ? image.OriginalUrl
    : null;
  if (directOriginal) {
    return { sourceUrl: directOriginal, urlType: 'OriginalUrl' };
  }

  const directArchive = isHttpUrl(image?.ArchiveUrl)
    ? image.ArchiveUrl
    : null;
  if (directArchive) {
    return { sourceUrl: directArchive, urlType: 'ArchiveUrl' };
  }

  // SmugMug watermarks are usually applied to display/derived sizes. Prefer strict original-only
  // resolution when the image indicates Watermark is enabled.
  const strictOriginalOnly = !!image?.Watermark;

  const largestImageUris = [
    image?.Uris?.LargestImage?.Uri,
    image?.Uri ? `${String(image.Uri).replace(/\/+$/, '')}!largestimage` : null,
    image?.ImageUri ? `${String(image.ImageUri).replace(/\/+$/, '')}!largestimage` : null,
    image?.ImageKey ? `/api/v2/image/${encodeURIComponent(image.ImageKey)}!largestimage` : null,
    image?.Key ? `/api/v2/image/${encodeURIComponent(image.Key)}!largestimage` : null,
  ].filter((uri, index, arr) => typeof uri === 'string' && uri.startsWith('/api/v2/') && arr.indexOf(uri) === index);

  for (const largestUri of largestImageUris) {
    if (strictOriginalOnly) {
      continue;
    }
    try {
      const largestPayload = await requestSmugMugJson(largestUri, apiKey, authContext);
      const largestResponse = largestPayload?.Response || {};
      const largestCandidates = [
        largestResponse?.LargestImage?.Url,
        largestResponse?.LargestImage?.OriginalUrl,
        largestResponse?.Image?.Url,
        largestResponse?.Image?.OriginalUrl,
      ];
      const largestUrl = pickBestCandidateUrl([
        ...largestCandidates,
        ...collectHttpUrls(largestResponse),
      ]);
      if (largestUrl) {
        return { sourceUrl: largestUrl, urlType: `largest:${largestUri}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (/SmugMug request failed \(401\)/i.test(message)) {
        throw error;
      }
      // ignore non-auth errors and continue with other strategies
    }
  }

  const detailUris = [
    image?.Uri,
    image?.ImageUri,
    image?.ArchivedUri,
    image?.Uris?.Image?.Uri,
    image?.Uris?.LargestImage?.Uri,
    image?.Uris?.ImageDownload?.Uri,
    image?.ImageKey ? `/api/v2/image/${encodeURIComponent(image.ImageKey)}` : null,
    image?.ImageKey ? `/api/v2/image/${encodeURIComponent(image.ImageKey)}!sizes` : null,
    image?.Key ? `/api/v2/image/${encodeURIComponent(image.Key)}` : null,
    image?.Key ? `/api/v2/image/${encodeURIComponent(image.Key)}!sizes` : null,
  ].filter((uri, index, arr) => typeof uri === 'string' && uri.startsWith('/api/v2/') && arr.indexOf(uri) === index);

  for (const uri of detailUris) {
    try {
      const imagePayload = await requestSmugMugJson(uri, apiKey, authContext);
      const nested = imagePayload?.Response?.Image || imagePayload?.Response?.AlbumImage || imagePayload?.Response || {};

      if (isHttpUrl(nested?.OriginalUrl)) {
        return { sourceUrl: nested.OriginalUrl, urlType: `detail:${uri}:OriginalUrl` };
      }

      if (isHttpUrl(nested?.ArchiveUrl)) {
        return { sourceUrl: nested.ArchiveUrl, urlType: `detail:${uri}:ArchiveUrl` };
      }

      const nestedStrictOriginalOnly = strictOriginalOnly || !!nested?.Watermark;

      const sizeUris = [
        nested?.Uris?.ImageSizeDetails?.Uri,
        nested?.Uris?.ImageSizes?.Uri,
      ].filter((value, index, arr) => typeof value === 'string' && value.startsWith('/api/v2/') && arr.indexOf(value) === index);

      for (const sizesUri of sizeUris) {
        const sizesPayload = await requestSmugMugJson(sizesUri, apiKey, authContext);
        const sizeRows = extractSizeRows(sizesPayload?.Response || {});
        const selectedUrl = nestedStrictOriginalOnly
          ? pickOriginalFromImageSizes(sizeRows)
          : pickLargestFromImageSizes(sizeRows);
        if (selectedUrl) {
          return {
            sourceUrl: selectedUrl,
            urlType: nestedStrictOriginalOnly ? `sizes-original:${sizesUri}` : `sizes:${sizesUri}`,
          };
        }
      }

      if (nestedStrictOriginalOnly) {
        continue;
      }

      const nestedBest = pickBestImageUrl(nested);
      if (nestedBest) {
        return { sourceUrl: nestedBest, urlType: `detail:${uri}:best` };
      }

      const discoveredNestedUrl = pickBestCandidateUrl(collectHttpUrls(nested));
      if (discoveredNestedUrl) {
        return { sourceUrl: discoveredNestedUrl, urlType: `detail:${uri}:discovered` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (/SmugMug request failed \(401\)/i.test(message)) {
        throw error;
      }
      // ignore non-auth per-image failures and continue to next strategy
    }
  }

  const topLevelSizeUris = [
    image?.Uris?.ImageSizeDetails?.Uri,
    image?.Uris?.ImageSizes?.Uri,
    image?.ImageKey ? `/api/v2/image/${encodeURIComponent(image.ImageKey)}!sizedetails` : null,
    image?.ImageKey ? `/api/v2/image/${encodeURIComponent(image.ImageKey)}!sizes` : null,
    image?.Key ? `/api/v2/image/${encodeURIComponent(image.Key)}!sizedetails` : null,
    image?.Key ? `/api/v2/image/${encodeURIComponent(image.Key)}!sizes` : null,
  ].filter((value, index, arr) => typeof value === 'string' && value.startsWith('/api/v2/') && arr.indexOf(value) === index);

  for (const topLevelSizesUri of topLevelSizeUris) {
    try {
      const sizesPayload = await requestSmugMugJson(topLevelSizesUri, apiKey, authContext);
      const sizeRows = extractSizeRows(sizesPayload?.Response || {});
      const selectedUrl = strictOriginalOnly
        ? pickOriginalFromImageSizes(sizeRows)
        : pickLargestFromImageSizes(sizeRows);
      if (selectedUrl) {
        return {
          sourceUrl: selectedUrl,
          urlType: strictOriginalOnly ? `sizes-original:${topLevelSizesUri}` : `sizes:${topLevelSizesUri}`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (/SmugMug request failed \(401\)/i.test(message)) {
        throw error;
      }
      // ignore non-auth and fall back
    }
  }

  if (strictOriginalOnly) {
    return { sourceUrl: null, urlType: 'watermark-no-original' };
  }

  const fallback = pickBestImageUrl(image);
  if (fallback && !isThumbnailLikeUrl(fallback)) {
    return { sourceUrl: fallback, urlType: 'fallback-best' };
  }

  const discoveredTopLevelUrl = pickBestCandidateUrl(collectHttpUrls(image));
  if (discoveredTopLevelUrl) {
    return { sourceUrl: discoveredTopLevelUrl, urlType: 'fallback-discovered' };
  }

  return { sourceUrl: null, urlType: 'none' };
};

const listAlbumImages = async (albumKey, apiKey, authContext = null) => {
  let rows = [];

  const albumPayload = await requestSmugMugJson(`/api/v2/album/${encodeURIComponent(albumKey)}`, apiKey, authContext);
  const albumImagesUri = albumPayload?.Response?.Album?.Uris?.AlbumImages?.Uri;

  const albumImagesPath = typeof albumImagesUri === 'string' && albumImagesUri.startsWith('/api/v2/')
    ? `${albumImagesUri}${albumImagesUri.includes('?') ? '&' : '?'}count=100&_verbosity=2`
    : `/api/v2/album/${encodeURIComponent(albumKey)}!images?count=100&_verbosity=2`;

  rows = await fetchAllSmugMugObjects(
    albumImagesPath,
    apiKey,
    ['AlbumImage', 'Image'],
    authContext
  );

  const out = [];
  for (const imageRow of rows) {
    const image = imageRow?.Image || imageRow;
    const fileName = image?.FileName || image?.Name || '(unknown)';
    let sourceUrl = null;
    let urlType = 'none';
    try {
      const result = await resolveSmugMugSourceUrl(image, apiKey, authContext);
      sourceUrl = result.sourceUrl;
      urlType = result.urlType;
    } catch (err) {
      continue;
    }

    if (!sourceUrl) {
      continue;
    }

    if (isThumbnailLikeUrl(sourceUrl)) {
      continue;
    }
    out.push({
      id: image?.ImageKey || image?.Key || crypto.randomUUID(),
      fileName,
      description: image?.Caption || image?.Title || '',
      sourceUrl,
      sourceUrlType: urlType,
    });
  }
  return out;
};

const getAlbumCoverImageKey = async (albumKey, apiKey, authContext = null) => {
  try {
    const albumPayload = await requestSmugMugJson(`/api/v2/album/${encodeURIComponent(albumKey)}`, apiKey, authContext);
    const album = albumPayload?.Response?.Album || {};

    const directCandidates = [
      album?.HighlightImage?.ImageKey,
      album?.HighlightImage?.Key,
      album?.HighlightImageKey,
      album?.CoverImage?.ImageKey,
      album?.CoverImage?.Key,
    ].map((v) => String(v || '').trim()).filter(Boolean);

    if (directCandidates.length) {
      return directCandidates[0];
    }

    const highlightUri = album?.Uris?.HighlightImage?.Uri;
    if (typeof highlightUri === 'string' && highlightUri.startsWith('/api/v2/')) {
      const highlightPayload = await requestSmugMugJson(highlightUri, apiKey, authContext);
      const root = highlightPayload?.Response || {};
      const image = root?.Image || root?.HighlightImage || root;
      const key = String(image?.ImageKey || image?.Key || '').trim();
      if (key) return key;
    }
  } catch (error) {
    // ignore cover lookup issues and fall back to first imported photo
  }

  return null;
};

const makeBlobName = (albumId, originalName) => {
  const safe = String(originalName || 'smugmug-image').replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = Date.now();
  const random = crypto.randomBytes(6).toString('hex');
  return `albums/${albumId}/${stamp}-${random}-${safe}`;
};

const isAzureStorageConfigured = () => {
  const hasConnectionString = !!String(process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim();
  const hasAccountAndKey = !!String(process.env.AZURE_STORAGE_ACCOUNT || '').trim()
    && !!String(process.env.AZURE_STORAGE_KEY || '').trim();
  const hasContainer = !!String(process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_CONTAINER_NAME || '').trim();
  return hasContainer && (hasConnectionString || hasAccountAndKey);
};

const getSmugMugStorageMode = () => (
  isAzureStorageConfigured() ? 'azure' : 'smugmug-source'
);

const uploadImportedImage = async (albumId, image, imageBuffer) => {
  const contentType = 'image/jpeg';
  const blobName = makeBlobName(albumId, image.fileName);

  if (!isAzureStorageConfigured()) {
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

router.get('/admin/vendor-integrations', adminRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) {
      return res.json({
        oauthRequired: true,
        connected: false,
        studioRequired: true,
        message: 'Select a studio to configure SmugMug.',
      });
    }

    await ensureSmugMugConfigTable();
    const config = await queryRow(
      `SELECT access_token as accessToken, access_token_secret as accessTokenSecret
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );

    const connected = !!(String(config?.accessToken || '').trim() && String(config?.accessTokenSecret || '').trim());

    res.json({
      connected,
      oauthRequired: !connected,
      message: connected ? 'SmugMug connected.' : 'SmugMug connection required.',
      integrations: [
        {
          id: 'smugmug',
          name: 'SmugMug',
          connected,
        },
      ],
    });
  } catch (error) {
    console.error('SmugMug vendor integrations error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor integrations' });
  }
});

router.get('/config', adminRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await loadMssql();
    const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(400).json({ error: 'Selected studio is invalid. Choose a valid studio and try again.' });
    }

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();
    const config = await queryRow(
      `SELECT studio_id as studioId, nickname, access_token as accessToken, access_token_secret as accessTokenSecret
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );
    res.json({
      ...(config || { studioId, nickname: '', accessToken: '', accessTokenSecret: '' }),
      storageMode: getSmugMugStorageMode(),
    });
  } catch (error) {
    console.error('SmugMug config get error:', error);
    res.status(500).json({ error: 'Failed to fetch SmugMug config' });
  }
});


router.get('/albums', adminRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await loadMssql();
    const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(400).json({ error: 'Selected studio is invalid. Choose a valid studio and try again.' });
    }

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();

    const config = await queryRow(
      `SELECT nickname, access_token as accessToken, access_token_secret as accessTokenSecret
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );

    const nickname = String(config?.nickname || '').trim();
    const apiKey = String(process.env.SMUGMUG_API_KEY || '').trim();
    const apiSecret = String(process.env.SMUGMUG_API_SECRET || '').trim();
    const accessToken = String(config?.accessToken || '').trim();
    const accessTokenSecret = String(config?.accessTokenSecret || '').trim();

    if (!nickname) {
      return res.status(400).json({ error: 'SmugMug account not connected. Please connect via OAuth first.' });
    }

    let authContext = null;
    if (apiKey && apiSecret && accessToken && accessTokenSecret) {
      const oauth = OAuth({
        consumer: { key: apiKey, secret: apiSecret },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
          return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
      });
      authContext = {
        oauth,
        token: {
          key: accessToken,
          secret: accessTokenSecret,
        },
      };
    }

    const albumRows = await fetchAllSmugMugObjects(
      `/api/v2/user/${encodeURIComponent(nickname)}!albums?count=100`,
      apiKey,
      ['Album', 'Albums'],
      authContext
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

router.get('/import-progress/:jobId', adminRequired, async (req, res) => {
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

router.post('/import', adminRequired, async (req, res) => {
  let importJob = null;
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await loadMssql();
    const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(400).json({ error: 'Selected studio is invalid. Choose a valid studio and try again.' });
    }

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();

    const config = await queryRow(
      `SELECT nickname, access_token as accessToken, access_token_secret as accessTokenSecret
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );

    const nickname = String(config?.nickname || '').trim();
    const apiKey = String(process.env.SMUGMUG_API_KEY || '').trim();
    const apiSecret = String(process.env.SMUGMUG_API_SECRET || '').trim();
    const accessToken = String(config?.accessToken || '').trim();
    const accessTokenSecret = String(config?.accessTokenSecret || '').trim();
    const selectedAlbums = Array.isArray(req.body?.albums) ? req.body.albums : [];
    const requestedJobId = String(req.body?.jobId || '').trim();

    let authContext = null;
    if (apiKey && apiSecret && accessToken && accessTokenSecret) {
      const oauth = OAuth({
        consumer: { key: apiKey, secret: apiSecret },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
          return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
      });
      authContext = {
        oauth,
        token: {
          key: accessToken,
          secret: accessTokenSecret,
        },
      };
    }

    if (!nickname) {
      return res.status(400).json({ error: 'SmugMug account not connected. Please connect via OAuth first.' });
    }

    if (!selectedAlbums.length) {
      return res.status(400).json({ error: 'Select at least one album to import' });
    }

    // Warn clearly if OAuth is missing — SmugMug will only return public/thumbnail URLs without it
    if (!authContext) {
      const msg = `[SmugMug Import] WARNING: No OAuth credentials found for studioId=${studioId}. ` +
        `accessToken=${accessToken ? 'SET' : 'MISSING'}, accessTokenSecret=${accessTokenSecret ? 'SET' : 'MISSING'}. ` +
        `Full-size images CANNOT be downloaded from private albums without OAuth. Please re-connect SmugMug.`;
      console.warn(msg);
      return res.status(401).json({
        error: 'SmugMug OAuth credentials are missing or expired. Please reconnect SmugMug to continue.',
        needsOAuth: true,
      });
    }

    importJob = createImportJob({
      jobId: requestedJobId,
      studioId,
      albums: selectedAlbums,
    });

    const imported = [];

    for (const selected of selectedAlbums) {
      const albumKey = String(selected?.albumKey || '').trim();
      const albumName = String(selected?.name || '').trim() || 'SmugMug Album';
      const albumDescription = String(selected?.description || '').trim() || null;
      if (!albumKey) {
        continue;
      }

      const smugMugCoverImageKey = await getAlbumCoverImageKey(albumKey, apiKey, authContext);

      const albumProgress = getAlbumProgress(importJob, albumKey);
      if (albumProgress) {
        albumProgress.status = 'preparing';
      }

      importJob.currentAlbumKey = albumKey;
      importJob.currentAlbumName = albumName;
      touchImportJob(importJob);

      const existingImport = await queryRow(
        `SELECT local_album_id as localAlbumId
         FROM studio_smugmug_imports
         WHERE studio_id = $1 AND smugmug_album_key = $2`,
        [studioId, albumKey]
      );

      let images = [];
      try {
        images = await listAlbumImages(albumKey, apiKey, authContext);
      } catch (imageError) {
        const errMsg = imageError instanceof Error ? imageError.message : String(imageError);
        // Continue with the next album if one album cannot be listed
        if (albumProgress) {
          albumProgress.status = 'failed';
          albumProgress.photosTotal = 0;
          albumProgress.photosProcessed = 0;
          albumProgress.photosFailed = 0;
          albumProgress.error = errMsg;
        }
        touchImportJob(importJob);
        continue;
      }

      if (!images.length) {
        if (existingImport?.localAlbumId) {
          const emptyAlbum = await queryRow(
            `SELECT id
             FROM albums
             WHERE id = $1 AND studio_id = $2 AND COALESCE(photo_count, 0) = 0`,
            [existingImport.localAlbumId, studioId]
          );

          if (emptyAlbum) {
            await query(
              `DELETE FROM studio_smugmug_imports
               WHERE studio_id = $1 AND smugmug_album_key = $2`,
              [studioId, albumKey]
            );
            await query(
              `DELETE FROM albums
               WHERE id = $1 AND studio_id = $2 AND COALESCE(photo_count, 0) = 0`,
              [existingImport.localAlbumId, studioId]
            );
          }
        }

        if (albumProgress) {
          albumProgress.status = 'failed';
          albumProgress.photosTotal = 0;
          albumProgress.photosProcessed = 0;
          albumProgress.photosFailed = 0;
        }

        pushPhotoProgress(importJob, {
          albumKey,
          albumName,
          fileName: '(album)',
          status: 'failed',
          detail: authContext
            ? 'No full-size image URLs were available for this album.'
            : 'No OriginalUrl/full-size image URLs were available. Connect SmugMug OAuth and retry import.',
        });

        continue;
      }

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

      if (albumProgress) {
        albumProgress.status = 'importing';
        albumProgress.photosTotal = images.length;
      }
      importJob.totals.photosTotal += images.length;
      touchImportJob(importJob);

      let importedPhotoCount = 0;
      let firstImportedPhotoId = null;
      let matchedCoverPhotoId = null;
      for (const image of images) {
        const exists = await queryRow(
          'SELECT TOP 1 id, width, height FROM photos WHERE album_id = $1 AND file_name = $2',
          [albumId, image.fileName]
        );
        const existingWidth = Number(exists?.width || 0);
        const existingHeight = Number(exists?.height || 0);
        const existingIsThumbnail = !!exists
          && existingWidth > 0
          && existingHeight > 0
          && existingWidth <= 200
          && existingHeight <= 200;

        if (exists && !existingIsThumbnail) {
          importJob.totals.photosProcessed += 1;
          importJob.totals.photosSkipped += 1;
          if (albumProgress) {
            albumProgress.photosProcessed += 1;
            albumProgress.photosSkipped += 1;
          }
          if (!firstImportedPhotoId) {
            firstImportedPhotoId = Number(exists.id || 0) || null;
          }
          if (
            !matchedCoverPhotoId
            && smugMugCoverImageKey
            && String(image.id || '').trim()
            && String(image.id).trim() === String(smugMugCoverImageKey).trim()
          ) {
            matchedCoverPhotoId = Number(exists.id || 0) || null;
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
          const downloadHeaders = {};
          if (authContext?.oauth && authContext?.token?.key && authContext?.token?.secret && /^https:\/\/api\.smugmug\.com/i.test(String(image.sourceUrl || ''))) {
            Object.assign(
              downloadHeaders,
              authContext.oauth.toHeader(
                authContext.oauth.authorize(
                  {
                    url: image.sourceUrl,
                    method: 'GET',
                  },
                  authContext.token
                )
              )
            );
          }

          const response = await fetch(image.sourceUrl, {
            headers: downloadHeaders,
          });
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

        const metadataJson = JSON.stringify({
          source: 'smugmug',
          smugmugImageId: image.id,
          importedAt: new Date().toISOString(),
          storage: uploadedImage.storage,
          originalSourceUrl: image.sourceUrl,
          sourceUrlType: image.sourceUrlType || 'unknown',
        });

        if (exists?.id && existingIsThumbnail) {
          await query(
            `UPDATE photos
             SET thumbnail_url = $1,
                 full_image_url = $2,
                 description = $3,
                 metadata = $4,
                 file_size_bytes = $5,
                 width = $6,
                 height = $7
             WHERE id = $8`,
            [
              uploadedImage.url,
              uploadedImage.url,
              image.description || '',
              metadataJson,
              imageBuffer.length,
              width,
              height,
              exists.id,
            ]
          );
          if (!firstImportedPhotoId) {
            firstImportedPhotoId = Number(exists.id || 0) || null;
          }
          if (
            !matchedCoverPhotoId
            && smugMugCoverImageKey
            && String(image.id || '').trim()
            && String(image.id).trim() === String(smugMugCoverImageKey).trim()
          ) {
            matchedCoverPhotoId = Number(exists.id || 0) || null;
          }
        } else {
          const insertedPhoto = await queryRow(
            `INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, file_size_bytes, width, height)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              albumId,
              image.fileName,
              uploadedImage.url,
              uploadedImage.url,
              image.description || '',
              metadataJson,
              imageBuffer.length,
              width,
              height,
            ]
          );
          const insertedPhotoId = Number(insertedPhoto?.id || 0) || null;
          if (!firstImportedPhotoId) {
            firstImportedPhotoId = insertedPhotoId;
          }
          if (
            !matchedCoverPhotoId
            && insertedPhotoId
            && smugMugCoverImageKey
            && String(image.id || '').trim()
            && String(image.id).trim() === String(smugMugCoverImageKey).trim()
          ) {
            matchedCoverPhotoId = insertedPhotoId;
          }
        }

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
          detail: existingIsThumbnail
            ? 'Upgraded existing thumbnail to full-size import'
            : (uploadedImage.storage === 'azure' ? 'Imported successfully' : 'Imported using SmugMug source URL'),
        });
        importedPhotoCount += 1;
      }

      await query(
        `UPDATE albums
         SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
         WHERE id = $1`,
        [albumId]
      );

      const coverPhotoIdToSet = matchedCoverPhotoId || firstImportedPhotoId;
      if (coverPhotoIdToSet) {
        await query(
          `UPDATE albums
           SET cover_photo_id = COALESCE(cover_photo_id, $2)
           WHERE id = $1`,
          [albumId, coverPhotoIdToSet]
        );
      }

      if (importedPhotoCount === 0) {
        if (!existingImport?.localAlbumId) {
          await query(
            `DELETE FROM albums
             WHERE id = $1 AND studio_id = $2 AND COALESCE(photo_count, 0) = 0`,
            [albumId, studioId]
          );
        }

        if (albumProgress) {
          albumProgress.status = 'failed';
        }
        pushPhotoProgress(importJob, {
          albumKey,
          albumName,
          fileName: '(album)',
          status: 'failed',
          detail: 'No full-size photos were imported for this album.',
        });
        touchImportJob(importJob);
        continue;
      }

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
    const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error');
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('SmugMug import error:', errorMsg, '\nStack:', errorStack);
    if (importJob) {
      finishImportJob(importJob, {
        status: 'failed',
        error: errorMsg,
      });
    }
    const details = errorMsg;
    if (/SmugMug request failed \(401\)/i.test(details)) {
      return res.status(401).json({
        error: 'SmugMug API unauthorized. Save a valid SmugMug API key (and reconnect OAuth for private images).',
        details,
      });
    }
    res.status(500).json({ error: 'Failed to import SmugMug albums', details });

  }
});

export default router;


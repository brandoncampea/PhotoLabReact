import express from 'express';
const router = express.Router();
// GET /albums - List SmugMug albums for a given nickname and apiKey
router.get('/albums', async (req, res) => {
  try {
    const { nickname, apiKey } = req.query;
    if (!nickname || !apiKey) {
      return res.status(400).json({ error: 'Missing required parameters: nickname, apiKey' });
    }
    // SmugMug API v2 endpoint for user albums
    const url = `https://api.smugmug.com/api/v2/user/${encodeURIComponent(nickname)}/albums`;
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PhotoLab/1.0',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Failed to fetch albums', details: text });
    }
    const data = await response.json();
    // Return albums array (structure may need to be adjusted based on actual SmugMug API response)
    res.json({ albums: data.Response && data.Response.Album ? data.Response.Album : [] });
  } catch (error) {
    console.error('Error in GET /albums:', error);
    res.status(500).json({ error: 'Failed to fetch albums', details: error?.message });
  }
});

import fs from 'fs';
import dotenv from 'dotenv';
import mssql from '../mssql.cjs';
import * as crypto from 'crypto';
import OAuth from 'oauth-1.0a';

let authRequired;
const loadAuthRequired = async () => {
  if (!authRequired) {
    authRequired = (await import('../middleware/auth.js')).authRequired;
  }
};


// Helper and utility functions (if any) go here

// GET /admin/vendor-integrations - Admin integrations status for SmugMug
router.get('/admin/vendor-integrations', async (req, res) => {
  await loadAuthRequired();
  return authRequired(req, res, async () => {
    try {
      const studioId = req.user.studio_id || req.user.studioId || req.user.id;
      const config = await mssql.queryRow(
        `SELECT access_token, access_token_secret FROM studio_smugmug_config WHERE studio_id = $1`,
        [studioId]
      );
      const connected = !!(config && config.access_token && config.access_token_secret);
      res.json({
        integrations: [
          {
            id: 'smugmug',
            name: 'SmugMug',
            connected,
          }
        ]
      });
    } catch (error) {
      console.error('Error in /admin/vendor-integrations:', error);
      res.status(500).json({ error: 'Failed to fetch vendor integrations' });
    }
  });
});

// Load SmugMug OAuth credentials from .env.smugmug if present
if (fs.existsSync(process.cwd() + '/.env.smugmug')) {
  dotenv.config({ path: process.cwd() + '/.env.smugmug' });
} else {
  dotenv.config();
}

// --- All route definitions go below this line ---
// POST /oauth/complete - Exchange verifier for access token (in-page)
router.post('/oauth/complete', async (req, res) => {
  try {
    await loadAuthRequired();
    return authRequired(req, res, async () => {
      const { oauth_token, oauth_verifier } = req.body;
      if (!oauth_token || !oauth_verifier) {
        return res.status(400).json({ error: 'Missing OAuth parameters' });
      }
      await ensureSmugMugTokenMapTable();

      const tokenMapRow = await mssql.queryRow(
        `SELECT request_token_secret, studio_id FROM studio_smugmug_token_map WHERE oauth_token = $1`,
        [oauth_token]
      );
      if (!tokenMapRow) {
        return res.status(400).json({ error: 'Could not find token mapping for oauth_token.' });
      }
      const requestTokenSecret = tokenMapRow.request_token_secret;
      const studioId = tokenMapRow.studio_id;

      const config = await mssql.queryRow(
        `SELECT api_key as apiKey, api_secret as apiSecret FROM studio_smugmug_config WHERE studio_id = $1`,
        [studioId]
      );
      const apiKey = String(config?.apiKey || process.env.SMUGMUG_API_KEY || '').trim();
      const apiSecret = String(config?.apiSecret || process.env.SMUGMUG_API_SECRET || '').trim();
      if (!apiKey || !apiSecret) {
        return res.status(400).json({ error: 'SmugMug API key/secret not configured for this studio.' });
      }
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
        return res.status(500).json({ error: 'Failed to get access token', details: text });
      }
      const result = Object.fromEntries(new URLSearchParams(text));
      if (!result.oauth_token || !result.oauth_token_secret) {
        return res.status(500).json({ error: 'No access token in response from SmugMug.', details: result });
      }

      await mssql.query(
        `UPDATE studio_smugmug_config SET access_token = $1, access_token_secret = $2, updated_at = CURRENT_TIMESTAMP WHERE studio_id = $3`,
        [result.oauth_token, result.oauth_token_secret, studioId]
      );
      res.json({ ok: true, accessToken: result.oauth_token });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete SmugMug OAuth', details: error?.message });
  }
});

// GET /import-progress/:jobId - Return import job progress for a studio
router.get('/import-progress/:jobId', async (req, res) => {
  await loadAuthRequired();
  authRequired(req, res, async () => {
    try {
      if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const studioId = req.user.studio_id || req.user.studioId || req.user.id;
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
      albums: albums ? albums.length : 0,
      photos: 0,
      imported: 0,
      failed: 0,
    },
    albums: albums || [],
    progress: [],
    finished: false,
    error: null,
  };
  smugMugImportJobs.set(job.jobId, job);
  return job;
};
// Helper to ensure the studio_smugmug_token_map table exists
const ensureSmugMugTokenMapTable = async () => {
  await mssql.query(`
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
  await mssql.query(`
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
    const tokenMapRow = await mssql.queryRow(
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

    const config = await mssql.queryRow(
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
    await mssql.query(
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
    const updateResult = await mssql.query(
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
router.get('/config', async (req, res) => {
  await loadAuthRequired();
  authRequired(req, res, async () => {
    try {
      if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Helper to get studioId from request (reuse from smugmug.js if available)
      const studioId = req.user.studio_id || req.user.studioId || req.user.id;
      if (!studioId) return res.status(400).json({ error: 'Studio context is required' });


      await ensureSmugMugConfigTable();
      const config = await mssql.queryRow(
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
});

export default router;



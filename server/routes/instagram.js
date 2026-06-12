import express from 'express';
import crypto from 'crypto';
import mssql from '../mssql.cjs';
import { adminRequired } from '../middleware/auth.js';
import { decryptToken, encryptToken } from '../utils/socialTokenCrypto.js';

const { queryRow, queryRows, query } = mssql;
const router = express.Router();

const getGraphVersion = () => String(process.env.META_GRAPH_VERSION || 'v20.0').trim();
const getOAuthStateSecret = () => (
  String(
    process.env.INSTAGRAM_OAUTH_STATE_SECRET ||
    process.env.META_APP_SECRET ||
    process.env.JWT_SECRET ||
    ''
  ).trim() ||
  'dev-instagram-oauth-state-secret'
);

const stateTtlMs = () => {
  const minutes = Number(process.env.INSTAGRAM_OAUTH_STATE_TTL_MINUTES || 15);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 15 * 60 * 1000;
  }
  return minutes * 60 * 1000;
};

const safeCompare = (left, right) => {
  const leftBuf = Buffer.from(String(left || ''), 'utf8');
  const rightBuf = Buffer.from(String(right || ''), 'utf8');
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
};

const signStatePayload = (payload) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getOAuthStateSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const verifyAndParseState = (state) => {
  const raw = String(state || '');
  const separator = raw.lastIndexOf('.');
  if (!raw || separator <= 0) {
    return null;
  }

  const encodedPayload = raw.slice(0, separator);
  const providedSignature = raw.slice(separator + 1);
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', getOAuthStateSecret())
    .update(encodedPayload)
    .digest('base64url');

  if (!safeCompare(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text || '{}');
  } catch {
    return { raw: text };
  }
};

const sendOAuthCallbackResponse = (res, statusCode, payload) => {
  const wantsJson = String(res.req?.query?.format || '').toLowerCase() === 'json'
    || String(res.req?.headers?.accept || '').includes('application/json');

  if (wantsJson) {
    return res.status(statusCode).json(payload);
  }

  const safePayload = {
    success: !!payload?.success,
    message: String(payload?.message || payload?.error || 'Instagram callback complete'),
    details: payload?.details || null,
  };
  const payloadScript = JSON.stringify(safePayload).replace(/</g, '\\u003c');
  const bg = safePayload.success ? '#062b1a' : '#2b0909';
  const fg = safePayload.success ? '#bbf7d0' : '#fecaca';

  return res.status(statusCode).type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Instagram Connection</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${bg}; color: ${fg}; margin: 0; padding: 24px;">
    <h2 style="margin-top: 0;">Instagram Connection</h2>
    <p id="message"></p>
    <p style="opacity: 0.9;">This window will close automatically.</p>
    <script>
      (function () {
        var result = ${payloadScript};
        var messageEl = document.getElementById('message');
        if (messageEl) messageEl.textContent = result.message || 'Done';
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'instagram-oauth-result', ...result }, '*');
          }
        } catch (e) {}
        setTimeout(function () {
          try { window.close(); } catch (e) {}
        }, 1200);
      })();
    </script>
  </body>
</html>`);
};

const graphGet = async (path, params = {}) => {
  const graphVersion = getGraphVersion();
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  const url = new URL(`https://graph.facebook.com/${graphVersion}${normalizedPath}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), { method: 'GET' });
  const payload = await parseJsonResponse(response);
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Graph API request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const graphPost = async (path, form = {}) => {
  const graphVersion = getGraphVersion();
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  const url = `https://graph.facebook.com/${graphVersion}${normalizedPath}`;
  const body = new URLSearchParams();
  Object.entries(form).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      body.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Graph API POST failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const resolveStudioId = (req, preferredStudioId) => {
  const role = String(req.user?.role || '');
  const requested = Number(preferredStudioId || 0);
  const fromUser = Number(req.user?.studio_id || 0);

  if (role === 'super_admin') {
    return requested || fromUser || null;
  }

  return fromUser || null;
};

const getIntegrationRow = async (studioId) => {
  return queryRow(
    `SELECT TOP 1
        id,
        studio_id as studioId,
        provider,
        instagram_user_id as instagramUserId,
        facebook_page_id as facebookPageId,
        token_expires_at as tokenExpiresAt,
        status,
        connected_at as connectedAt,
        last_synced_at as lastSyncedAt,
        last_error as lastError,
        updated_at as updatedAt
      FROM studio_social_integrations
      WHERE studio_id = $1
        AND provider = 'instagram'`,
    [studioId]
  );
};

// GET /api/instagram/status?studioId=
router.get('/status', adminRequired, async (req, res) => {
  try {
    const studioId = resolveStudioId(req, req.query?.studioId);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio ID is required' });
    }

    const row = await getIntegrationRow(studioId);
    return res.json({
      connected: !!row && String(row.status || '').toLowerCase() === 'connected',
      integration: row || null,
    });
  } catch (error) {
    console.error('[instagram][status] error:', error);
    return res.status(500).json({ error: 'Failed to load Instagram integration status' });
  }
});

// GET /api/instagram/connect/start?studioId=
router.get('/connect/start', adminRequired, async (req, res) => {
  try {
    const studioId = resolveStudioId(req, req.query?.studioId);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio ID is required' });
    }

    const appId = String(process.env.META_APP_ID || '').trim();
    const redirectUri = String(process.env.META_REDIRECT_URI || '').trim();
    const graphVersion = getGraphVersion();
    if (!appId || !redirectUri) {
      const missing = [
        !appId ? 'META_APP_ID' : null,
        !redirectUri ? 'META_REDIRECT_URI' : null,
      ].filter(Boolean);
      return res.status(500).json({
        error: 'Meta app configuration missing on server',
        missing,
      });
    }

    const requestPublishScope = String(process.env.INSTAGRAM_REQUEST_PUBLISH_SCOPE || 'false').toLowerCase() === 'true';
    const scopes = [
      'instagram_basic',
      'pages_show_list',
      'pages_read_engagement',
      ...(requestPublishScope ? ['instagram_content_publish'] : []),
    ];
    const state = signStatePayload({
      studioId,
      userId: Number(req.user?.id || 0) || null,
      ts: Date.now(),
      nonce: crypto.randomBytes(12).toString('hex'),
    });
    const authUrl = `https://www.facebook.com/${encodeURIComponent(graphVersion)}/dialog/oauth` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes.join(','))}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}`;

    return res.json({ authUrl, state, scopes });
  } catch (error) {
    console.error('[instagram][connect/start] error:', error);
    return res.status(500).json({ error: 'Failed to initialize Instagram connection' });
  }
});

// GET /api/instagram/connect/callback
router.get('/connect/callback', async (req, res) => {
  try {
    const appId = String(process.env.META_APP_ID || '').trim();
    const appSecret = String(process.env.META_APP_SECRET || '').trim();
    const redirectUri = String(process.env.META_REDIRECT_URI || '').trim();
    const graphVersion = getGraphVersion();

    if (!appId || !appSecret || !redirectUri) {
      return res.status(500).json({ error: 'Meta app configuration missing on server' });
    }

    const providerError = String(req.query?.error || '').trim();
    if (providerError) {
      return sendOAuthCallbackResponse(res, 400, {
        error: 'Instagram authorization was not completed',
        providerError,
        providerErrorReason: req.query?.error_reason || null,
        providerErrorDescription: req.query?.error_description || null,
      });
    }

    const code = String(req.query?.code || '').trim();
    const parsedState = verifyAndParseState(req.query?.state);
    if (!code || !parsedState) {
      return sendOAuthCallbackResponse(res, 400, { error: 'Invalid callback request' });
    }

    const studioId = Number(parsedState?.studioId || 0);
    const stateTs = Number(parsedState?.ts || 0);
    if (!studioId || !stateTs) {
      return sendOAuthCallbackResponse(res, 400, { error: 'Invalid callback state payload' });
    }

    if (Date.now() - stateTs > stateTtlMs()) {
      return sendOAuthCallbackResponse(res, 400, { error: 'Instagram callback state has expired. Please retry connect.' });
    }

    const tokenExchangeUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    tokenExchangeUrl.searchParams.set('client_id', appId);
    tokenExchangeUrl.searchParams.set('client_secret', appSecret);
    tokenExchangeUrl.searchParams.set('redirect_uri', redirectUri);
    tokenExchangeUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenExchangeUrl.toString(), { method: 'GET' });
    const tokenPayload = await parseJsonResponse(tokenResponse);
    if (!tokenResponse.ok || tokenPayload?.error || !tokenPayload?.access_token) {
      return sendOAuthCallbackResponse(res, 502, {
        error: 'Failed to exchange Meta authorization code for access token',
        details: tokenPayload,
      });
    }

    let accessToken = String(tokenPayload.access_token || '').trim();
    let tokenExpiresAt = null;
    const shortExpiresIn = Number(tokenPayload.expires_in || 0);
    if (Number.isFinite(shortExpiresIn) && shortExpiresIn > 0) {
      tokenExpiresAt = new Date(Date.now() + shortExpiresIn * 1000);
    }

    try {
      const longLivedUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
      longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longLivedUrl.searchParams.set('client_id', appId);
      longLivedUrl.searchParams.set('client_secret', appSecret);
      longLivedUrl.searchParams.set('fb_exchange_token', accessToken);

      const longLivedResponse = await fetch(longLivedUrl.toString(), { method: 'GET' });
      const longLivedPayload = await parseJsonResponse(longLivedResponse);
      if (longLivedResponse.ok && !longLivedPayload?.error && longLivedPayload?.access_token) {
        accessToken = String(longLivedPayload.access_token || '').trim();
        const longExpiresIn = Number(longLivedPayload.expires_in || 0);
        if (Number.isFinite(longExpiresIn) && longExpiresIn > 0) {
          tokenExpiresAt = new Date(Date.now() + longExpiresIn * 1000);
        }
      }
    } catch (exchangeErr) {
      console.warn('[instagram][connect/callback] Long-lived token exchange skipped:', exchangeErr?.message || exchangeErr);
    }

    const accountsPayload = await graphGet('/me/accounts', {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      access_token: accessToken,
    });

    const pageAccounts = Array.isArray(accountsPayload?.data) ? accountsPayload.data : [];
    const pageWithInstagram = pageAccounts.find(
      (page) => page?.instagram_business_account?.id && page?.access_token
    );

    if (!pageWithInstagram) {
      await query(
        `IF EXISTS (SELECT 1 FROM studio_social_integrations WHERE studio_id = $1 AND provider = 'instagram')
         BEGIN
           UPDATE studio_social_integrations
           SET status = 'error',
               last_error = $2,
               updated_at = GETDATE()
           WHERE studio_id = $1
             AND provider = 'instagram'
         END
         ELSE
         BEGIN
           INSERT INTO studio_social_integrations (
             studio_id, provider, status, last_error, created_at, updated_at
           )
           VALUES ($1, 'instagram', 'error', $2, GETDATE(), GETDATE())
         END`,
        [studioId, 'No Facebook Page with an Instagram Business account was found for this user token.']
      );

      return sendOAuthCallbackResponse(res, 400, {
        error: 'No connected Instagram Business account found on any accessible Facebook Page',
      });
    }

    const instagramUserId = String(pageWithInstagram.instagram_business_account.id || '').trim();
    const instagramUsername = String(pageWithInstagram.instagram_business_account.username || '').trim();
    const facebookPageId = String(pageWithInstagram.id || '').trim();
    const pageAccessToken = String(pageWithInstagram.access_token || '').trim() || accessToken;
    const scopes = Array.isArray(tokenPayload?.granted_scopes)
      ? tokenPayload.granted_scopes.join(',')
      : String(req.query?.granted_scopes || '').trim() || null;

    const encryptedAccessToken = encryptToken(pageAccessToken);

    await query(
      `IF EXISTS (SELECT 1 FROM studio_social_integrations WHERE studio_id = $1 AND provider = 'instagram')
       BEGIN
         UPDATE studio_social_integrations
         SET provider_user_id = $2,
             instagram_user_id = $3,
             facebook_page_id = $4,
             access_token_encrypted = $5,
             refresh_token_encrypted = NULL,
             token_expires_at = $6,
             scopes = $7,
             status = 'connected',
             connected_at = ISNULL(connected_at, GETDATE()),
             last_synced_at = GETDATE(),
             last_error = NULL,
             updated_at = GETDATE()
         WHERE studio_id = $1
           AND provider = 'instagram'
       END
       ELSE
       BEGIN
         INSERT INTO studio_social_integrations (
           studio_id,
           provider,
           provider_user_id,
           instagram_user_id,
           facebook_page_id,
           access_token_encrypted,
           refresh_token_encrypted,
           token_expires_at,
           scopes,
           status,
           connected_at,
           last_synced_at,
           created_at,
           updated_at
         )
         VALUES (
           $1,
           'instagram',
           $2,
           $3,
           $4,
           $5,
           NULL,
           $6,
           $7,
           'connected',
           GETDATE(),
           GETDATE(),
           GETDATE(),
           GETDATE()
         )
       END`,
      [
        studioId,
        instagramUsername || instagramUserId || null,
        instagramUserId || null,
        facebookPageId || null,
        encryptedAccessToken,
        tokenExpiresAt,
        scopes,
      ]
    );

    const integration = await getIntegrationRow(studioId);
    return sendOAuthCallbackResponse(res, 200, {
      success: true,
      message: 'Instagram integration connected successfully',
      integration,
    });
  } catch (error) {
    console.error('[instagram][connect/callback] error:', error);
    return sendOAuthCallbackResponse(res, 500, {
      error: 'Failed to complete Instagram integration callback',
      details: error?.payload || error?.message || String(error),
    });
  }
});

// POST /api/instagram/disconnect
router.post('/disconnect', adminRequired, async (req, res) => {
  try {
    const studioId = resolveStudioId(req, req.body?.studioId || req.query?.studioId);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio ID is required' });
    }

    await query(
      `UPDATE studio_social_integrations
       SET status = 'disconnected',
           access_token_encrypted = NULL,
           refresh_token_encrypted = NULL,
           token_expires_at = NULL,
           last_error = NULL,
           updated_at = GETDATE()
       WHERE studio_id = $1
         AND provider = 'instagram'`,
      [studioId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('[instagram][disconnect] error:', error);
    return res.status(500).json({ error: 'Failed to disconnect Instagram integration' });
  }
});

// POST /api/instagram/publish
router.post('/publish', adminRequired, async (req, res) => {
  try {
    const studioId = resolveStudioId(req, req.body?.studioId || req.query?.studioId);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio ID is required' });
    }

    const caption = String(req.body?.caption || '').trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'At least one publish item is required' });
    }

    const maxItems = Number(process.env.INSTAGRAM_MAX_CAROUSEL_ITEMS || 20);
    if (items.length > maxItems) {
      return res.status(400).json({ error: `Maximum ${maxItems} items allowed per post` });
    }

    const integration = await queryRow(
      `SELECT TOP 1 id, status
       FROM studio_social_integrations
       WHERE studio_id = $1
         AND provider = 'instagram'`,
      [studioId]
    );

    if (!integration || String(integration.status || '').toLowerCase() !== 'connected') {
      return res.status(400).json({ error: 'Studio Instagram account is not connected' });
    }

    const insertedJob = await queryRow(
      `INSERT INTO social_publish_jobs (
          studio_id, provider, integration_id, requested_by_user_id,
          status, caption, payload_json, requested_at, created_at, updated_at
       )
       VALUES ($1, 'instagram', $2, $3, 'queued', $4, $5, GETDATE(), GETDATE(), GETDATE())
       RETURNING id`,
      [studioId, Number(integration.id), Number(req.user?.id || 0) || null, caption || null, JSON.stringify({ items })]
    );

    const jobId = Number(insertedJob?.id || 0);
    if (!jobId) {
      return res.status(500).json({ error: 'Failed to create publish job' });
    }

    let idx = 0;
    for (const item of items) {
      idx += 1;
      await query(
        `INSERT INTO social_publish_job_items (
            job_id, studio_id, photo_id, sort_order, source_url,
            status, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, 'queued', GETDATE(), GETDATE())`,
        [
          jobId,
          studioId,
          Number(item?.photoId || 0) || null,
          idx,
          String(item?.sourceUrl || '').trim() || null,
        ]
      );
    }

    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Publish job queued. Provider publish execution will be added in the next phase.',
    });
  } catch (error) {
    console.error('[instagram][publish] error:', error);
    return res.status(500).json({ error: 'Failed to create Instagram publish job' });
  }
});

// GET /api/instagram/publish/:jobId
router.get('/publish/:jobId', adminRequired, async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const requestedStudioId = Number(req.query?.studioId || req.user?.studio_id || 0) || null;

    const job = await queryRow(
      `SELECT id,
              studio_id as studioId,
              provider,
              status,
              caption,
              provider_publish_id as providerPublishId,
              provider_permalink as providerPermalink,
              error_message as errorMessage,
              requested_at as requestedAt,
              started_at as startedAt,
              completed_at as completedAt,
              updated_at as updatedAt
       FROM social_publish_jobs
       WHERE id = $1`,
      [jobId]
    );

    if (!job) {
      return res.status(404).json({ error: 'Publish job not found' });
    }

    const role = String(req.user?.role || '');
    if (role !== 'super_admin') {
      const userStudioId = Number(req.user?.studio_id || 0);
      if (!userStudioId || Number(job.studioId) !== userStudioId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else if (requestedStudioId && Number(job.studioId) !== requestedStudioId) {
      return res.status(403).json({ error: 'Unauthorized for requested studio' });
    }

    const items = await queryRows(
      `SELECT id,
              photo_id as photoId,
              sort_order as sortOrder,
              source_url as sourceUrl,
              provider_media_container_id as providerMediaContainerId,
              status,
              error_message as errorMessage,
              updated_at as updatedAt
       FROM social_publish_job_items
       WHERE job_id = $1
       ORDER BY sort_order ASC`,
      [jobId]
    );

    return res.json({ job, items: items || [] });
  } catch (error) {
    console.error('[instagram][publish/:jobId] error:', error);
    return res.status(500).json({ error: 'Failed to load publish job status' });
  }
});

// POST /api/instagram/publish/:jobId/process
router.post('/publish/:jobId/process', adminRequired, async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const requestedStudioId = Number(req.body?.studioId || req.query?.studioId || req.user?.studio_id || 0) || null;

    const job = await queryRow(
      `SELECT id,
              studio_id as studioId,
              integration_id as integrationId,
              status,
              caption,
              payload_json as payloadJson
       FROM social_publish_jobs
       WHERE id = $1`,
      [jobId]
    );

    if (!job) {
      return res.status(404).json({ error: 'Publish job not found' });
    }

    const role = String(req.user?.role || '');
    if (role !== 'super_admin') {
      const userStudioId = Number(req.user?.studio_id || 0);
      if (!userStudioId || Number(job.studioId) !== userStudioId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else if (requestedStudioId && Number(job.studioId) !== requestedStudioId) {
      return res.status(403).json({ error: 'Unauthorized for requested studio' });
    }

    const jobStatus = String(job.status || '').toLowerCase();
    if (!['queued', 'running', 'failed'].includes(jobStatus)) {
      return res.status(400).json({ error: `Job cannot be processed from status ${job.status}` });
    }

    const integration = await queryRow(
      `SELECT id,
              instagram_user_id as instagramUserId,
              access_token_encrypted as accessTokenEncrypted,
              status
       FROM studio_social_integrations
       WHERE id = $1
         AND studio_id = $2
         AND provider = 'instagram'`,
      [Number(job.integrationId), Number(job.studioId)]
    );

    if (!integration || String(integration.status || '').toLowerCase() !== 'connected') {
      return res.status(400).json({ error: 'Instagram integration is not connected for this studio' });
    }

    const instagramUserId = String(integration.instagramUserId || '').trim();
    if (!instagramUserId) {
      return res.status(400).json({ error: 'Instagram user id missing on connected integration' });
    }

    const accessToken = decryptToken(String(integration.accessTokenEncrypted || ''));
    if (!accessToken) {
      return res.status(400).json({ error: 'Instagram access token unavailable for this integration' });
    }

    await query(
      `UPDATE social_publish_jobs
       SET status = 'running',
           started_at = ISNULL(started_at, GETDATE()),
           error_message = NULL,
           updated_at = GETDATE()
       WHERE id = $1`,
      [jobId]
    );

    const items = await queryRows(
      `SELECT id,
              sort_order as sortOrder,
              source_url as sourceUrl
       FROM social_publish_job_items
       WHERE job_id = $1
       ORDER BY sort_order ASC`,
      [jobId]
    );

    const validItems = (items || []).filter((item) => String(item.sourceUrl || '').trim());
    if (!validItems.length) {
      await query(
        `UPDATE social_publish_jobs
         SET status = 'failed',
             error_message = 'No valid source URLs found on this job',
             completed_at = GETDATE(),
             updated_at = GETDATE()
         WHERE id = $1`,
        [jobId]
      );
      return res.status(400).json({ error: 'No valid source URLs found on this job' });
    }

    const maxItems = Number(process.env.INSTAGRAM_MAX_CAROUSEL_ITEMS || 20);
    if (validItems.length > maxItems) {
      await query(
        `UPDATE social_publish_jobs
         SET status = 'failed',
             error_message = $2,
             completed_at = GETDATE(),
             updated_at = GETDATE()
         WHERE id = $1`,
        [jobId, `Too many items: ${validItems.length}. Maximum allowed is ${maxItems}.`]
      );
      return res.status(400).json({ error: `Maximum ${maxItems} items allowed` });
    }

    const childContainerIds = [];

    for (const item of validItems) {
      const sourceUrl = String(item.sourceUrl || '').trim();
      try {
        const mediaPayload = await graphPost(`/${instagramUserId}/media`, {
          image_url: sourceUrl,
          is_carousel_item: validItems.length > 1 ? 'true' : undefined,
          caption: validItems.length === 1 ? String(job.caption || '') : undefined,
          access_token: accessToken,
        });

        const containerId = String(mediaPayload?.id || '').trim();
        if (!containerId) {
          throw new Error('Instagram container id was not returned');
        }

        childContainerIds.push(containerId);

        await query(
          `UPDATE social_publish_job_items
           SET status = 'processing',
               provider_media_container_id = $2,
               error_message = NULL,
               updated_at = GETDATE()
           WHERE id = $1`,
          [Number(item.id), containerId]
        );
      } catch (itemError) {
        const itemMessage = String(itemError?.payload?.error?.message || itemError?.message || 'Failed to create media container');
        await query(
          `UPDATE social_publish_job_items
           SET status = 'failed',
               error_message = $2,
               updated_at = GETDATE()
           WHERE id = $1`,
          [Number(item.id), itemMessage]
        );
        throw new Error(`Item ${item.sortOrder} failed: ${itemMessage}`);
      }
    }

    let publishCreationId = null;
    if (childContainerIds.length === 1) {
      publishCreationId = childContainerIds[0];
    } else {
      const carouselPayload = await graphPost(`/${instagramUserId}/media`, {
        media_type: 'CAROUSEL',
        children: childContainerIds.join(','),
        caption: String(job.caption || ''),
        access_token: accessToken,
      });
      publishCreationId = String(carouselPayload?.id || '').trim() || null;
    }

    if (!publishCreationId) {
      throw new Error('Failed to prepare publish creation id');
    }

    const publishPayload = await graphPost(`/${instagramUserId}/media_publish`, {
      creation_id: publishCreationId,
      access_token: accessToken,
    });

    const publishId = String(publishPayload?.id || '').trim() || null;

    await query(
      `UPDATE social_publish_jobs
       SET status = 'completed',
           provider_publish_id = $2,
           error_message = NULL,
           completed_at = GETDATE(),
           updated_at = GETDATE()
       WHERE id = $1`,
      [jobId, publishId]
    );

    await query(
      `UPDATE social_publish_job_items
       SET status = 'completed',
           updated_at = GETDATE()
       WHERE job_id = $1
         AND status <> 'failed'`,
      [jobId]
    );

    return res.json({
      success: true,
      jobId,
      status: 'completed',
      providerPublishId: publishId,
    });
  } catch (error) {
    console.error('[instagram][publish/:jobId/process] error:', error);
    const jobId = Number(req.params.jobId || 0);
    if (jobId > 0) {
      try {
        await query(
          `UPDATE social_publish_jobs
           SET status = 'failed',
               error_message = $2,
               completed_at = GETDATE(),
               updated_at = GETDATE()
           WHERE id = $1`,
          [jobId, String(error?.message || 'Failed to process publish job')]
        );
      } catch (innerError) {
        console.error('[instagram][publish/:jobId/process] failed to set failed state:', innerError);
      }
    }

    return res.status(500).json({
      error: 'Failed to process Instagram publish job',
      details: error?.payload || error?.message || String(error),
    });
  }
});

export default router;

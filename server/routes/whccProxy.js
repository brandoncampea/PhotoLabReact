import express from 'express';
import axios from 'axios';
import { adminRequired } from '../middleware/auth.js';
import mssql from '../mssql.cjs';

const { queryRow, query } = mssql;

const router = express.Router();

const WHCC_PROD_URL = 'https://apps.whcc.com';
const WHCC_SANDBOX_URL = 'https://sandbox.apps.whcc.com';

// Server-side token cache: cacheKey → { token, expiresAt }
const tokenCache = new Map();

function getBaseUrl(isSandbox) {
  return isSandbox ? WHCC_SANDBOX_URL : WHCC_PROD_URL;
}

function stringifyForDb(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'Failed to serialize value' });
  }
}

function resolveTargetStudioId(req) {
  const actingStudioId = Number(req.headers['x-acting-studio-id']);
  if (Number.isInteger(actingStudioId) && actingStudioId > 0) return actingStudioId;
  const studioId = Number(req.user?.studio_id);
  return Number.isInteger(studioId) && studioId > 0 ? studioId : null;
}

async function ensureWebhookConfigRow(studioId) {
  await query(
    `IF NOT EXISTS (SELECT 1 FROM whcc_webhook_config WHERE studio_id = $1)
     BEGIN
       INSERT INTO whcc_webhook_config (studio_id, created_at, updated_at)
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     END`,
    [studioId]
  );
}

function appendStudioIdToCallbackUri(callbackUri, studioId) {
  const url = new URL(callbackUri);
  url.searchParams.set('studioId', String(studioId));
  return url.toString();
}

function getDefaultProductCatalog() {
  return {
    source: 'fallback',
    products: [
      {
        productUID: 2,
        name: '4x6 Print',
        description: 'Glossy 4x6 Photograph',
        width: 4,
        height: 6,
        basePrice: 0.49,
        category: 'prints',
      },
      {
        productUID: 3,
        name: '5x7 Print',
        description: 'Glossy 5x7 Photograph',
        width: 5,
        height: 7,
        basePrice: 0.65,
        category: 'prints',
      },
      {
        productUID: 4,
        name: '8x10 Print',
        description: 'Glossy 8x10 Photograph',
        width: 8,
        height: 10,
        basePrice: 2.99,
        category: 'prints',
      },
    ],
  };
}

/**
 * Resolve WHCC credentials.
 * Priority: server env vars → request body → request query params
 */
function getCredentials(req) {
  // Only use Order Submit API credentials
  const consumerKey =
    process.env.WHCC_CONSUMER_KEY ||
    req.body?.consumerKey ||
    req.query?.consumerKey;
  const consumerSecret =
    process.env.WHCC_CONSUMER_SECRET ||
    req.body?.consumerSecret ||
    req.query?.consumerSecret;
  const isSandbox =
    process.env.WHCC_SANDBOX === 'true' ||
    req.body?.isSandbox === true ||
    req.query?.isSandbox === 'true';
  return { consumerKey, consumerSecret, isSandbox };
}

/**
 * Fetch (or return cached) WHCC access token.
 * Tokens are cached server-side with a 5-minute buffer before expiry.
 */
async function fetchToken(consumerKey, consumerSecret, isSandbox) {
  const cacheKey = `${consumerKey}:${isSandbox ? 'sandbox' : 'prod'}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 300_000) {
    return cached.token;
  }

  const response = await axios.get(`${getBaseUrl(isSandbox)}/api/AccessToken`, {
    params: {
      grant_type: 'consumer_credentials',
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    },
    headers: {
      Accept: 'application/json',
    },
  });

  const token = response.data?.Token || response.data?.token || null;
  if (!token) {
    throw new Error('WHCC token response did not include a token');
  }

  const expiresAt = Date.now() + 60 * 60 * 1000;
  tokenCache.set(cacheKey, { token, expiresAt });
  return token;
}

// ---------------------------------------------------------------------------
// GET /api/whcc/token
// Returns a WHCC access token (cached server-side)
// ---------------------------------------------------------------------------
router.get('/whcc/token', adminRequired, async (req, res) => {
    console.log('[WHCCProxy] /whcc/token called', { consumerKey, isSandbox });
  const { consumerKey, consumerSecret, isSandbox } = getCredentials(req);
  if (!consumerKey || !consumerSecret) {
    return res.status(400).json({
      error:
        'WHCC credentials not configured. Set WHCC_CONSUMER_KEY / WHCC_CONSUMER_SECRET env vars, or pass consumerKey + consumerSecret.',
    });
  }
  try {
    const token = await fetchToken(consumerKey, consumerSecret, isSandbox);
    res.json({ token });
  } catch (err) {
    console.error(
      '[WHCCProxy] Token error:',
      err?.response?.status,
      err?.response?.data || err.message
    );
    res
      .status(502)
      .json({ error: 'Failed to get WHCC access token', details: err?.response?.data || err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/whcc/products
// Returns WHCC product catalog
// ---------------------------------------------------------------------------
import { authRequired } from '../middleware/auth.js';
router.get('/whcc/products', authRequired, async (req, res) => {
  try {
    const { consumerKey, consumerSecret, isSandbox } = getCredentials(req);
    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({ error: 'Missing WHCC_CONSUMER_KEY or WHCC_CONSUMER_SECRET.' });
    }
    // Get access token for Order Submit API (Order Submit flow, not OAuth)
    const tokenUrl = `${getBaseUrl(isSandbox)}/api/AccessToken`;
    const params = new URLSearchParams({
      grant_type: 'consumer_credentials',
      consumer_key: consumerKey,
      consumer_secret: consumerSecret
    });
    let tokenResp;
    try {
      tokenResp = await axios.get(
        tokenUrl + '?' + params.toString(),
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
    } catch (tokenErr) {
      console.error('[WHCCProxy] Token request error:', tokenErr?.response?.status, tokenErr?.response?.data || tokenErr.message);
      throw tokenErr;
    }
    const accessToken = tokenResp.data.Token;
    // Fetch product catalog from Order Submit API (sandbox/production)
    const catalogUrl = `${getBaseUrl(isSandbox)}/api/catalog`;
    let productsResp;
    try {
      productsResp = await axios.get(catalogUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
    } catch (catErr) {
      console.error('[WHCCProxy] Catalog request error:', catErr?.response?.status, catErr?.response?.data || catErr.message);
      throw catErr;
    }
    res.json(productsResp.data);
  } catch (err) {
    let whccError = {};
    if (err.response) {
      whccError = {
        status: err.response.status,
        headers: err.response.headers,
        data: err.response.data,
        request: {
          url: err.config?.url,
          method: err.config?.method,
          data: err.config?.data,
          params: err.config?.params,
        },
      };
    }
    // Print the full error object for debugging
    console.error('[WHCCProxy] Products error (full):', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    console.error('[WHCCProxy] Products error (summary):', whccError, err.message);
    res.status(502).json({
      error: 'Failed to fetch product catalog from WHCC Order Submit API.',
      details: whccError,
      message: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/whcc/order/import
// Imports an order into WHCC (step 1 of submission)
// Body: { consumerKey?, consumerSecret?, isSandbox?, ...WhccOrderRequest }
// ---------------------------------------------------------------------------
router.post('/whcc/order/import', adminRequired, async (req, res) => {
  console.log('[WHCCProxy] /whcc/order/import called');
  const { consumerKey: bodyKey, consumerSecret: bodySecret, isSandbox: bodySandbox, ...orderRequest } = req.body;
  const creds = getCredentials(req);
  const key = bodyKey || creds.consumerKey;
  const secret = bodySecret || creds.consumerSecret;
  const sandbox = bodySandbox !== undefined ? bodySandbox : creds.isSandbox;

  if (!key || !secret) {
    return res.status(400).json({ error: 'WHCC credentials not configured' });
  }

  // If validation passes, proceed with order import
  try {
    const token = await fetchToken(key, secret, sandbox);
    const response = await axios.post(
      `${getBaseUrl(sandbox)}/api/OrderImport`,
      orderRequest,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(
      '[WHCCProxy] Order submit error:',
      err?.response?.status,
      err?.response?.data || err.message
    );
    res
      .status(502)
      .json({ error: 'Failed to submit WHCC order', details: err?.response?.data || err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/whcc/order/submit/:confirmationId
// Submits an imported WHCC order (step 2 of submission)
// Body: { consumerKey?, consumerSecret?, isSandbox? }
// ---------------------------------------------------------------------------
router.post('/whcc/order/submit/:confirmationId', adminRequired, async (req, res) => {
    console.log('[WHCCProxy] /whcc/order/submit called', { confirmationId, key, sandbox });
  const { confirmationId } = req.params;
  const { consumerKey: bodyKey, consumerSecret: bodySecret, isSandbox: bodySandbox } = req.body;
  const creds = getCredentials(req);
  const key = bodyKey || creds.consumerKey;
  const secret = bodySecret || creds.consumerSecret;
  const sandbox = bodySandbox !== undefined ? bodySandbox : creds.isSandbox;

  if (!key || !secret) {
    return res.status(400).json({ error: 'WHCC credentials not configured' });
  }
  try {
    const token = await fetchToken(key, secret, sandbox);
    const response = await axios.post(
      `${getBaseUrl(sandbox)}/api/OrderImport/Submit/${confirmationId}`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': '0',
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(
      '[WHCCProxy] Order submit error:',
      err?.response?.status,
      err?.response?.data || err.message
    );
    res
      .status(502)
      .json({ error: 'Failed to submit WHCC order', details: err?.response?.data || err.message });
  }
});

router.get('/whcc/webhook/status', adminRequired, async (req, res) => {
  const studioId = resolveTargetStudioId(req);
  if (!studioId) {
    return res.status(400).json({ error: 'Studio context is required' });
  }

  const row = await queryRow(
    `SELECT studio_id as studioId,
            callback_uri as callbackUri,
            last_verifier as lastVerifier,
            verified_at as verifiedAt,
            last_registration_response as lastRegistrationResponse,
            last_verification_response as lastVerificationResponse,
            last_payload as lastPayload,
            last_received_at as lastReceivedAt,
            updated_at as updatedAt
     FROM whcc_webhook_config
     WHERE studio_id = $1`,
    [studioId]
  );

  const safeParse = (value) => {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return value; }
  };

  res.json({
    studioId,
    callbackUri: row?.callbackUri || null,
    lastVerifier: row?.lastVerifier || null,
    verifiedAt: row?.verifiedAt || null,
    lastRegistrationResponse: safeParse(row?.lastRegistrationResponse),
    lastVerificationResponse: safeParse(row?.lastVerificationResponse),
    lastPayload: safeParse(row?.lastPayload),
    lastReceivedAt: row?.lastReceivedAt || null,
    updatedAt: row?.updatedAt || null,
  });
});

router.post('/whcc/webhook/register', adminRequired, async (req, res) => {
  const studioId = resolveTargetStudioId(req);
  if (!studioId) {
    return res.status(400).json({ error: 'Studio context is required' });
  }

  const { callbackUri } = req.body || {};
  if (!callbackUri) {
    return res.status(400).json({ error: 'callbackUri is required' });
  }

  const creds = getCredentials(req);
  if (!creds.consumerKey || !creds.consumerSecret) {
    return res.status(400).json({ error: 'WHCC credentials not configured' });
  }

  let studioCallbackUri;
  try {
    studioCallbackUri = appendStudioIdToCallbackUri(callbackUri, studioId);
  } catch {
    return res.status(400).json({ error: 'callbackUri must be a valid absolute URL' });
  }

  try {
    const token = await fetchToken(creds.consumerKey, creds.consumerSecret, creds.isSandbox);
    const form = new URLSearchParams({ callbackUri: studioCallbackUri });
    const response = await axios.post(`${getBaseUrl(creds.isSandbox)}/api/callback/create`, form, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    await ensureWebhookConfigRow(studioId);
    await query(
      `UPDATE whcc_webhook_config
       SET callback_uri = $1,
           verified_at = NULL,
           last_registration_response = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE studio_id = $3`,
      [studioCallbackUri, stringifyForDb(response.data), studioId]
    );

    res.json({ studioId, callbackUri: studioCallbackUri, response: response.data });
  } catch (err) {
    res.status(502).json({ error: 'Failed to register WHCC webhook', details: err?.response?.data || err.message });
  }
});

router.post('/whcc/webhook/verify', adminRequired, async (req, res) => {
  const studioId = resolveTargetStudioId(req);
  if (!studioId) {
    return res.status(400).json({ error: 'Studio context is required' });
  }

  const creds = getCredentials(req);
  if (!creds.consumerKey || !creds.consumerSecret) {
    return res.status(400).json({ error: 'WHCC credentials not configured' });
  }

  const stored = await queryRow(
    'SELECT last_verifier as lastVerifier FROM whcc_webhook_config WHERE studio_id = $1',
    [studioId]
  );
  const verifier = req.body?.verifier || stored?.lastVerifier;
  if (!verifier) {
    return res.status(400).json({ error: 'No verifier available yet. Register the webhook first and wait for WHCC callback.' });
  }

  try {
    const token = await fetchToken(creds.consumerKey, creds.consumerSecret, creds.isSandbox);
    const form = new URLSearchParams({ verifier: String(verifier) });
    const response = await axios.post(`${getBaseUrl(creds.isSandbox)}/api/callback/verify`, form, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    await ensureWebhookConfigRow(studioId);
    await query(
      `UPDATE whcc_webhook_config
       SET verified_at = CURRENT_TIMESTAMP,
           last_verification_response = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE studio_id = $2`,
      [stringifyForDb(response.data), studioId]
    );

    res.json({ studioId, verifier, response: response.data, verified: true });
  } catch (err) {
    res.status(502).json({ error: 'Failed to verify WHCC webhook', details: err?.response?.data || err.message });
  }
});

export default router;

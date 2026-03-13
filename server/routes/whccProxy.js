import express from 'express';
import axios from 'axios';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

const WHCC_PROD_URL = 'https://apps.whcc.com';
const WHCC_SANDBOX_URL = 'https://sandbox.apps.whcc.com';

// Server-side token cache: cacheKey → { token, expiresAt }
const tokenCache = new Map();

function getBaseUrl(isSandbox) {
  return isSandbox ? WHCC_SANDBOX_URL : WHCC_PROD_URL;
}

/**
 * Resolve WHCC credentials.
 * Priority: server env vars → request body → request query params
 */
function getCredentials(req) {
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
  });

  const data = response.data;
  const expiresAt = new Date(data.ExpirationDate).getTime();
  tokenCache.set(cacheKey, { token: data.Token, expiresAt });
  return data.Token;
}

// ---------------------------------------------------------------------------
// GET /api/whcc/token
// Returns a WHCC access token (cached server-side)
// ---------------------------------------------------------------------------
router.get('/whcc/token', adminRequired, async (req, res) => {
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
router.get('/whcc/products', adminRequired, async (req, res) => {
  const { consumerKey, consumerSecret, isSandbox } = getCredentials(req);
  if (!consumerKey || !consumerSecret) {
    return res.status(400).json({ error: 'WHCC credentials not configured' });
  }
  try {
    const token = await fetchToken(consumerKey, consumerSecret, isSandbox);
    const response = await axios.get(`${getBaseUrl(isSandbox)}/api/ProductCatalog`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json(response.data);
  } catch (err) {
    console.error(
      '[WHCCProxy] Products error:',
      err?.response?.status,
      err?.response?.data || err.message
    );
    res
      .status(502)
      .json({ error: 'Failed to fetch WHCC product catalog', details: err?.response?.data || err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/whcc/order/import
// Imports an order into WHCC (step 1 of submission)
// Body: { consumerKey?, consumerSecret?, isSandbox?, ...WhccOrderRequest }
// ---------------------------------------------------------------------------
router.post('/whcc/order/import', adminRequired, async (req, res) => {
  const { consumerKey: bodyKey, consumerSecret: bodySecret, isSandbox: bodySandbox, ...orderRequest } =
    req.body;
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
      `${getBaseUrl(sandbox)}/api/OrderImport`,
      orderRequest,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    res.json(response.data);
  } catch (err) {
    console.error(
      '[WHCCProxy] Order import error:',
      err?.response?.status,
      err?.response?.data || err.message
    );
    res
      .status(502)
      .json({ error: 'Failed to import WHCC order', details: err?.response?.data || err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/whcc/order/submit/:confirmationId
// Submits an imported WHCC order (step 2 of submission)
// Body: { consumerKey?, consumerSecret?, isSandbox? }
// ---------------------------------------------------------------------------
router.post('/whcc/order/submit/:confirmationId', adminRequired, async (req, res) => {
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

export default router;

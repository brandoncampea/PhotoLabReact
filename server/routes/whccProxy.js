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
router.get('/whcc/products', adminRequired, async (req, res) => {
    console.log('[WHCCProxy] /whcc/products called', { consumerKey, isSandbox });
  let products = [];
  if (products.length > 0) {
    console.log('[WHCCProxy] Sample mapped product:', products[0]);
  }
  const { consumerKey, consumerSecret, isSandbox } = getCredentials(req);
  const requestUrl = `${getBaseUrl(isSandbox)}/api/catalog`;
  if (!consumerKey || !consumerSecret) {
    console.error('[WHCCProxy] Missing credentials:', { consumerKey, consumerSecret, isSandbox });
    return res.status(400).json({
      error: 'WHCC credentials not configured',
      consumerKey,
      consumerSecret,
      isSandbox
    });
  }
  try {
    console.log('[WHCCProxy] Fetching WHCC product catalog:', { requestUrl, consumerKey, isSandbox });
    const token = await fetchToken(consumerKey, consumerSecret, isSandbox);
    console.log('[WHCCProxy] Got WHCC token:', { token: token ? '***' : null });
    const response = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('[WHCCProxy] WHCC API response:', { status: response.status, data: response.data });
    // Group products by base name (removing size/dimensions from name)
    const baseNameGroups = {};
    function getBaseName(name, category) {
      // Remove size/dimensions from name (e.g., "8x10 Print" → "Print")
      const cleaned = name.replace(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\b/gi, '').replace(/\s+/g, ' ').trim();
      return cleaned || category || 'Other';
    }
    if (Array.isArray(response.data?.Categories)) {
      for (const category of response.data.Categories) {
        if (Array.isArray(category.ProductList)) {
          category.ProductList.forEach((prod) => {
            // Log raw product for debugging
            console.log('[WHCCProxy] Raw product:', prod);
            // Extract size, width, height from ProductNodes if available
            let size = prod.Size || '';
            let width = prod.Width || '';
            let height = prod.Height || '';
            if (Array.isArray(prod.ProductNodes) && prod.ProductNodes.length > 0) {
              const node = prod.ProductNodes[0];
              width = node.W || width;
              height = node.H || height;
              if (!size && width && height) {
                size = `${width}x${height}`;
              }
            }
            let basePrice = typeof prod.BasePrice === 'number' ? prod.BasePrice : (typeof prod.Cost === 'number' ? prod.Cost : 0);
            if (Array.isArray(prod.AttributeCategories)) {
              for (const attrCat of prod.AttributeCategories) {
                if (Array.isArray(attrCat.Attributes)) {
                  for (const attr of attrCat.Attributes) {
                    console.log('[WHCCProxy] Attribute:', attr);
                    if (basePrice === 0 && attr.AttributeName && /price|cost/i.test(attr.AttributeName) && typeof attr.Value === 'number') {
                      basePrice = attr.Value;
                    }
                  }
                }
              }
            }
            if (Array.isArray(prod.ProductNodes)) {
              for (const node of prod.ProductNodes) {
                console.log('[WHCCProxy] ProductNode:', node);
                if (basePrice === 0 && typeof node.BasePrice === 'number') {
                  basePrice = node.BasePrice;
                }
              }
            }
            if (!size) size = 'Unknown';
            // Compose size label
            let sizeLabel = prod.Name || '';
            if (width && height) {
              sizeLabel = `${width}x${height}`;
            } else if (size && size !== 'Unknown') {
              sizeLabel = size;
            }
            const mappedProduct = {
              productUID: prod.Id || prod.id,
              name: prod.Name || '',
              description: prod.Description || '',
              basePrice,
              category: category.Name || '',
              width,
              height,
              size: sizeLabel,
              raw: prod
            };
            console.log('[WHCCProxy] Mapped product:', mappedProduct);
            const baseName = getBaseName(mappedProduct.name, mappedProduct.category);
            if (!baseNameGroups[baseName]) baseNameGroups[baseName] = [];
            baseNameGroups[baseName].push(mappedProduct);
          });
        }
      }
    }
    if (Object.keys(baseNameGroups).length > 0) {
      const firstBase = Object.keys(baseNameGroups)[0];
      console.log('[WHCCProxy] Sample grouped product:', baseNameGroups[firstBase][0]);
    } else {
      console.log('[WHCCProxy] No products found in WHCC response.');
    }
    // Flatten products for frontend compatibility
    const flatProducts = Object.values(baseNameGroups).flat();
    res.json({ productsByBaseName: baseNameGroups, products: flatProducts, raw: response.data });
  } catch (err) {
    console.error('[WHCCProxy] Products error:', {
      requestUrl,
      consumerKey,
      consumerSecret,
      isSandbox,
      status: err?.response?.status,
      headers: err?.response?.headers,
      data: err?.response?.data,
      message: err?.message,
      stack: err?.stack
    });
    res.status(502).json({
      error: 'Failed to fetch WHCC product catalog from upstream.',
      details: err?.response?.data || err.message,
      requestUrl,
      consumerKey,
      consumerSecret,
      isSandbox
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/whcc/order/import
// Imports an order into WHCC (step 1 of submission)
// Body: { consumerKey?, consumerSecret?, isSandbox?, ...WhccOrderRequest }
// ---------------------------------------------------------------------------
router.post('/whcc/order/import', adminRequired, async (req, res) => {
    console.log('[WHCCProxy] /whcc/order/import called', { key, sandbox, orderRequest });
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

export default router;

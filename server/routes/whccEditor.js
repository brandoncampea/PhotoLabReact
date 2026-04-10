import express from 'express';
import axios from 'axios';
import mssql from '../mssql.cjs';
import { authRequired } from '../middleware/auth.js';

const { queryRow, queryRows } = mssql;
const router = express.Router();

const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toAbsoluteUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const appBase = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  if (!appBase) return null;
  return raw.startsWith('/') ? `${appBase}${raw}` : `${appBase}/${raw}`;
};

const getEditorIdsFromOptions = (options) => {
  const direct = options || {};
  const nested = direct.whccEditor || direct.editor || {};

  const productId = String(
    direct.whccEditorProductId ??
    direct.editorProductId ??
    direct.whcc_design_product_id ??
    nested.productId ??
    ''
  ).trim();

  const designId = String(
    direct.whccEditorDesignId ??
    direct.editorDesignId ??
    direct.whcc_design_id ??
    nested.designId ??
    ''
  ).trim();

  return {
    productId: productId || null,
    designId: designId || null,
  };
};

router.post('/session/create', authRequired, async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const key = String(process.env.WHCC_EDITOR_KEY || '').trim();
    const secret = String(process.env.WHCC_EDITOR_SECRET || '').trim();
    const apiBase = String(process.env.WHCC_EDITOR_API_BASE || 'https://prospector.dragdrop.design/api/v1').trim().replace(/\/$/, '');
    const appBase = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');

    if (!key || !secret) {
      return res.status(400).json({
        error: 'WHCC Editor API credentials are not configured',
        details: 'Set WHCC_EDITOR_KEY and WHCC_EDITOR_SECRET in environment.',
      });
    }

    const {
      productId,
      photoIds,
      photos,
      quantity,
      completeUrl,
      cancelUrl,
      overrideEditorProductId,
      overrideEditorDesignId,
    } = req.body || {};

    const numericProductId = Number(productId || 0);
    if (!numericProductId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const normalizedPhotoIds = Array.isArray(photoIds)
      ? photoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    const photoRows = normalizedPhotoIds.length
      ? await queryRows(
          `SELECT id,
                  file_name as fileName,
                  full_image_url as fullImageUrl,
                  thumbnail_url as thumbnailUrl,
                  width,
                  height
           FROM photos
           WHERE id IN (${normalizedPhotoIds.map((_, idx) => `$${idx + 1}`).join(', ')})`,
          normalizedPhotoIds
        )
      : [];

    const photoMap = new Map(photoRows.map((row) => [Number(row.id), row]));

    const payloadPhotos = (Array.isArray(photos) ? photos : [])
      .map((entry, index) => {
        const id = Number(entry?.id || entry?.photoId || normalizedPhotoIds[index] || 0);
        const dbPhoto = id ? photoMap.get(id) : null;
        const fullUrl = toAbsoluteUrl(entry?.fullImageUrl || entry?.printUrl || dbPhoto?.fullImageUrl || dbPhoto?.thumbnailUrl);
        const previewUrl = toAbsoluteUrl(entry?.url || entry?.thumbnailUrl || dbPhoto?.thumbnailUrl || dbPhoto?.fullImageUrl);

        if (!fullUrl && !previewUrl) return null;

        const width = Number(entry?.width || dbPhoto?.width || entry?.size?.original?.width || 0);
        const height = Number(entry?.height || dbPhoto?.height || entry?.size?.original?.height || 0);

        return {
          id: String(id || index + 1),
          name: String(entry?.name || dbPhoto?.fileName || `Photo ${id || index + 1}`),
          url: previewUrl || fullUrl,
          printUrl: fullUrl || previewUrl,
          filetype: String(entry?.filetype || 'jpg').toLowerCase() === 'png' ? 'png' : 'jpg',
          size: {
            original: {
              width: width > 0 ? width : 3000,
              height: height > 0 ? height : 2000,
            },
          },
        };
      })
      .filter(Boolean);

    if (!payloadPhotos.length && photoRows.length) {
      for (const row of photoRows) {
        const fullUrl = toAbsoluteUrl(row.fullImageUrl || row.thumbnailUrl);
        const previewUrl = toAbsoluteUrl(row.thumbnailUrl || row.fullImageUrl);
        if (!fullUrl && !previewUrl) continue;
        payloadPhotos.push({
          id: String(row.id),
          name: String(row.fileName || `Photo ${row.id}`),
          url: previewUrl || fullUrl,
          printUrl: fullUrl || previewUrl,
          filetype: 'jpg',
          size: {
            original: {
              width: Number(row.width) > 0 ? Number(row.width) : 3000,
              height: Number(row.height) > 0 ? Number(row.height) : 2000,
            },
          },
        });
      }
    }

    if (!payloadPhotos.length) {
      return res.status(400).json({ error: 'At least one photo with a public URL is required.' });
    }

    const product = await queryRow('SELECT id, name, options FROM products WHERE id = $1', [numericProductId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const options = safeJsonParse(product.options, {}) || {};
    const mapped = getEditorIdsFromOptions(options);
    const editorProductId = String(overrideEditorProductId || mapped.productId || '').trim();
    const editorDesignId = String(overrideEditorDesignId || mapped.designId || '').trim();

    if (!editorProductId || !editorDesignId) {
      return res.status(400).json({
        error: 'Missing WHCC Editor mapping for product',
        details: 'Store whccEditorProductId and whccEditorDesignId in products.options or pass overrides.',
      });
    }

    const accountId = `user-${userId}`;
    const tokenResponse = await axios.post(
      `${apiBase}/auth/access-token`,
      {
        key,
        secret,
        claims: { accountId },
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    const accessToken = tokenResponse?.data?.accessToken;
    if (!accessToken) {
      return res.status(502).json({ error: 'WHCC Editor access token was not returned' });
    }

    const fallbackComplete = appBase
      ? `${appBase}/cart?whccEditorComplete=1&editorId=%EDITOR_ID%`
      : 'http://localhost:3000/cart?whccEditorComplete=1&editorId=%EDITOR_ID%';
    const fallbackCancel = appBase
      ? `${appBase}/cart?whccEditorCancel=1`
      : 'http://localhost:3000/cart?whccEditorCancel=1';

    const editorResponse = await axios.post(
      `${apiBase}/editors`,
      {
        userId: accountId,
        productId: editorProductId,
        designId: editorDesignId,
        redirects: {
          complete: {
            text: 'Back to Cart',
            url: String(completeUrl || fallbackComplete),
          },
          cancel: {
            text: 'Cancel',
            url: String(cancelUrl || fallbackCancel),
          },
        },
        settings: {
          quantity: {
            default: Math.max(1, Number(quantity) || 1),
          },
          client: {
            vendor: 'default',
            hidePricing: true,
          },
        },
        photos: payloadPhotos,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    return res.json({
      editorId: editorResponse?.data?.editorId || null,
      url: editorResponse?.data?.url || null,
      productId: numericProductId,
      productName: product.name,
      photoCount: payloadPhotos.length,
    });
  } catch (error) {
    console.error('[WHCC Editor] Failed to create session:', error?.response?.status, error?.response?.data || error?.message || error);
    return res.status(500).json({
      error: 'Failed to create WHCC editor session',
      details: error?.response?.data || error?.message || null,
    });
  }
});

export default router;

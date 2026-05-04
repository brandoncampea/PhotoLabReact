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

const getRequestBaseUrl = (req) => {
  const configured = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`.replace(/\/$/, '');
};

const getFrontendBaseUrl = (req) => {
  const configured = String(
    process.env.FRONTEND_BASE_URL ||
    process.env.CLIENT_BASE_URL ||
    ''
  ).trim().replace(/\/$/, '');
  if (configured) return configured;

  const origin = String(req.headers.origin || '').trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(origin)) return origin;

  const appBase = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  return appBase;
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
    const apiPublicBase = getRequestBaseUrl(req);
    const frontendBase = getFrontendBaseUrl(req);

    if (!key || !secret) {
      return res.status(400).json({
        error: 'WHCC Editor API credentials are not configured',
        details: 'Set WHCC_EDITOR_KEY and WHCC_EDITOR_SECRET in environment.',
      });
    }

    const {
      productId,
      photoIds,
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
      ? [...new Set(photoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];

    if (!normalizedPhotoIds.length) {
      return res.status(400).json({
        error: 'At least one existing album photo is required.',
        details: 'WHCC editor sessions only support photos already stored in this account albums.',
      });
    }

    const photoRows = await queryRows(
      `SELECT p.id,
              p.album_id as albumId,
              p.file_name as fileName,
              p.full_image_url as fullImageUrl,
              p.thumbnail_url as thumbnailUrl,
              p.width,
              p.height
       FROM photos p
       INNER JOIN albums a ON a.id = p.album_id
       WHERE p.id IN (${normalizedPhotoIds.map((_, idx) => `$${idx + 1}`).join(', ')})`,
      normalizedPhotoIds
    );

    const photoMap = new Map(photoRows.map((row) => [Number(row.id), row]));
    const missingPhotoIds = normalizedPhotoIds.filter((id) => !photoMap.has(id));

    if (missingPhotoIds.length) {
      return res.status(400).json({
        error: 'Some selected photos are unavailable.',
        details: 'WHCC editor sessions only support photos from existing albums stored in the database.',
        missingPhotoIds,
      });
    }

    const payloadPhotos = normalizedPhotoIds
      .map((id) => {
        const row = photoMap.get(id);
        if (!row) return null;

        const previewUrl = apiPublicBase ? `${apiPublicBase}/api/photos/${row.id}/asset?variant=thumb` : null;
        const fullUrl = apiPublicBase ? `${apiPublicBase}/api/photos/${row.id}/asset?variant=full` : null;
        if (!fullUrl && !previewUrl) return null;

        const fileName = String(row.fileName || '');
        const isPng = /\.png$/i.test(fileName);

        return {
          id: String(row.id),
          name: String(fileName || `Photo ${row.id}`),
          url: previewUrl || fullUrl,
          printUrl: fullUrl || previewUrl,
          filetype: isPng ? 'png' : 'jpg',
          size: {
            original: {
              width: Number(row.width) > 0 ? Number(row.width) : 3000,
              height: Number(row.height) > 0 ? Number(row.height) : 2000,
            },
          },
        };
      })
      .filter(Boolean);

    if (!payloadPhotos.length) {
      return res.status(400).json({
        error: 'Selected album photos are missing public image URLs.',
        details: 'WHCC editor sessions require existing album photos with accessible preview or print URLs.',
      });
    }

    const product = await queryRow('SELECT id, name, category, options FROM products WHERE id = $1', [numericProductId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const options = safeJsonParse(product.options, {}) || {};
    const mapped = getEditorIdsFromOptions(options);
    const editorProductId = String(overrideEditorProductId || mapped.productId || '').trim();
    const editorDesignId = String(overrideEditorDesignId || mapped.designId || '').trim();

    if (!editorProductId) {
      return res.status(400).json({
        error: 'Missing WHCC Editor mapping for product',
        details: 'Store whccEditorProductId in products.options or pass overrideEditorProductId.',
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

    const fallbackComplete = frontendBase
      ? `${frontendBase}/cart?whccEditorComplete=1&editorId=%EDITOR_ID%`
      : 'http://localhost:3000/cart?whccEditorComplete=1&editorId=%EDITOR_ID%';
    const fallbackCancel = frontendBase
      ? `${frontendBase}/cart?whccEditorCancel=1`
      : 'http://localhost:3000/cart?whccEditorCancel=1';

    const editorPayload = {
      userId: accountId,
      productId: editorProductId,
      ...(editorDesignId ? { designId: editorDesignId } : {}),
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
    };

    const editorResponse = await axios.post(
      `${apiBase}/editors`,
      editorPayload,
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

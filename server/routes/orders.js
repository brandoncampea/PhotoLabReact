import express from 'express';
import jwt from 'jsonwebtoken';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { authRequired, adminRequired, superAdminRequired } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = express.Router();

// Batch update status and notify customers (admin)
router.post('/admin/batch-update-status', adminRequired, async (req, res) => {
  try {
    const { orderIds, status, message } = req.body;
    if (!Array.isArray(orderIds) || !orderIds.length || !['completed', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid orderIds or status' });
    }
    let updatedCount = 0;
    for (const orderId of orderIds) {
      // Update status
      await query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
      updatedCount++;
      // Fetch order and items for email
      const order = await queryRow('SELECT o.*, u.email as customerEmail, u.name as customerName FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1', [orderId]);
      // Join products and photos for correct productName and photoFileName
      const items = await queryRows(`
        SELECT oi.id as id, oi.photo_id as photoId, oi.photo_ids as photoIds, oi.product_id as productId, oi.product_size_id as productSizeId, oi.quantity, oi.price as price, oi.crop_data as cropData, oi.digital_download_scope as digitalDownloadScope, oi.studio_revenue_amount as studioRevenueAmount, oi.base_revenue_amount as baseRevenueAmount, oi.production_cost_amount as productionCostAmount, oi.studio_payout_amount as studioPayoutAmount, oi.super_admin_share_amount as superAdminShareAmount, oi.stripe_fee_allocated_amount as stripeFeeAllocatedAmount, oi.studio_net_payout_amount as studioNetPayoutAmount, p.name as productName, ph.file_name as photoFileName
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN photos ph ON ph.id = oi.photo_id
        WHERE oi.order_id = $1
      `, [orderId]);
      // Fetch studio email for Reply-To
      let studioEmail = null;
      if (items && items.length > 0) {
        // Try to get studio email from first item (if available)
        if (items[0].studioId) {
          const studio = await queryRow('SELECT email FROM studios WHERE id = $1', [items[0].studioId]);
          if (studio && studio.email) studioEmail = studio.email;
        }
      }
      try {
        await orderReceiptService.sendCustomerReceipt({
          to: order.customerEmail,
          customerName: order.customerName,
          order: { ...order, status },
          items,
          customMessage: message,
          isUpdate: true,
          replyTo: studioEmail,
        });
      } catch (emailErr) {
        // Log but do not fail batch
        console.error('[Batch Status Email] Failed to send for order', orderId, emailErr);
      }
    }
    return res.json({ success: true, updatedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
import orderReceiptService from '../services/orderReceiptService.js';
import { fetchToken as fetchWhccToken } from './whccProxy.js';

// --- API: Get WHCC preview payload for an order (admin/studio only) ---

// WHCC Preview: Generate and store WHCC JSON in order's whcc_lab_details for review
router.get('/admin/:orderId/whcc-preview', adminRequired, async (req, res) => {
  // Debug logging for session/cookie comparison
  console.log('[WHCC PREVIEW ROUTE] --- DEBUG START ---');
  console.log('[WHCC PREVIEW ROUTE] sessionID:', req.sessionID);
  console.log('[WHCC PREVIEW ROUTE] session:', req.session);
  console.log('[WHCC PREVIEW ROUTE] user:', req.user);
  if (req.headers.cookie) {
    console.log('[WHCC PREVIEW ROUTE] req.headers.cookie:', req.headers.cookie);
    const sidMatch = req.headers.cookie.match(/connect\.sid=([^;]+)/);
    if (sidMatch) {
      console.log('[WHCC PREVIEW ROUTE] Parsed connect.sid from cookie:', decodeURIComponent(sidMatch[1]));
    }
  }
  console.log('[WHCC PREVIEW ROUTE] --- DEBUG END ---');
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) return res.status(400).json({ error: 'Invalid orderId' });
    // Accept optional specialInstructions query param to regenerate preview
    const specialInstructions = req.query.specialInstructions ? String(req.query.specialInstructions).trim() : undefined;
    // Use the same centralized code as batch submission, but do not submit
    const result = await submitOrderToWhcc(orderId, { previewOnly: true, specialInstructions });
    if (!result || !result.whccPayload) return res.status(404).json({ error: 'Order not found or not eligible for WHCC' });

    // Normalize ItemAttributes in preview response for WHCC order items
    if (Array.isArray(result.whccPayload?.whccOrderItems)) {
      for (const item of result.whccPayload.whccOrderItems) {
        let attrs = [];
        if (item.ItemAttributes) {
          if (Array.isArray(item.ItemAttributes)) {
            // If already [{AttributeUID:...}], keep as is, else map
            if (item.ItemAttributes.length && typeof item.ItemAttributes[0] === 'object' && item.ItemAttributes[0].AttributeUID) {
              attrs = item.ItemAttributes;
            } else {
              attrs = item.ItemAttributes
                .map(uid => Number(uid?.AttributeUID ?? uid))
                .filter(uid => Number.isInteger(uid) && uid > 0)
                .map(uid => ({ AttributeUID: uid }));
            }
          } else if (typeof item.ItemAttributes === 'string') {
            try { attrs = JSON.parse(item.ItemAttributes); } catch { attrs = [item.ItemAttributes]; }
            attrs = attrs
              .map(uid => Number(uid?.AttributeUID ?? uid))
              .filter(uid => Number.isInteger(uid) && uid > 0)
              .map(uid => ({ AttributeUID: uid }));
          }
        }
        // Always set ItemAttributes for WHCC if any
        if (attrs.length) {
          item.ItemAttributes = attrs;
        } else {
          delete item.ItemAttributes;
        }
        // Debug log for ItemAttributes
        console.log('[WHCC][DEBUG] ItemAttributes for order item', item.id, ':', JSON.stringify(item.ItemAttributes));
      }
    }

    // Return only the JSON for review (no DB persistence)
    return res.json(result.whccPayload);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// (buildWhccOrderPayload is now obsolete; use submitOrderToWhcc directly for preview and submission)

// --- API: Approve or reject an order (admin/studio only) ---
router.post('/admin/:orderId/whcc-approval', adminRequired, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { action, specialInstructions } = req.body;
    const trimmedSpecialInstructions = String(specialInstructions || '').trim();
    if (!orderId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid orderId or action' });
    }
    const order = await queryRow('SELECT o.id, o.approval_status FROM orders o WHERE o.id = $1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    if (!(order.approval_status === 'approved' && action === 'approve')) {
      await query('UPDATE orders SET approval_status = $1, approved_at = CASE WHEN $1 = \'approved\' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = $2', [newStatus, orderId]);
    }
    // If approved, trigger WHCC submission (forceSubmit)
    if (action === 'approve') {
      try {
        const submitResult = await submitOrderToWhcc(orderId, {
          forceSubmit: true,
          specialInstructions: trimmedSpecialInstructions || null,
          throwOnError: true,
        });
        return res.json({
          success: true,
          approvalStatus: 'approved',
          status: 'submitted',
          message: order.approval_status === 'approved' ? 'Order already approved and re-submitted to WHCC' : 'Order approved and submitted to WHCC',
          confirmationId: submitResult?.confirmationId || null,
        });
      } catch (err) {
        return res.status(500).json({
          error: 'Order approved but WHCC submission failed',
          details: err?.details || err?.message || err,
        });
      }
    }
    return res.json({ success: true, approvalStatus: newStatus });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// --- API: Batch approve/reject (admin/studio only) ---
router.post('/admin/whcc-approval/batch', adminRequired, async (req, res) => {
  try {
    const { orderIds, action } = req.body;
    if (!Array.isArray(orderIds) || !orderIds.length || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid orderIds or action' });
    }
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await query(`UPDATE orders SET approval_status = $1, approved_at = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id IN (${orderIds.map((_, i) => `$${i + 2}`).join(',')})`, [newStatus, ...orderIds]);
    // If approved, trigger WHCC submission for all
    if (action === 'approve') {
      for (const orderId of orderIds) {
        try {
          await submitOrderToWhcc(orderId, { forceSubmit: true });
        } catch (err) {
          // Log but do not fail batch
          console.error(`[WHCC][BATCH APPROVAL] Failed to submit order ${orderId}:`, err?.message || err);
        }
      }
    }
    return res.json({ success: true, approvalStatus: newStatus });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// Admin: Resend digital download links for an order
router.post('/admin/:orderId/resend-digital-download', adminRequired, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) return res.status(400).json({ success: false, message: 'Invalid orderId', digitalItemCount: 0 });

    // Fetch order and items
    const order = await queryRow(
      `SELECT o.id, o.user_id as userId, o.total as totalAmount, o.subtotal, o.tax_amount as taxAmount, o.shipping_cost as shippingCost, o.stripe_fee_amount as stripeFeeAmount, o.shipping_address as shippingAddress, o.created_at as createdAt, u.email as customerEmail, u.name as customerName
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found', digitalItemCount: 0 });

    const items = await queryRows(
      `SELECT oi.id as id, oi.photo_id as photoId, oi.photo_ids as photoIds, oi.source_album_id as sourceAlbumId, oi.digital_download_scope as digitalDownloadScope, oi.quantity, oi.price as unitPrice, ph.file_name as photoFileName, ph.album_id as photoAlbumId, COALESCE(oi.product_options_snapshot, p.options) as productOptions, oi.attributes as attributes, p.category as productCategory, p.name as productName
        FROM order_items oi
        INNER JOIN photos ph ON ph.id = oi.photo_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = $1`,
      [orderId]
     );

    // Only use item.attributes from DB (order_items.attributes), no fallback to productOptions or productOptionsSnapshot
    // Also, return both the parsed items and the original for reuse
    const parsedItems = items.map(item => {
      let attrs = [];
      if (item.attributes) {
        if (typeof item.attributes === 'string') {
          try { attrs = JSON.parse(item.attributes); } catch { attrs = [item.attributes]; }
        } else if (Array.isArray(item.attributes)) {
          attrs = item.attributes;
        }
        // Ensure attrs is an array of numbers
        if (Array.isArray(attrs)) {
          attrs = attrs.map(x => typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x).filter(x => typeof x === 'number' && x > 0);
        }
      }
      // Always wrap as [{ AttributeUID: ... }]
      return {
        ...item,
        attributes: attrs.length ? attrs.map(uid => ({ AttributeUID: uid })) : [],
      };
    });
    // Use parsedItems for both digital and WHCC payloads
    // Build digital download links
    const appBase = String(process.env.APP_BASE_URL || process.env.CANONICAL_APP_URL || 'https://labs.campeaphotography.com').trim().replace(/\/$/, '');
    const digitalDownloads = items
      .filter((item) => isDigitalDownloadItem(item))
      .map((item) => {
        const downloadScope = resolveDigitalDownloadScope({ item });
        const token = createDigitalDownloadToken({
          orderId: order.id,
          userId: order.userId,
          orderItemId: item.id,
          photoId: item.photoId,
          downloadScope,
          sourceAlbumId: resolveDigitalSourceAlbumId({ item }),
        });
        const relativeUrl = `/api/orders/digital-download/${token}`;
        // Always use the actual filename for digital downloads, sanitized
        const rawFileName = item.photoFileName || item.fileName || item.filename || `photo_${item.photoId}.jpg`;
        const fileName = sanitizeDownloadFileName(rawFileName, `photo_${item.photoId}.jpg`);
        return {
          orderItemId: item.id,
          photoId: item.photoId,
          productName: item.productName,
          photoFileName: fileName,
          url: appBase ? `${appBase}${relativeUrl}` : relativeUrl,
        };
      });

    if (!digitalDownloads.length) {
      return res.status(400).json({ success: false, message: 'No digital items in this order', digitalItemCount: 0 });
    }

    const parsedShippingAddress = safeJsonParse(order.shippingAddress, {});
    const recipientEmail = parsedShippingAddress?.email || order.customerEmail;
    const customerName = parsedShippingAddress?.fullName || order.customerName;

    // Fetch studio email for Reply-To
    let studioEmail = null;
    if (items && items.length > 0) {
      // Try to get studio email from first item (if available)
      if (items[0].studioId) {
        const studio = await queryRow('SELECT email FROM studios WHERE id = $1', [items[0].studioId]);
        if (studio && studio.email) studioEmail = studio.email;
      }
    }
    // Send the email
    await orderReceiptService.sendCustomerReceipt({
      to: recipientEmail,
      customerName,
      order,
      items,
      digitalDownloads,
      replyTo: studioEmail,
    });

    return res.json({ success: true, message: `Resent digital download links to ${recipientEmail}`, digitalItemCount: digitalDownloads.length, recipientEmail });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message, digitalItemCount: 0 });
  }
});



// Update Stripe fee for an order after payment confirmation
router.patch('/update-stripe-fee/:orderId', authRequired, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }
    const order = await queryRow('SELECT payment_intent_id FROM orders WHERE id = $1', [orderId]);
    if (!order || !order.payment_intent_id) {
      return res.status(404).json({ error: 'Order or payment intent not found' });
    }
    const paymentAccounting = await fetchPaymentIntentAccounting(order.payment_intent_id);
    await query('UPDATE orders SET stripe_fee_amount = $1 WHERE id = $2', [paymentAccounting.stripeFeeAmount, orderId]);
    res.json({ success: true, stripeFeeAmount: paymentAccounting.stripeFeeAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const ensureOrderItemAccountingSchema = async () => {
  await query(`
    IF COL_LENGTH('order_items', 'product_options_snapshot') IS NULL
      ALTER TABLE order_items ADD product_options_snapshot NVARCHAR(MAX) NULL;
    IF COL_LENGTH('order_items', 'attributes') IS NULL
      ALTER TABLE order_items ADD attributes NVARCHAR(MAX) NULL;
    IF COL_LENGTH('order_items', 'fulfillment_type') IS NULL
      ALTER TABLE order_items ADD fulfillment_type NVARCHAR(32) NULL;
    IF COL_LENGTH('order_items', 'digital_download_scope') IS NULL
      ALTER TABLE order_items ADD digital_download_scope NVARCHAR(32) NULL;
    IF COL_LENGTH('order_items', 'source_album_id') IS NULL
      ALTER TABLE order_items ADD source_album_id INT NULL;
    IF COL_LENGTH('order_items', 'pricing_snapshot') IS NULL
      ALTER TABLE order_items ADD pricing_snapshot NVARCHAR(MAX) NULL;
    IF COL_LENGTH('order_items', 'studio_revenue_amount') IS NULL
      ALTER TABLE order_items ADD studio_revenue_amount FLOAT NULL;
    IF COL_LENGTH('order_items', 'base_revenue_amount') IS NULL
      ALTER TABLE order_items ADD base_revenue_amount FLOAT NULL;
    IF COL_LENGTH('order_items', 'production_cost_amount') IS NULL
      ALTER TABLE order_items ADD production_cost_amount FLOAT NULL;
    IF COL_LENGTH('order_items', 'gross_studio_markup_amount') IS NULL
      ALTER TABLE order_items ADD gross_studio_markup_amount FLOAT NULL;
    IF COL_LENGTH('order_items', 'studio_payout_amount') IS NULL
      ALTER TABLE order_items ADD studio_payout_amount FLOAT NULL;
    IF COL_LENGTH('order_items', 'super_admin_share_amount') IS NULL
      ALTER TABLE order_items ADD super_admin_share_amount FLOAT NULL;
    IF COL_LENGTH('order_items', 'stripe_fee_allocated_amount') IS NULL
      ALTER TABLE order_items ADD stripe_fee_allocated_amount FLOAT NULL;
    IF COL_LENGTH('order_items', 'studio_net_payout_amount') IS NULL
      ALTER TABLE order_items ADD studio_net_payout_amount FLOAT NULL;
  `);
};

const stringifyForDb = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'Failed to serialize value' });
  }
};

const previewSecret = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 8) return `${raw.slice(0, 2)}…${raw.slice(-2)}`;
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const DOWNLOAD_TOKEN_SECRET = String(process.env.DOWNLOAD_TOKEN_SECRET || process.env.JWT_SECRET || 'photo-lab-download-secret');

const normalizeDigitalDownloadScope = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'album' ? 'album' : 'photo';
};

const getDigitalDownloadScope = (productOptions = {}) => {
  return normalizeDigitalDownloadScope(
    productOptions?.digitalDownloadScope ??
    productOptions?.downloadScope ??
    productOptions?.digital_download_scope ??
    'photo'
  );
};

const hasExplicitDigitalDownloadScope = (item = {}) => {
  const options = safeJsonParse(item?.productOptions ?? item?.productOptionsSnapshot, {}) || {};
  return Boolean(
    String(item?.digitalDownloadScope || '').trim() ||
    String(options?.digitalDownloadScope || '').trim() ||
    String(options?.downloadScope || '').trim() ||
    String(options?.digital_download_scope || '').trim()
  );
};

const resolveDigitalDownloadScope = ({ item = {}, tokenPayload = null, defaultScope = 'photo' } = {}) => {
  const options = safeJsonParse(item?.productOptions ?? item?.productOptionsSnapshot, {}) || {};
  const explicitScopes = [];

  if (String(item?.digitalDownloadScope || '').trim()) {
    explicitScopes.push(normalizeDigitalDownloadScope(item.digitalDownloadScope));
  }

  if (
    String(options?.digitalDownloadScope || '').trim() ||
    String(options?.downloadScope || '').trim() ||
    String(options?.digital_download_scope || '').trim()
  ) {
    explicitScopes.push(getDigitalDownloadScope(options));
  }

  if (String(tokenPayload?.downloadScope || '').trim()) {
    explicitScopes.push(normalizeDigitalDownloadScope(tokenPayload.downloadScope));
  }

  if (explicitScopes.includes('album')) return 'album';
  if (explicitScopes.includes('photo')) return 'photo';
  return normalizeDigitalDownloadScope(defaultScope);
};

const resolveDigitalSourceAlbumId = ({ item = {}, tokenPayload = null } = {}) => {
  const candidates = [item?.sourceAlbumId, item?.photoAlbumId, tokenPayload?.sourceAlbumId];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
};

const getDigitalPricingMode = (productOptions = {}) => {
  const normalized = String(
    productOptions?.digitalPricingMode ??
    productOptions?.pricingMode ??
    productOptions?.digital_pricing_mode ??
    ''
  ).trim().toLowerCase();
  return normalized === 'percentage' ? 'percentage' : 'fixed';
};

const getDigitalSuperAdminPercentage = (productOptions = {}) => {
  const value = Number(
    productOptions?.superAdminPercentage ??
    productOptions?.digitalCommissionPercent ??
    productOptions?.commissionPercent ??
    productOptions?.digital_percent ??
    0
  );
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const sanitizeDownloadFileName = (value, fallback = 'photo') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
};

const buildAssetBaseUrl = (req) => {
  const configured = String(process.env.APP_BASE_URL || process.env.CANONICAL_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`.replace(/\/$/, '');
};

const resolveAssetRequestUrl = (assetUrl, req) => {
  const rawUrl = String(assetUrl || '').trim();
  if (!rawUrl) return '';

  try {
    return new URL(rawUrl).toString();
  } catch {}

  const baseUrl = buildAssetBaseUrl(req);
  if (!baseUrl) return '';

  try {
    return new URL(rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`, `${baseUrl}/`).toString();
  } catch {
    return '';
  }
};

const isDigitalProductRow = (item) => {
  const options = safeJsonParse(item?.productOptions ?? item?.productOptionsSnapshot, {}) || {};
  const category = String(item?.productCategory || '').toLowerCase();
  const name = String(item?.productName || '').toLowerCase();
  return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
};

const isDigitalDownloadItem = (item) => hasExplicitDigitalDownloadScope(item) || isDigitalProductRow(item);

const createDigitalDownloadToken = ({ orderId, userId, orderItemId, photoId = null, downloadScope = 'photo', sourceAlbumId = null }) => jwt.sign(
  {
    scope: 'digital-download',
    orderId: Number(orderId),
    userId: Number(userId),
    orderItemId: Number(orderItemId),
    photoId: Number(photoId) || 0,
    downloadScope: normalizeDigitalDownloadScope(downloadScope),
    sourceAlbumId: Number(sourceAlbumId) || 0,
  },
  DOWNLOAD_TOKEN_SECRET,
  { expiresIn: '30d' }
);

const getOrderStudioIdFromItems = async (items) => {
  let studioId = null;

  for (const item of items || []) {
    const photoIds = Array.isArray(item.photoIds)
      ? item.photoIds
      : item.photoId
      ? [item.photoId]
      : [];
    const primaryPhotoId = photoIds[0];
    if (!primaryPhotoId) continue;

    const album = await queryRow(
      `SELECT a.studio_id as studioId
       FROM photos p
       INNER JOIN albums a ON a.id = p.album_id
       WHERE p.id = $1`,
      [primaryPhotoId]
    );

    if (!album?.studioId) continue;

    if (studioId && Number(album.studioId) !== Number(studioId)) {
      throw new Error('Orders cannot span multiple studios');
    }

    studioId = Number(album.studioId);
  }

  return studioId;
};

const validateBatchEligibilityForOrder = async ({ studioId, items }) => {
  if (!studioId) {
    return { ok: false, error: 'Unable to determine studio for batch shipping' };
  }

  const shippingConfig = await queryRow(
    `SELECT is_active as isActive,
            batch_deadline as batchDeadline
     FROM shipping_config
     WHERE id = $1`,
    [studioId]
  );

  if (!shippingConfig || !shippingConfig.isActive) {
    return { ok: false, error: 'Batch shipping is not active for this studio' };
  }

  // PATCH: Remove deadline check to allow batch release at any time
  // const deadlineRaw = shippingConfig.batchDeadline;
  // const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  // if (!deadline || Number.isNaN(deadline.getTime())) {
  //   return { ok: false, error: 'Batch shipping deadline is not configured' };
  // }
  // if (deadline <= new Date()) {
  //   return { ok: false, error: 'Batch shipping deadline has passed' };
  // }

  for (const item of items || []) {
    const photoIds = Array.isArray(item.photoIds)
      ? item.photoIds
      : item.photoId
      ? [item.photoId]
      : [];
    const primaryPhotoId = photoIds[0];
    if (!primaryPhotoId) continue;

    const album = await queryRow(
      `SELECT a.id as albumId,
              COALESCE(a.batch_shipping_active, 0) as batchShippingActive
       FROM photos p
       INNER JOIN albums a ON a.id = p.album_id
       WHERE p.id = $1`,
      [primaryPhotoId]
    );

    if (!album?.albumId) {
      return { ok: false, error: 'Unable to validate batch shipping album eligibility' };
    }

    if (!album.batchShippingActive) {
      return { ok: false, error: 'One or more items are not eligible for batch shipping' };
    }
  }

  return {
    ok: true
  };
};

const resolveOrderAccessStudioId = (req) => {
  const headerStudioIdRaw = req.headers['x-acting-studio-id'];
  const headerStudioId = Number(Array.isArray(headerStudioIdRaw) ? headerStudioIdRaw[0] : headerStudioIdRaw);

  if (Number.isInteger(headerStudioId) && headerStudioId > 0) {
    return headerStudioId;
  }

  return Number(req.user?.studio_id) || null;
};

const resolveConfiguredLabVendor = async (studioId) => {
  const fallback = 'whcc';
  if (!studioId) return fallback;

  try {
    const studio = await queryRow(
      `SELECT lab_vendors as labVendors
       FROM studios
       WHERE id = $1`,
      [studioId]
    );

    const parsed = safeJsonParse(studio?.labVendors, []);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallback;
    }

    const normalized = parsed.map((entry) => String(entry || '').toLowerCase()).filter(Boolean);
    if (normalized.includes('whcc')) return 'whcc';
    return normalized[0] || fallback;
  } catch {
    return fallback;
  }
};

const getSuperAdminReceiptBcc = async () => {
  const envEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

  let dbEmails = [];
  try {
    const rows = await queryRows(
      `SELECT email
       FROM users
       WHERE role = 'super_admin'
         AND is_active = 1
         AND email IS NOT NULL`,
      []
    );
    dbEmails = rows.map((row) => normalizeEmail(row.email)).filter(Boolean);
  } catch (error) {
    console.error('Failed to load super admin BCC recipients:', error?.message || error);
  }

  return Array.from(new Set([...envEmails, ...dbEmails]));
};

const getConfiguredStripeClient = async () => {
  const envKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!envKey || envKey.includes('example') || envKey.includes('***')) {
    return null;
  }
  const Stripe = (await import('stripe')).default;
  return new Stripe(envKey, { apiVersion: '2023-10-16' });
};

const fetchPaymentIntentAccounting = async (paymentIntentId) => {
  if (!paymentIntentId || String(paymentIntentId).startsWith('pi_mock_')) {
    return {
      paymentIntentId: paymentIntentId || null,
      chargeId: null,
      stripeFeeAmount: 0,
    };
  }

  try {
    const stripe = await getConfiguredStripeClient();
    if (!stripe) {
      return { paymentIntentId, chargeId: null, stripeFeeAmount: 0 };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });

    const latestCharge = typeof paymentIntent.latest_charge === 'string'
      ? { id: paymentIntent.latest_charge, balance_transaction: null }
      : paymentIntent.latest_charge;

    const stripeFeeAmount = Number(latestCharge?.balance_transaction?.fee || 0) / 100;

    return {
      paymentIntentId: paymentIntent.id,
      chargeId: latestCharge?.id || null,
      stripeFeeAmount,
    };
  } catch (error) {
    console.error('Failed to retrieve Stripe fee accounting:', error?.message || error);
    return {
      paymentIntentId,
      chargeId: null,
      stripeFeeAmount: 0,
    };
  }
};

const calculateItemAccountingSnapshot = ({
  unitPrice,
  quantity,
  baseUnitPrice,
  productionUnitCost,
  isDigital,
  productOptions,
}) => {
  const qty = Math.max(1, Number(quantity) || 1);
  const retailUnitPrice = Number(unitPrice) || 0;
  const grossRevenue = retailUnitPrice * qty;
  const baseUnit = Number(baseUnitPrice) || 0;
  const productionUnit = isDigital ? 0 : (Number(productionUnitCost) || 0);

  if (isDigital && getDigitalPricingMode(productOptions) === 'percentage') {
    const superAdminPercentage = getDigitalSuperAdminPercentage(productOptions);
    const superAdminShare = grossRevenue * (superAdminPercentage / 100);
    const studioPayout = grossRevenue - superAdminShare;
    return {
      fulfillmentType: 'digital',
      digitalDownloadScope: getDigitalDownloadScope(productOptions),
      studioRevenueAmount: grossRevenue,
      baseRevenueAmount: superAdminShare,
      productionCostAmount: 0,
      grossStudioMarkupAmount: studioPayout,
      studioPayoutAmount: studioPayout,
      superAdminShareAmount: superAdminShare,
      pricingSnapshot: {
        retailUnitPrice,
        quantity: qty,
        accountingMode: 'digital-percentage',
        superAdminPercentage,
        digitalDownloadScope: getDigitalDownloadScope(productOptions),
      },
    };
  }

  const baseRevenue = baseUnit * qty;
  const productionCost = productionUnit * qty;
  const grossStudioMarkup = grossRevenue - baseRevenue;
  const studioPayout = grossStudioMarkup;
  const superAdminShare = baseRevenue - productionCost;

  return {
    fulfillmentType: isDigital ? 'digital' : 'physical',
    digitalDownloadScope: isDigital ? getDigitalDownloadScope(productOptions) : null,
    studioRevenueAmount: grossRevenue,
    baseRevenueAmount: baseRevenue,
    productionCostAmount: productionCost,
    grossStudioMarkupAmount: grossStudioMarkup,
    studioPayoutAmount: studioPayout,
    superAdminShareAmount: superAdminShare,
    pricingSnapshot: {
      retailUnitPrice,
      quantity: qty,
      accountingMode: isDigital ? 'digital-fixed' : 'physical-base-price',
      baseUnitPrice: baseUnit,
      productionUnitCost: productionUnit,
      digitalDownloadScope: isDigital ? getDigitalDownloadScope(productOptions) : null,
    },
  };
};


// --- Utility functions must be hoisted above their first usage ---
const parseProductOptions = (value) => safeJsonParse(value, {}) || {};
const isDigitalOrderItem = (item, productOptions = null) => {
  const category = String(item?.productCategory || '').toLowerCase();
  const name = String(item?.productName || '').toLowerCase();
  const options = productOptions || parseProductOptions(item?.productOptions);
  const optionDigital =
    options?.isDigital === true ||
    options?.is_digital_only === true ||
    options?.digitalOnly === true;
  return optionDigital || category.includes('digital') || name.includes('digital');
};

const submitOrderToWhcc = async (orderId, options = {}) => {

  // Approval/preview logic: if not forced, only generate preview and set approval_status to 'pending'.
  // Only submit to WHCC if approval_status is 'approved' or options.forceSubmit === true.
  const forceSubmit = options?.forceSubmit === true;
  const previewOnly = options?.previewOnly === true;
  const throwOnError = options?.throwOnError === true;

  // Declare webhookId at function scope for use in both webhook registration and order request building
  let webhookId = null;

  // --- GUARD: Prevent WHCC submission for digital-only orders ---
  // Fetch all order items for this order
  const items = await queryRows(
    `SELECT oi.id, oi.product_id, oi.product_options_snapshot, p.category as productCategory, p.name as productName, p.options as productOptions
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1`,
    [orderId]
  );
  if (items && items.length > 0) {
    const allDigital = items.every((item) => isDigitalOrderItem(item));
    if (allDigital) {
      console.log(`[WHCC] Skipping WHCC submission for digital-only order ${orderId}`);
      return { skipped: true, reason: 'digital-only' };
    }
  }

    if (!previewOnly) {
      // Ensure axios is loaded before first use
      const axios = (await import('axios')).default;
      // Ensure isSandbox is defined before first use
      const isSandbox = process.env.WHCC_SANDBOX === 'true';
      // Get WHCC credentials from environment (support both naming conventions)
      const consumerKey = process.env.WHCC_CONSUMER_KEY || process.env.WHCC_API_KEY;
      const consumerSecret = process.env.WHCC_CONSUMER_SECRET || process.env.WHCC_API_SECRET;
      if (!consumerKey || !consumerSecret) {
        console.warn('[WHCC] WHCC credentials not configured (set WHCC_API_KEY/WHCC_API_SECRET or WHCC_CONSUMER_KEY/WHCC_CONSUMER_SECRET); skipping WHCC webhook registration');
      } else {
        // Fetch WHCC OAuth token for webhook registration
        const { fetchToken: fetchWhccToken } = await import('./whccProxy.js');
        let token;
        try {
          token = await fetchWhccToken(consumerKey, consumerSecret, isSandbox);
        } catch (tokenErr) {
          console.error('[WHCC][ERROR] Failed to fetch WHCC OAuth token for webhook registration:', tokenErr?.message || tokenErr);
          token = null;
        }

        // Register webhook with WHCC and get webhookId
        if (token) {
          webhookId = null;
          // Prepare webhook registration URL
          const webhookUrl = process.env.WHCC_WEBHOOK_URL || `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/whcc-webhook`;
          // Register webhook with WHCC
          try {
            const webhookRegisterResponse = await axios.post(
              `${isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com'}/api/callback/create`,
              {
                callbackUri: webhookUrl
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            webhookId = webhookRegisterResponse?.data?.WebhookId || webhookRegisterResponse?.data?.webhookId || null;
            if (!webhookId) {
              console.error('[WHCC][ERROR] Webhook registration did not return a webhookId. Response:', webhookRegisterResponse?.data);
              // Proceed without webhook, do not abort submission
            } else {
              console.log('[WHCC] Registered webhook with ID:', webhookId);
              // Store webhookId in all orders in the batch (or single order)
              const webhookOrderIds = (typeof targetOrderIds !== 'undefined' && Array.isArray(targetOrderIds))
                ? targetOrderIds
                : [orderId];
              for (const oid of webhookOrderIds) {
                try {
                  await query(
                    `UPDATE orders SET whcc_webhook_id = $1 WHERE id = $2`,
                    [webhookId, oid]
                  );
                  // Insert or update whcc_webhook_status
                  await query(
                    `MERGE whcc_webhook_status AS target
                     USING (SELECT $1 AS order_id, $2 AS webhook_id) AS src
                     ON (target.order_id = src.order_id)
                     WHEN MATCHED THEN
                       UPDATE SET webhook_id = src.webhook_id, updated_at = CURRENT_TIMESTAMP
                     WHEN NOT MATCHED THEN
                       INSERT (order_id, webhook_id, created_at, updated_at) VALUES (src.order_id, src.webhook_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
                    [oid, webhookId]
                  );
                  // Insert or update whcc_webhook_event
                  await query(
                    `MERGE whcc_webhook_event AS target
                     USING (SELECT $1 AS order_id, $2 AS webhook_id) AS src
                     ON (target.order_id = src.order_id)
                     WHEN MATCHED THEN
                       UPDATE SET webhook_id = src.webhook_id, updated_at = CURRENT_TIMESTAMP
                     WHEN NOT MATCHED THEN
                       INSERT (order_id, webhook_id, created_at, updated_at) VALUES (src.order_id, src.webhook_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
                    [oid, webhookId]
                  );
                  // Insert or update whcc_webhook_payload
                  await query(
                    `MERGE whcc_webhook_payload AS target
                     USING (SELECT $1 AS order_id, $2 AS webhook_id) AS src
                     ON (target.order_id = src.order_id)
                     WHEN MATCHED THEN
                       UPDATE SET webhook_id = src.webhook_id, updated_at = CURRENT_TIMESTAMP
                     WHEN NOT MATCHED THEN
                       INSERT (order_id, webhook_id, created_at, updated_at) VALUES (src.order_id, src.webhook_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
                    [oid, webhookId]
                  );
                  console.log(`[WHCC] Webhook fields persisted for order ${oid}`);
                } catch (persistErr) {
                  console.error(`[WHCC][ERROR] Failed to persist webhook fields for order ${oid}:`, persistErr?.message || persistErr);
                }
              }
            }
          } catch (err) {
            console.error('[WHCC][ERROR] Failed to register webhook:', err?.message || err);
            // Proceed without webhook, do not abort submission
          }
        }
      }
    }
  const allowBatch = Boolean(options?.allowBatch);
  const shippingAddressOverride = options?.shippingAddressOverride || null;
  let specialInstructions = String(options?.specialInstructions || '').trim() || null;
  const aggregateOrderIds = Array.isArray(options?.aggregateOrderIds)
    ? options.aggregateOrderIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const isAggregateSubmission = aggregateOrderIds.length > 1;
  let importResponseData = null;
  let submitResponseData = null;
  let confirmationId = null;
  let currentStage = 'initializing';
  let currentRequestUrl = null;
  let sandboxMode = false;
  let requestLog = null;
  const nowIso = () => new Date().toISOString();

  const extractWhccResponseDetails = (...sources) => {
    const pickFirst = (keys) => {
      for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        for (const key of keys) {
          const value = source[key];
          if (value != null && String(value).trim() !== '') {
            return String(value).trim();
          }
        }
      }
      return null;
    };

    return {
      orderNumber: pickFirst(['whccOrderNumber', 'WhccOrderNumber', 'orderNumber', 'OrderNumber', 'orderNum', 'OrderNum', 'order_id', 'OrderId']),
      webhookStatus: pickFirst(['whccWebhookStatus', 'WebhookStatus', 'webhookStatus', 'status', 'Status']),
      webhookEvent: pickFirst(['whccWebhookEvent', 'WebhookEvent', 'webhookEvent', 'event', 'Event']),
    };
  };


  const targetOrderIds = isAggregateSubmission ? aggregateOrderIds : [orderId];

  // Check approval status for all target orders
  const approvalRows = await queryRows(
    `SELECT id, approval_status FROM orders WHERE id IN (${targetOrderIds.map((_, i) => `$${i + 1}`).join(',')})`,
    targetOrderIds
  );
  const anyPending = approvalRows.some(row => row.approval_status === 'pending');
  const allApproved = approvalRows.every(row => row.approval_status === 'approved');



  try {
    let orders = [];
    if (isAggregateSubmission) {
      const orderPlaceholders = targetOrderIds.map((_, index) => `$${index + 1}`).join(',');
      orders = await queryRows(
        `SELECT oi.id as id,
                oi.photo_id as photoId,
                oi.photo_ids as photoIds,
                oi.product_id as productId,
                oi.product_size_id as productSizeId,
                oi.quantity,
                oi.price as price,
                oi.crop_data as cropData,
                p.name as productName,
                ps.size_name as productSizeName,
                COALESCE(ps.price, p.price, 0) as basePrice,
                COALESCE(ps.cost, p.cost, 0) as labCost
         FROM order_items oi
         LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
         LEFT JOIN products p ON p.id = COALESCE(oi.product_id, ps.product_id)
         WHERE oi.order_id = $1`,
        [order.id]
      );
      return;
    } else {
      // Non-aggregate: fetch the order from the orders table
      orders = await queryRows(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );
      // Map snake_case DB fields to camelCase for downstream code
      if (orders[0]) {
        orders[0].shippingAddress = orders[0].shipping_address;
        orders[0].batchShippingAddress = orders[0].batch_shipping_address;
      }
    }

    const order = orders[0];
    if (!order) {
      throw new Error('Order not found or undefined in submitOrderToWhcc');
    }
    if (order.is_batch && !allowBatch) {
      return; // Don't submit batch orders to WHCC unless explicitly allowed
    }

    // Defensive: If shippingAddress is missing, throw a clear error
    if (typeof order.shippingAddress === 'undefined') {
      throw new Error('Order is missing shippingAddress field. Cannot submit to WHCC.');
    }
    if (typeof order.batchShippingAddress === 'undefined') {
      throw new Error('Order is missing batchShippingAddress field. Cannot submit to WHCC.');
    }
    const parsedOrderShippingAddress = safeJsonParse(order.shippingAddress, {}) || {};
    const parsedBatchShippingAddress = safeJsonParse(order.batchShippingAddress, {}) || {};
    const shippingAddress = shippingAddressOverride || (order.is_batch ? parsedBatchShippingAddress : parsedOrderShippingAddress);

    const normalizePhone = (value) => String(value || '').replace(/[^0-9]/g, '').slice(0, 20);
    const toAbsoluteAssetUrl = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return null;
      if (/^https?:\/\//i.test(raw)) return raw;
      const appBase = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
      if (!appBase) return null;
      return raw.startsWith('/') ? `${appBase}${raw}` : `${appBase}/${raw}`;
    };

    const itemPlaceholders = targetOrderIds.map((_, index) => `$${index + 1}`).join(',');
    const items = await queryRows(
      `SELECT oi.id as id,
              oi.order_id as orderId,
              oi.photo_id as photoId,
              oi.product_id as productId,
              oi.product_size_id as productSizeId,
              oi.quantity,
              oi.crop_data as cropData,
              oi.attributes as attributes,
              p.name as productName,
              p.category as productCategory,
              ps.size_name as sizeName,
              COALESCE(oi.product_options_snapshot, p.options) as productOptions,
              p.image_url as productImageUrl,
              ph.file_name as fileName,
              ph.album_id as photoAlbumId,
              ph.full_image_url as fullImageUrl,
              ph.thumbnail_url as thumbnailUrl,
              ph.width as photoWidth,
              ph.height as photoHeight
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       LEFT JOIN photos ph ON ph.id = oi.photo_id
       WHERE oi.order_id IN (${itemPlaceholders})`,
      targetOrderIds
    );


    if (!items || items.length === 0) {
      console.warn(`[WHCC] No items found for order(s) ${targetOrderIds.join(', ')}`);
      return;
    }


    // --- PATCH: If all items are digital, auto-approve; if any are physical, require approval ---
    const allDigital = items.every((item) => isDigitalOrderItem(item));
    const anyPhysical = items.some((item) => !isDigitalOrderItem(item));

    // Get WHCC credentials from environment (support both naming conventions)
    const consumerKey = process.env.WHCC_CONSUMER_KEY || process.env.WHCC_API_KEY;
    const consumerSecret = process.env.WHCC_CONSUMER_SECRET || process.env.WHCC_API_SECRET;
    const isSandbox = process.env.WHCC_SANDBOX === 'true';
    sandboxMode = isSandbox;

    if (!consumerKey || !consumerSecret) {
      console.warn('[WHCC] WHCC credentials not configured (set WHCC_API_KEY/WHCC_API_SECRET or WHCC_CONSUMER_KEY/WHCC_CONSUMER_SECRET); skipping WHCC submission');
      return;
    }

    const { createHash } = await import('node:crypto');

    // Use top-level parseProductOptions
    const extractWhccItemConfig = (productOptions) => {
      const direct = productOptions || {};
      const nested = direct.whcc || direct.whccConfig || {};

      const variants = Array.isArray(direct.whccVariants)
        ? direct.whccVariants
            .map((variant) => {
              const uid = Number(variant?.whccProductUID || 0);
              if (!Number.isInteger(uid) || uid <= 0) return null;
              const nodeIds = Array.isArray(variant?.whccProductNodeIDs)
                ? variant.whccProductNodeIDs.map(Number).filter((v) => Number.isInteger(v) && v > 0)
                : [];
              const attrIds = Array.isArray(variant?.whccItemAttributeUIDs)
                ? variant.whccItemAttributeUIDs.map(Number).filter((v) => Number.isInteger(v) && v > 0)
                : [];
              return {
                id: Number.isInteger(Number(variant?.id)) ? Number(variant.id) : null,
                localId: String(variant?.localId || ''),
                displayName: String(variant?.displayName || ''),
                whccProductUID: uid,
                whccProductNodeIDs: nodeIds,
                whccItemAttributeUIDs: attrIds,
                isDefault: Boolean(variant?.isDefault),
                isActive: variant?.isActive === undefined ? true : Boolean(variant?.isActive),
              };
            })
            .filter(Boolean)
        : [];

      const selectedVariantId = Number(
        direct.whccSelectedVariantId ??
        direct.selectedWhccVariantId ??
        direct.selectedVariantId
      ) || null;
      const selectedVariantLocalId = String(
        direct.whccSelectedVariantLocalId ??
        direct.selectedWhccVariantLocalId ??
        ''
      ).trim();

      const selectedVariant = variants.find((variant) => variant?.id && selectedVariantId && Number(variant.id) === selectedVariantId)
        || variants.find((variant) => selectedVariantLocalId && variant?.localId === selectedVariantLocalId)
        || variants.find((variant) => variant?.isDefault && variant?.isActive)
        || variants.find((variant) => variant?.isActive)
        || variants.find((variant) => variant?.isDefault)
        || variants[0]
        || null;

      return {
        productUID: Number(
          selectedVariant?.whccProductUID ??
          direct.whccProductUID ??
          direct.productUID ??
          nested.productUID ??
          nested.ProductUID
        ) || null,
        productNodeID: Number(
          (Array.isArray(selectedVariant?.whccProductNodeIDs) && selectedVariant.whccProductNodeIDs.length
            ? selectedVariant.whccProductNodeIDs[0]
            : null) ??
          direct.whccProductNodeID ??
          direct.productNodeID ??
          nested.productNodeID ??
          nested.ProductNodeID
        ) || null,
        itemAttributeUIDs: Array.isArray(selectedVariant?.whccItemAttributeUIDs) && selectedVariant.whccItemAttributeUIDs.length
          ? selectedVariant.whccItemAttributeUIDs
          : Array.isArray(direct.whccItemAttributeUIDs)
          ? direct.whccItemAttributeUIDs
          : Array.isArray(direct.itemAttributeUIDs)
          ? direct.itemAttributeUIDs
          : Array.isArray(nested.itemAttributeUIDs)
          ? nested.itemAttributeUIDs
          : Array.isArray(nested.ItemAttributeUIDs)
          ? nested.ItemAttributeUIDs
          : [],
      };
    };
    // Use top-level isDigitalOrderItem

    const getCatalogProducts = (catalogPayload) => {
      if (Array.isArray(catalogPayload?.Products)) return catalogPayload.Products;
      if (Array.isArray(catalogPayload?.products)) return catalogPayload.products;
      if (Array.isArray(catalogPayload?.Categories)) {
        return catalogPayload.Categories.flatMap((c) => {
          const catName = c?.Name ?? c?.CategoryName ?? c?.name ?? '';
          return (Array.isArray(c?.ProductList) ? c.ProductList : []).map((p) => {
            p._whccCategoryName = catName;
            return p;
          });
        });
      }
      if (Array.isArray(catalogPayload?.categories)) {
        return catalogPayload.categories.flatMap((c) => {
          const catName = c?.name ?? c?.categoryName ?? '';
          return (Array.isArray(c?.productList) ? c.productList : []).map((p) => {
            p._whccCategoryName = catName;
            return p;
          });
        });
      }
      if (Array.isArray(catalogPayload)) return catalogPayload;
      return [];
    };

    const getCatalogProductUID = (product) => Number(
      product?.ProductUID ??
      product?.productUID ??
      product?.ProductId ??
      product?.productId ??
      product?.Id ??
      product?.id ??
      product?.UID
    ) || null;

    const getStaticWhccFallbackProductUID = (item) => {
      // Intentionally disabled: previous blanket fallback IDs were not valid in this catalog
      // and caused invalid business-rule errors.
      return null;
    };

    const matchCatalogProduct = (catalogProducts, item) => {
      const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9x.\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const hasWordToken = (text, token) => {
        if (!text || !token) return false;
        const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i').test(text);
      };
      const extractDimensionTokens = (text) => {
        const matches = String(text || '').match(/\b\d+(?:\.\d+)?x\d+(?:\.\d+)?\b/gi) || [];
        return matches.map((m) => m.toLowerCase());
      };

      const name = normalize(item.productName || '');
      const size = normalize(item.sizeName || '');
      const category = normalize(item.productCategory || '');
      const combinedLocal = `${name} ${size}`.trim();
      const isPlainPrintItem = (category.includes('print') && (name === 'print' || name === 'photo print'));

      const stopWords = new Set(['photo', 'item', 'product', 'print', 'the', 'and', 'for', 'with']);
      const nameTokens = name
        .split(' ')
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !stopWords.has(t));

      const sizeToken = (() => {
        const match = combinedLocal.match(/\b\d+(?:\.\d+)?x\d+(?:\.\d+)?\b/i);
        return match ? match[0].toLowerCase() : '';
      })();
      const localDimensionTokens = extractDimensionTokens(combinedLocal);
      const ozToken = (() => {
        const match = combinedLocal.match(/\b\d+(?:\.\d+)?\s?oz\b/i);
        return match ? match[0].replace(/\s+/g, '').toLowerCase() : '';
      })();

      const categoryHints = (() => {
        if (category.includes('drink')) return ['mug', 'drink', 'tumbler', 'cup', 'oz'];
        if (category.includes('frame')) return ['frame', 'framed'];
        if (category.includes('textile') || category.includes('blanket') || category.includes('pillow')) return ['blanket', 'pillow', 'textile', 'fabric'];
        if (category.includes('acrylic')) return ['acrylic'];
        if (category.includes('metal')) return ['metal'];
        if (category.includes('wood')) return ['wood'];
        if (category.includes('digital')) return ['digital', 'download'];
        if (category.includes('book')) return ['book'];
        if (category.includes('print')) return ['print'];
        return [];
      })();

      // Determine if this local item is a press/card product by category or name
      const pressCardKeywords = ['card', 'stationery', 'invitation', 'announcement', 'postcard', 'notecard', 'flat card', 'greeting', 'rep card'];
      const isLocalPressCard = pressCardKeywords.some((kw) =>
        category.includes(kw) || name.includes(kw)
      );

      const scored = [];
      for (const product of catalogProducts) {
        const uid = getCatalogProductUID(product);
        if (!uid) continue;

        const productName = normalize(product?.Name || product?.name || product?.ProductName || '');
        const description = normalize(product?.Description || product?.description || '');
        const haystack = `${productName} ${description}`.trim();
        if (!haystack) continue;
        const productDimensionTokens = extractDimensionTokens(haystack);

        let score = 0;

        if (name && haystack.includes(name)) score += 10;
        if (size && haystack.includes(size)) score += 8;

        if (sizeToken) {
          if (hasWordToken(haystack, sizeToken)) score += 12;
          else if (productDimensionTokens.length > 0) score -= 14;
        }

        if (localDimensionTokens.length > 0 && productDimensionTokens.length > 0) {
          const hasExactDimension = localDimensionTokens.some((dim) => productDimensionTokens.includes(dim));
          if (hasExactDimension) score += 12;
          else score -= 16;
        }

        if (ozToken && haystack.includes(ozToken)) score += 9;

        for (const token of nameTokens) {
          if (haystack.includes(token)) score += 2;
        }

        if (categoryHints.length > 0) {
          const hasCategoryHint = categoryHints.some((hint) => haystack.includes(hint));
          if (hasCategoryHint) score += 6;
          else score -= 8;
        }

        // Plain local "Print" items should prefer standard photo print products,
        // not specialty acrylic/canvas/metal/framed products.
        if (isPlainPrintItem) {
          if (haystack.includes('photo print')) score += 10;
          if (
            haystack.includes('acrylic') ||
            haystack.includes('canvas') ||
            haystack.includes('metal print') ||
            haystack.includes('framed') ||
            haystack.includes('frame') ||
            haystack.includes('wood')
          ) {
            score -= 18;
          }
        }

        // Avoid mapping drinkware items to acrylic products (known WHCC rule mismatch source)
        if (category.includes('drink') && haystack.includes('acrylic')) {
          score -= 20;
        }

        // Press/card products (rep cards, flat cards, stationery, etc.) have strict WHCC
        // business rules (paper type, multi-node, one-per-order). Apply a heavy penalty
        // when the local item is NOT a press/card product so a dimension coincidence
        // (e.g. 2x3.5 wallet print) doesn't accidentally map to "2x3.5 Rep Cards".
        const catalogIsPressCard = ['rep card', 'flat card', 'business card', 'stationery',
          'invitation', 'announcement', 'greeting card', 'postcard', 'notecard']
          .some((kw) => haystack.includes(kw));
        if (catalogIsPressCard && !isLocalPressCard) {
          score -= 40;
        }
        // Conversely, if the local item IS a press/card, boost press catalog matches
        if (isLocalPressCard && catalogIsPressCard) {
          score += 20;
        }

        if (score > 0) scored.push({ score, product });
      }

      scored.sort((a, b) => b.score - a.score);
      return scored[0]?.product || null;
    };

    const getCatalogProductNodeID = (catalogProduct) => {
      const raw =
        catalogProduct?.ProductNodeID ??
        catalogProduct?.productNodeID ??
        catalogProduct?.DefaultProductNodeID ??
        catalogProduct?.defaultProductNodeID ??
        (Array.isArray(catalogProduct?.ProductNodes)
          ? (catalogProduct.ProductNodes[0]?.DP2NodeID ?? catalogProduct.ProductNodes[0]?.ProductNodeID)
          : null) ??
        (Array.isArray(catalogProduct?.productNodes)
          ? (catalogProduct.productNodes[0]?.dp2NodeID ?? catalogProduct.productNodes[0]?.productNodeID)
          : null);
      return Number(raw) || null;
    };

    // Returns ALL node IDs for a catalog product (multi-node products need one ItemAsset per node)
    const getCatalogProductNodeIDs = (catalogProduct) => {
      const nodes = catalogProduct?.ProductNodes ?? catalogProduct?.productNodes ?? [];
      if (Array.isArray(nodes) && nodes.length > 0) {
        const ids = nodes
          .map((n) => Number(n?.DP2NodeID ?? n?.dp2NodeID ?? n?.ProductNodeID ?? n?.productNodeID ?? 0))
          .filter((v) => v > 0);
        if (ids.length > 0) return ids;
      }
      const single = getCatalogProductNodeID(catalogProduct);
      return [single || 10000];
    };

    const getCatalogItemAttributeUIDs = (catalogProduct) => {
      const attrs =
        catalogProduct?.DefaultItemAttributes ??
        catalogProduct?.defaultItemAttributes ??
        catalogProduct?.ItemAttributes ??
        catalogProduct?.itemAttributes ??
        [];
      if (Array.isArray(attrs) && attrs.length > 0) {
        return attrs
          .map((a) => Number(a?.AttributeUID ?? a?.attributeUID ?? a?.uid ?? a?.Id ?? a?.id ?? a))
          .filter((v) => Number.isInteger(v) && v > 0);
      }

      const attributeCategories =
        catalogProduct?.AttributeCategories ??
        catalogProduct?.attributeCategories ??
        [];

      if (!Array.isArray(attributeCategories) || attributeCategories.length === 0) {
        return [];
      }

      const getOptions = (category) =>
        Array.isArray(category?.Attributes)
          ? category.Attributes
          : Array.isArray(category?.attributes)
          ? category.attributes
          : [];

      const getAttrUid = (attr) => Number(attr?.Id ?? attr?.AttributeUID ?? attr?.attributeUID ?? attr?.id ?? 0) || null;
      const getParentUid = (attr) => Number(attr?.ParentAttributeUID ?? attr?.parentAttributeUID ?? 0) || null;

      // Build lookup maps for parent-dependency resolution
      const uidToAttr = new Map();
      const uidToCategory = new Map();
      for (const category of attributeCategories) {
        for (const attr of getOptions(category)) {
          const uid = getAttrUid(attr);
          if (uid > 0) {
            uidToAttr.set(uid, attr);
            uidToCategory.set(uid, category);
          }
        }
      }

      const selected = [];
      const requiredParents = new Set(
        attributeCategories
          .map((c) => c?.RequiredLevel)
          .filter((v) => Number.isInteger(v) && v > 0)
      );

      const addUid = (value) => {
        const uid = Number(value);
        if (Number.isInteger(uid) && uid > 0 && !selected.includes(uid)) {
          selected.push(uid);
        }
        return uid;
      };

      // After selections, walk ParentAttributeUID chains:
      // - If attr A requires parent P, ensure P is in selected.
      // - If another attr Q from P's category is already selected, replace Q with P.
      const resolveParentDeps = () => {
        let changed = true;
        const visited = new Set();
        while (changed) {
          changed = false;
          for (const uid of [...selected]) {
            if (visited.has(uid)) continue;
            visited.add(uid);
            const attr = uidToAttr.get(uid);
            if (!attr) continue;
            const parentUid = getParentUid(attr);
            if (!parentUid || selected.includes(parentUid)) continue;
            // Find and replace any conflicting attr from the same category as the parent
            const parentCat = uidToCategory.get(parentUid);
            if (parentCat) {
              const catAttrIds = getOptions(parentCat).map(a => getAttrUid(a)).filter(v => v > 0);
              for (const conflictUid of catAttrIds) {
                if (conflictUid !== parentUid) {
                  const idx = selected.indexOf(conflictUid);
                  if (idx !== -1) selected.splice(idx, 1);
                }
              }
            }
            addUid(parentUid);
            changed = true;
          }
        }
      };

      // Pass 1: choose base required categories (RequiredLevel = 0)
      for (const category of attributeCategories) {
        const requiredLevel = Number(category?.RequiredLevel ?? category?.requiredLevel ?? 0);
        if (requiredLevel !== 0) continue;

        const options = getOptions(category);
        if (!options.length) continue;

        const preferred = options.find((opt) => {
          const uid = getAttrUid(opt);
          return Number.isInteger(uid) && requiredParents.has(uid);
        });

        const chosen = preferred || options[0] || null;
        if (!chosen) continue;

        const uid = getAttrUid(chosen);
        if (Number.isInteger(uid) && uid > 0) addUid(uid);
      }

      // Resolve parent dependencies after Pass 1 so Pass 2 sees the correct parents
      resolveParentDeps();

      // Pass 2: include dependent categories only when their parent is selected
      for (const category of attributeCategories) {
        const options = getOptions(category);
        if (!options.length) continue;

        const requiredLevel = Number(category?.RequiredLevel ?? category?.requiredLevel ?? 0);

        if (requiredLevel === 0) continue;
        if (requiredLevel < 0) continue;
        if (requiredLevel > 0 && !selected.includes(requiredLevel)) continue;

        const chosen = options[0] || null;
        const uid = getAttrUid(chosen);
        if (Number.isInteger(uid) && uid > 0) {
          addUid(uid);
          const parentUid = getParentUid(chosen);
          if (Number.isInteger(parentUid) && parentUid > 0) {
            addUid(parentUid);
          }
        }
      }

      // Final parent resolution pass after Pass 2
      resolveParentDeps();

      return selected;
    };

    const parseUidList = (value) => String(value || '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((uid) => Number.isInteger(uid) && uid > 0);

    const orderAttributeUIDs = (() => {
      const envConfigured = parseUidList(process.env.WHCC_ORDER_ATTRIBUTE_UIDS);
      const base = envConfigured.length ? [...envConfigured] : [96, 545];

      // If Drop Ship is selected, ensure at least one shipping option exists.
      const hasDropShip = base.includes(96);
      const knownShippingOptions = [100, 101, 104, 105, 545];
      const hasShipping = base.some((uid) => knownShippingOptions.includes(uid));
      if (hasDropShip && !hasShipping) {
        base.push(545);
      }

      return Array.from(new Set(base));
    })();

    // Call WHCC OrderImport API
    const axios = (await import('axios')).default;
    const baseUrl = isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';

    // Get WHCC token using the shared fetchWhccToken (cached, handles all response shapes)
    currentStage = 'token';
    currentRequestUrl = `${baseUrl}/api/AccessToken`;
    const token = await fetchWhccToken(consumerKey, consumerSecret, isSandbox);

    // Fetch WHCC catalog to resolve per-product ProductUID/Node/Attributes
    let catalogProducts = [];
    try {
      const catalogResponse = await axios.get(`${baseUrl}/api/catalog`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      catalogProducts = getCatalogProducts(catalogResponse.data);
    } catch (catalogError) {
      console.warn('[WHCC] Unable to fetch catalog for product mapping, using fallback defaults:', catalogError?.response?.status || catalogError?.message);
    }

    // Track press products: WHCC only allows one press design per order
    const pressProductUIDsUsed = new Set();
    const isPressProduct = (catalogProduct) => {
      const catName = String(catalogProduct?._whccCategoryName ?? '').toLowerCase();
      return catName.includes('business card') || catName.includes('rep card') ||
             catName.includes('stationery') || catName.includes('invitation') ||
             catName.includes('flat card') || catName.includes('greeting card');
    };

    // Prepare WHCC OrderImport payload according to docs
    // Patch: fetch image buffer and compute SHA-256 hash for WHCC ImageHash
    const { computeImageSignature } = await import('../utils/imageSignature.js');

    // --- PATCH: Check if studio has free batch shipping ---
    let studioHasFreeBatchShipping = false;
    if (order && order.studio_id) {
      const studioRow = await queryRow('SELECT can_receive_free_batch_shipping FROM studios WHERE id = $1', [order.studio_id]);
      studioHasFreeBatchShipping = !!studioRow?.can_receive_free_batch_shipping;
    }


    const resolvedWhccItems = await Promise.all(
      items.map(async (item, index) => {
        const productOptions = parseProductOptions(item.productOptions);
        if (isDigitalOrderItem(item, productOptions)) {
          return null;
        }



        // Always use Azure Blob Storage URLs for WHCC image upload and hash calculation
        let assetPath = null;
        if (item.fullImageUrl && /\.blob\.core\.windows\.net\//i.test(item.fullImageUrl)) {
          assetPath = item.fullImageUrl;
        } else if (item.thumbnailUrl && /\.blob\.core\.windows\.net\//i.test(item.thumbnailUrl)) {
          assetPath = item.thumbnailUrl;
        } else if (item.fileName && item.photoAlbumId) {
          // Construct the Azure Blob URL using AZURE_BASE_URL from env
          const baseUrl = (process.env.AZURE_BASE_URL || '').replace(/\/$/, '');
          if (baseUrl) {
            assetPath = `${baseUrl}/albums/${item.photoAlbumId}/${item.fileName}`;
            console.log('[WHCC][DEBUG] Constructed Azure Blob URL from AZURE_BASE_URL:', assetPath);
          } else {
            console.warn('[WHCC][ERROR] AZURE_BASE_URL is not set in environment. Cannot construct blob URL.');
            return null;
          }
        } else {
          // If no way to construct a blob URL, do not proceed
          console.warn('[WHCC][ERROR] No Azure Blob Storage URL found or could be constructed for order item', item.id);
          return null;
        }

        // Always keep the original public Azure Blob URL for WHCC (no SAS token)
        const whccImageUrl = assetPath;
        // If the blob is private and no SAS token is present, generate a signed URL for backend fetch only
        let fetchAssetPath = assetPath;
        // Always use the plain public Azure Blob URL for fetchAssetPath; only use SAS as a fallback if public fetch fails
        fetchAssetPath = assetPath;
        // Debug: log asset URLs for each item

        // Debug: log asset URLs for each item
        console.log('[WHCC][DEBUG] Order item asset URLs:', {
          orderItemId: item.id,
          productName: item.productName,
          fullImageUrl: item.fullImageUrl,
          thumbnailUrl: item.thumbnailUrl,
          assetPath,
          whccImageUrl,
          fetchAssetPath,
        });

        if (!assetPath) {
          console.warn('[WHCC][DEBUG] No assetPath resolved for order item', item.id);
          return null;
        }

        // Fetch image as buffer and compute SHA-256 hash
        let imageHash = null;
        let whccAssetPath = null;
        try {
          let fetchUrl = fetchAssetPath;
          let buffer = null;
          // If using internal /api/photos/:id/asset?variant=full, fetch directly from DB/blob, not via axios to localhost
          const internalAssetMatch = String(fetchUrl).match(/\/api\/photos\/(\d+)\/asset\?variant=full$/);
          if (internalAssetMatch) {
            // Use direct DB lookup and blob fetch for this photoId
            const photoId = Number(internalAssetMatch[1]);
            const mssql = await import('../mssql.cjs');
            const { queryRow } = mssql.default || mssql;
            // Try to get all possible blob path fields
            const photo = await queryRow('SELECT full_image_url, file_name, thumbnail_url FROM photos WHERE id = $1', [photoId]);
            let blobPath = null;
            if (photo) {
              // Prefer full_image_url, fallback to thumbnail_url, then file_name
              blobPath = photo.full_image_url || photo.thumbnail_url || photo.file_name || null;
            }
            // Normalize blob path: remove leading slashes, handle absolute URLs
            if (blobPath && !/^https?:\/\//i.test(blobPath)) {
              blobPath = blobPath.replace(/^\/+/, '');
            }
            console.log('[WHCC][DEBUG] Resolved blob path for photo', photoId, ':', blobPath);
            if (!blobPath) throw new Error('No valid blob path found for internal asset fetch');
            const { downloadBlob } = await import('../services/azureStorage.js');
            buffer = await downloadBlob(blobPath);
            if (!buffer) throw new Error('Failed to fetch blob for internal asset');
          } else {
            // Try fetching the public Azure Blob URL directly first
            let fetchError = null;
            try {
              console.log('[WHCC][DEBUG] Fetching asset via public Azure URL', fetchUrl);
              // Print the exact URL for comparison with standalone script
              console.log('[WHCC][DEBUG] EXACT FETCH URL:', fetchUrl);
              // Debug: print URL character codes to catch invisible encoding/whitespace issues
              console.log('[WHCC][DEBUG] URL char codes:', Array.from(fetchUrl).map(c => c.charCodeAt(0)).join(','));
              // Force no custom headers for Azure Blob fetch (fixes 404 issue)
              const response = await axios.get(fetchUrl, { responseType: 'arraybuffer', headers: {} });
              buffer = Buffer.from(response.data);
            } catch (err) {
              fetchError = err;
              if (err.response) {
                console.error('[WHCC][ERROR] Axios fetch failed:', {
                  url: fetchUrl,
                  status: err.response.status,
                  statusText: err.response.statusText,
                  headers: err.response.headers,
                  data: err.response.data && typeof err.response.data === 'string' ? err.response.data.slice(0, 500) : '[binary]',
                });
              } else {
                console.error('[WHCC][ERROR] Axios fetch failed (no response):', err.message || err);
              }
              // If public fetch fails, try with SAS URL
              if (
                typeof fetchUrl === 'string' &&
                fetchUrl.includes('.blob.core.windows.net/') &&
                !fetchUrl.includes('?') &&
                process.env.AZURE_STORAGE_ACCOUNT &&
                process.env.AZURE_STORAGE_KEY &&
                (process.env.AZURE_CONTAINER_NAME || process.env.AZURE_STORAGE_CONTAINER)
              ) {
                const { getSignedReadUrl } = await import('../services/azureStorage.js');
                const sasUrl = getSignedReadUrl(fetchUrl);
                console.log('[WHCC][DEBUG] Public fetch failed, retrying with SAS URL:', sasUrl);
                // Force no custom headers for Azure Blob fetch (fixes 404 issue)
                const sasResponse = await axios.get(sasUrl, { responseType: 'arraybuffer', headers: {} });
                buffer = Buffer.from(sasResponse.data);
              } else {
                throw fetchError;
              }
            }
          }
          imageHash = await computeImageSignature(buffer);
          // Debug: print buffer length, sample, and hash to match standalone test
          console.log('[WHCC][DEBUG] Buffer length:', buffer.length);
          console.log('[WHCC][DEBUG] Buffer sample (first 32 bytes):', buffer.slice(0, 32));
          console.log('[WHCC][DEBUG] MD5 hash:', imageHash);

          // --- PATCH: Use public Azure Blob URL directly for WHCC AssetPath ---
          whccAssetPath = assetPath;
          // Optionally, you may want to validate the URL is public and accessible here.
        } catch (err) {
          console.warn(`[WHCC] Failed to fetch, hash, or upload image for asset: ${assetPath}`, err?.message || err);
          return null;
        }

        const cropData = safeJsonParse(item.crop_data, null);

        const optionsConfig = extractWhccItemConfig(productOptions);

        // --- PATCH: Match catalog product by selected finish (attribute) if present ---
        // 1. Find all catalog products that match the base product (by name/size/UID)
        // 2. If a finish attribute is selected, pick the catalog product that supports it
        // 3. Fallback to normal catalog match if no finish is selected

        // Step 1: Get all catalog products that match the base product
        let candidateCatalogProducts = catalogProducts.filter(p => {
          // Match by ProductUID if available, else by name/size
          if (optionsConfig.productUID) {
            return getCatalogProductUID(p) === optionsConfig.productUID;
          }
          // Fallback: match by name/size (same as matchCatalogProduct)
          return matchCatalogProduct([p], item) === p;
        });
        if (!candidateCatalogProducts.length) {
          // Fallback to all products if no match
          candidateCatalogProducts = catalogProducts;
        }

        // Step 2: If a finish attribute is selected, filter for catalog products that support it
        let selectedFinishUid = null;
        if (Array.isArray(optionsConfig.itemAttributeUIDs) && optionsConfig.itemAttributeUIDs.length > 0) {
          // Try to find a finish attribute (not just parent Paper)
          selectedFinishUid = optionsConfig.itemAttributeUIDs.find(uid => Number(uid) !== 1); // 1 = Paper (parent)
        }
        let catalogMatch = null;
        if (selectedFinishUid) {
          catalogMatch = candidateCatalogProducts.find(p => {
            const attrs = getCatalogItemAttributeUIDs(p);
            return attrs.includes(Number(selectedFinishUid));
          }) || null;
        }
        // Step 3: Fallback to normal match if no finish or no match found
        if (!catalogMatch) {
          catalogMatch = matchCatalogProduct(candidateCatalogProducts, item) || candidateCatalogProducts[0] || null;
        }

        const productUID =
          optionsConfig.productUID ||
          getCatalogProductUID(catalogMatch) ||
          getStaticWhccFallbackProductUID(item);

        // When the product UID is pre-configured, look it up exactly in the catalog so
        // that attributes and ProductNodes come from the correct product, not a name-based
        // match that may resolve to a different (wrong) product.
        const effectiveCatalogMatch = (() => {
          if (!optionsConfig.productUID) return catalogMatch;
          const byUid = catalogProducts.find(
            (p) => getCatalogProductUID(p) === optionsConfig.productUID
          );
          return byUid || catalogMatch;
        })();

        if (!productUID) {
          throw new Error(`No WHCC product mapping found for ${item.productName || 'Unknown Product'}${item.sizeName ? ` (${item.sizeName})` : ''}. Add WHCC mapping data before retrying.`);
        }

        // Determine all product nodes — multi-node products need one ItemAsset per node.
        // IMPORTANT: if catalog indicates multiple nodes, ignore any single-node override
        // persisted in product options (legacy imports stored only the first node).
        const catalogNodeIDs = getCatalogProductNodeIDs(effectiveCatalogMatch);
        const productNodeIDs = catalogNodeIDs.length > 1
          ? catalogNodeIDs
          : optionsConfig.productNodeID
          ? [Number(optionsConfig.productNodeID)]
          : catalogNodeIDs;

        // Press product deduplication: WHCC allows only one press design per order.
        // Deduplicate by press-category (not just UID) so that two items of different
        // press UIDs don't both slip through.
        if (isPressProduct(effectiveCatalogMatch)) {
          if (pressProductUIDsUsed.size > 0) {
            console.warn(`[WHCC] Skipping press product ${item.productName || productUID} — only one press design allowed per WHCC order. Already have: ${[...pressProductUIDsUsed].join(', ')}`);
            return null;
          }
          pressProductUIDsUsed.add(productUID);
        }

        const optionAttributeUIDs = (optionsConfig.itemAttributeUIDs || [])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0);
        const catalogAttributeUIDs = getCatalogItemAttributeUIDs(effectiveCatalogMatch);

        // PATCH: Always prefer attribute UIDs from order item options if present (e.g., finish selection),
        // otherwise fall back to WHCC catalog defaults.
        let finalAttributeUIDs = optionAttributeUIDs.length
          ? optionAttributeUIDs
          : catalogAttributeUIDs;

        // PATCH: Ensure all required parent attributes are included for each selected attribute (WHCC business rule).
        // Use the same parent resolution logic as getCatalogItemAttributeUIDs, but apply to the selected set.
        if (Array.isArray(effectiveCatalogMatch?.AttributeCategories) || Array.isArray(effectiveCatalogMatch?.attributeCategories)) {
          const attributeCategories = effectiveCatalogMatch.AttributeCategories || effectiveCatalogMatch.attributeCategories || [];
          const getOptions = (category) =>
            Array.isArray(category?.Attributes)
              ? category.Attributes
              : Array.isArray(category?.attributes)
              ? category.attributes
              : [];
          const getAttrUid = (attr) => Number(attr?.Id ?? attr?.AttributeUID ?? attr?.attributeUID ?? attr?.id ?? 0) || null;
          const getParentUid = (attr) => Number(attr?.ParentAttributeUID ?? attr?.parentAttributeUID ?? 0) || null;
          // Build lookup maps for parent-dependency resolution
          const uidToAttr = new Map();
          for (const category of attributeCategories) {
            for (const attr of getOptions(category)) {
              const uid = getAttrUid(attr);
              if (uid > 0) {
                uidToAttr.set(uid, attr);
              }
            }
          }
          // Walk up parent chains for all selected attributes
          const selected = Array.from(new Set(finalAttributeUIDs));
          let changed = true;
          while (changed) {
            changed = false;
            for (const uid of [...selected]) {
              const attr = uidToAttr.get(uid);
              if (!attr) continue;
              const parentUid = getParentUid(attr);
              if (parentUid && !selected.includes(parentUid)) {
                selected.push(parentUid);
                changed = true;
              }
            }
          }
          finalAttributeUIDs = selected;
        }

        // WHCC expects X/Y as 0-100 percentage offset within the image.
        // react-cropper stores x/y as pixel coordinates, so normalize using photo dimensions.
        const photoWidth = Number(item.photoWidth || 0);
        const photoHeight = Number(item.photoHeight || 0);
        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
        const cropOverrides = cropData && typeof cropData === 'object'
          ? {
              X: clamp(
                photoWidth > 0
                  ? (Number(cropData.x) / photoWidth) * 100
                  : Number(cropData.x) || 0,
                0, 100
              ),
              Y: clamp(
                photoHeight > 0
                  ? (Number(cropData.y) / photoHeight) * 100
                  : Number(cropData.y) || 0,
                0, 100
              ),
              ZoomX: Math.max(1, Number(cropData.scaleX) ? Number(cropData.scaleX) * 100 : 100),
              ZoomY: Math.max(1, Number(cropData.scaleY) ? Number(cropData.scaleY) * 100 : 100),
            }
          : {};

        const dbItemAttributeUIDs = (() => {
          if (Array.isArray(item.attributes)) {
            return item.attributes
              .map((value) => Number(value?.AttributeUID ?? value))
              .filter((value) => Number.isInteger(value) && value > 0);
          }
          if (typeof item.attributes === 'string') {
            const parsed = safeJsonParse(item.attributes, []);
            if (Array.isArray(parsed)) {
              return parsed
                .map((value) => Number(value?.AttributeUID ?? value))
                .filter((value) => Number.isInteger(value) && value > 0);
            }
            const single = Number(parsed?.AttributeUID ?? parsed);
            return Number.isInteger(single) && single > 0 ? [single] : [];
          }
          return [];
        })();

        const dbItemAttributeUIDsWithParents = (() => {
          if (!dbItemAttributeUIDs.length) return [];

          const attributeCategories = Array.isArray(effectiveCatalogMatch?.AttributeCategories)
            ? effectiveCatalogMatch.AttributeCategories
            : Array.isArray(effectiveCatalogMatch?.attributeCategories)
            ? effectiveCatalogMatch.attributeCategories
            : [];

          if (!attributeCategories.length) {
            return dbItemAttributeUIDs;
          }

          const getOptions = (category) =>
            Array.isArray(category?.Attributes)
              ? category.Attributes
              : Array.isArray(category?.attributes)
              ? category.attributes
              : [];

          const getAttrUid = (attr) => Number(attr?.Id ?? attr?.AttributeUID ?? attr?.attributeUID ?? attr?.id ?? 0) || null;
          const getParentUid = (attr) => Number(attr?.ParentAttributeUID ?? attr?.parentAttributeUID ?? 0) || null;
          const getRequiredLevel = (attr) => Number(attr?.RequiredLevel ?? attr?.requiredLevel ?? 0) || null;

          const uidToParent = new Map();
          const uidToRequiredLevel = new Map();
          const categoryRequiredLevels = new Set();
          
          for (const category of attributeCategories) {
            const categoryRequiredLevel = Number(category?.RequiredLevel ?? category?.requiredLevel ?? 0);
            if (categoryRequiredLevel === 0) {
              categoryRequiredLevels.add(0);  // Mark as top-level category
            }
            
            for (const attr of getOptions(category)) {
              const uid = getAttrUid(attr);
              if (uid && uid > 0) {
                uidToParent.set(uid, getParentUid(attr));
                uidToRequiredLevel.set(uid, getRequiredLevel(attr) || categoryRequiredLevel);
              }
            }
          }

          const selected = new Set(dbItemAttributeUIDs);
          let changed = true;
          while (changed) {
            changed = false;
            for (const uid of Array.from(selected)) {
              const parentUid = uidToParent.get(uid);
              // Only walk to REQUIRED parents (top-level categories with RequiredLevel = 0),
              // not intermediate option-level parents (which would create duplicate Paper Type conflicts)
              const parentRequiredLevel = uidToRequiredLevel.get(parentUid) ?? null;
              if (Number.isInteger(parentUid) && parentUid > 0 && !selected.has(parentUid) && parentRequiredLevel === 0) {
                selected.add(parentUid);
                changed = true;
              }
            }
          }

          return Array.from(selected)
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0);
        })();

        // Preview should show DB-stored attributes exactly as selected by user.
        // WHCC submission should preserve DB-selected attributes, adding only required parent chain.
        // Fall back to resolved catalog attributes only when DB has no attribute selection.
        const itemAttributeUIDs = options.previewOnly
          ? dbItemAttributeUIDs
          : (dbItemAttributeUIDs.length ? dbItemAttributeUIDsWithParents : finalAttributeUIDs);

        // Debug log for attribute flow
        console.log(
          '[WHCC][DEBUG][resolvedWhccItems] item.id:',
          item.id,
          'previewOnly:', Boolean(options.previewOnly),
          'dbItemAttributeUIDs:',
          JSON.stringify(dbItemAttributeUIDs),
          'dbItemAttributeUIDsWithParents:',
          JSON.stringify(dbItemAttributeUIDsWithParents),
          'finalAttributeUIDs (catalog/parents):',
          JSON.stringify(finalAttributeUIDs),
          'itemAttributeUIDs (effective):',
          JSON.stringify(itemAttributeUIDs)
        );
        return {
          localItemId: Number(item.id || index + 1),
          localProductId: Number(item.product_id || item.productId || 0) || null,
          localProductSizeId: Number(item.product_size_id || item.productSizeId || 0) || null,
          productName: item.productName || null,
          productCategory: item.productCategory || null,
          sizeName: item.sizeName || null,
          mappingSource: optionsConfig.productUID
            ? 'product-options'
            : getCatalogProductUID(catalogMatch)
            ? 'catalog-match'
            : getStaticWhccFallbackProductUID(item)
            ? 'static-fallback'
            : 'unresolved',
          catalogProductName: catalogMatch?.Name || catalogMatch?.name || null,
          effectiveCatalogProductName: effectiveCatalogMatch?.Name || effectiveCatalogMatch?.name || null,
          nodeCount: productNodeIDs.length,
          payload: {
            ProductUID: productUID,
            Quantity: Math.max(1, Number(item.quantity) || 1),
            LineItemID: String(item.id || index + 1),
            // One ItemAsset per ProductNode — WHCC requires this for multi-node products
            ItemAssets: productNodeIDs.map((nodeId) => ({
              ProductNodeID: nodeId,
              AssetPath: whccImageUrl,
              ImageHash: imageHash,
              PrintedFileName: item.fileName || `order-${orderId}-item-${index + 1}.jpg`,
              AutoRotate: true,
              ...cropOverrides,
            })),
            // Include ItemAttributes from order_items.attributes (DB only)
            ...(itemAttributeUIDs.length > 0
              ? { ItemAttributes: itemAttributeUIDs.map((uid) => ({ AttributeUID: uid })) }
              : {}),
          },
        };
      })
    );
    const filteredWhccItems = resolvedWhccItems.filter(Boolean);

    const whccOrderItems = filteredWhccItems.map((item) => item.payload);

    // --- PATCH: Inject AttributeUID 547 for free batch shipping studios (batch shipping only) ---
    let orderAttributes = (order?.orderAttributes || []).slice();
    if (studioHasFreeBatchShipping && order.is_batch) {
      if (!orderAttributes.some(attr => Number(attr.AttributeUID) === 547)) {
        orderAttributes.push({ AttributeUID: 547 });
      }
    }


    // whccEntryId and whccReference must be declared before logging
    const whccEntryId = isAggregateSubmission
      ? `batch-${Date.now()}`
      : String(orderId);
    const whccReference = isAggregateSubmission
      ? `Batch Orders #${targetOrderIds.join(',')}`
      : `Order #${orderId}`;


    // --- PREVIEW/APPROVAL LOGIC ---

    // Always generate and persist preview payload
    const previewPayload = {
      whccEntryId,
      whccReference,
      whccOrderItems,
      orderId,
      targetOrderIds,
      shippingAddress,
      ...(options.specialInstructions ? { specialInstructions: options.specialInstructions } : {}),
      generatedAt: nowIso(),
    };

    // If all items are digital, auto-approve and proceed
    if (allDigital) {
      await query(
        `UPDATE orders SET preview_payload = $1, approval_status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id IN (${targetOrderIds.map((_, i) => `$${i + 2}`).join(',')})`,
        [stringifyForDb(previewPayload), ...targetOrderIds]
      );
      if (options.previewOnly) {
        return { whccPayload: previewPayload };
      }
      // Continue to WHCC submission (if any physical items, this block is skipped)
    } else {
      // If any physical items, set approval_status to 'pending' unless forceSubmit or allApproved
      await query(
        `UPDATE orders SET preview_payload = $1, approval_status = COALESCE(approval_status, 'pending') WHERE id IN (${targetOrderIds.map((_, i) => `$${i + 2}`).join(',')})`,
        [stringifyForDb(previewPayload), ...targetOrderIds]
      );
      if (options.previewOnly) {
        console.log(`[WHCC][PREVIEW] Preview payload persisted for order(s) ${targetOrderIds.join(', ')}.`);
        return { whccPayload: previewPayload };
      }
      // If not forceSubmit and not all approved, do NOT submit to WHCC yet
      if (!forceSubmit && !allApproved) {
        console.log(`[WHCC][PREVIEW] Preview payload persisted for order(s) ${targetOrderIds.join(', ')}. Awaiting approval.`);
        return;
      }
    }

    // Only proceed to submit if all orders are approved or forceSubmit is true

    // Debug: log the full WHCC order payload before submission
    console.log('[WHCC][DEBUG] Order payload to be submitted:', JSON.stringify({
      whccEntryId,
      whccReference,
      whccOrderItems,
      orderId,
      targetOrderIds,
    }, null, 2));

    if (!whccOrderItems.length) {
      console.log(`[WHCC] Order(s) ${targetOrderIds.join(', ')} have no physical items to submit (digital-only or non-submittable items). Skipping WHCC submission.`);
      return;
    }

    const whccShipAddress = {
      Name: String(shippingAddress.fullName || '').trim() || `Order ${orderId}`,
      Attn: null,
      Addr1: String(shippingAddress.addressLine1 || '').trim() || 'Address unavailable',
      Addr2: String(shippingAddress.addressLine2 || '').trim() || null,
      City: String(shippingAddress.city || '').trim() || 'Unknown',
      State: String(shippingAddress.state || '').trim() || 'NA',
      Zip: String(shippingAddress.zipCode || '').trim() || '00000',
      Country: String(shippingAddress.country || '').trim() || 'US',
      Phone: normalizePhone(shippingAddress.phone),
    };

    // Build WHCC order request for submission
    const whccOrder = {
      SequenceNumber: 1,
      Reference: whccReference,
      Instructions: specialInstructions,
      SendNotificationEmailAddress: String(shippingAddress.email || '').trim() || null,
      SendNotificationEmailToAccount: true,
      ShipToAddress: whccShipAddress,
      ShipFromAddress: whccShipAddress,
      OrderAttributes: orderAttributes,
      OrderItems: whccOrderItems,
    };
    // Add DropShipFlag: 0 for batch orders if studio has free batch shipping
    if (isAggregateSubmission && studioHasFreeBatchShipping) {
      whccOrder.DropShipFlag = 0;
    }
    const whccOrderRequest = {
      EntryId: whccEntryId,
      Orders: [whccOrder],
      ...(webhookId ? { WebhookId: webhookId } : {}),
    };

    requestLog = {
      sandbox: isSandbox,
      localOrderIds: targetOrderIds,
      tokenRequest: {
        url: `${baseUrl}/api/AccessToken`,
        runAt: nowIso(),
        params: {
          grant_type: 'consumer_credentials',
          consumerKeyPreview: consumerKey ? `${consumerKey.slice(0, 4)}...` : null,
        },
      },
      importRequest: {
        url: `${baseUrl}/api/OrderImport`,
        runAt: nowIso(),
        specialInstructions,
        body: whccOrderRequest,
      },
      resolvedItems: resolvedWhccItems,
      submitRequest: null,
    };

    // Import order to WHCC
    currentStage = 'import';
    currentRequestUrl = `${baseUrl}/api/OrderImport`;
    const importResponse = await axios.post(
      currentRequestUrl,
      whccOrderRequest,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    importResponseData = importResponse.data || null;
    const importResponseDetails = extractWhccResponseDetails(importResponseData);
    requestLog = {
      ...requestLog,
      importResponseMeta: {
        runAt: nowIso(),
        status: importResponse?.status || null,
      },
    };
    confirmationId = importResponseData?.confirmationId || importResponseData?.ConfirmationID || null;
    if (!confirmationId) {
      throw new Error('WHCC import succeeded but no confirmation ID was returned');
    }

    const updateImportPlaceholders = targetOrderIds.map((_, index) => `$${index + 7}`).join(',');
    await query(
      `UPDATE orders
       SET whcc_confirmation_id = $1,
           whcc_order_id = $1,
           whcc_import_response = $2,
           whcc_request_log = $3,
           whcc_order_number = COALESCE($4, whcc_order_number),
           whcc_webhook_status = COALESCE($5, whcc_webhook_status),
           whcc_webhook_event = COALESCE($6, whcc_webhook_event),
           whcc_last_error = NULL
       WHERE id IN (${updateImportPlaceholders})`,
      [
        confirmationId,
        stringifyForDb(importResponseData),
        stringifyForDb(requestLog),
        importResponseDetails.orderNumber,
        importResponseDetails.webhookStatus,
        importResponseDetails.webhookEvent,
        ...targetOrderIds,
      ]
    );

    console.log(`[WHCC] Order(s) ${targetOrderIds.join(', ')} imported with confirmationId: ${confirmationId}`);

    // Submit the imported order
    currentStage = 'submit';
    currentRequestUrl = `${baseUrl}/api/OrderImport/Submit/${confirmationId}`;
    requestLog = {
      ...requestLog,
      submitRequest: {
        url: currentRequestUrl,
        runAt: nowIso(),
        body: {},
      },
    };
    const submitResponse = await axios.post(
      currentRequestUrl,
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': '0',
        },
      }
    );

    submitResponseData = submitResponse.data || null;
    const submitResponseDetails = extractWhccResponseDetails(submitResponseData);
    requestLog = {
      ...requestLog,
      submitResponseMeta: {
        runAt: nowIso(),
        status: submitResponse?.status || null,
      },
    };

    const updateSubmitPlaceholders = targetOrderIds.map((_, index) => `$${index + 9}`).join(',');
    await query(
      `UPDATE orders
       SET lab_submitted = 1,
           lab_submitted_at = CURRENT_TIMESTAMP,
           batch_lab_vendor = CASE WHEN is_batch = 1 THEN 'whcc' ELSE batch_lab_vendor END,
           batch_queue_status = CASE WHEN is_batch = 1 THEN 'submitted' ELSE batch_queue_status END,
           batch_shipping_address = CASE WHEN is_batch = 1 THEN COALESCE($8, batch_shipping_address) ELSE batch_shipping_address END,
           status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END,
           whcc_confirmation_id = $1,
           whcc_import_response = $2,
           whcc_submit_response = $3,
           whcc_request_log = $4,
           whcc_order_number = COALESCE($5, whcc_order_number),
           whcc_webhook_status = COALESCE($6, whcc_webhook_status),
           whcc_webhook_event = COALESCE($7, whcc_webhook_event),
           whcc_last_error = NULL
       WHERE id IN (${updateSubmitPlaceholders})`,
      [
        confirmationId,
        stringifyForDb(importResponseData),
        stringifyForDb(submitResponseData),
        stringifyForDb(requestLog),
        submitResponseDetails.orderNumber,
        submitResponseDetails.webhookStatus,
        submitResponseDetails.webhookEvent,
        shippingAddressOverride ? stringifyForDb(shippingAddressOverride) : null,
        ...targetOrderIds,
      ]
    );

    console.log(`[WHCC] Order(s) ${targetOrderIds.join(', ')} submitted successfully`);
    return {
      submitted: true,
      confirmationId,
      importResponse: importResponseData,
      submitResponse: submitResponseData,
      requestLog,
    };
  } catch (error) {
    const errorPayload = {
      stage: currentStage,
      runAt: nowIso(),
      url: currentRequestUrl || error?.config?.url || null,
      status: error?.response?.status || null,
      statusText: error?.response?.statusText || null,
      message: error?.message || 'WHCC request failed',
      sandbox: sandboxMode,
      confirmationId,
      responseData: error?.response?.data || null,
    };

    requestLog = {
      ...(requestLog || {}),
      lastErrorMeta: {
        stage: currentStage,
        runAt: errorPayload.runAt,
      },
    };

    const errorResponseDetails = extractWhccResponseDetails(errorPayload.responseData, importResponseData, submitResponseData);

    const updateErrorPlaceholders = targetOrderIds.map((_, index) => `$${index + 9}`).join(',');
    await query(
      `UPDATE orders
       SET whcc_confirmation_id = COALESCE($1, whcc_confirmation_id),
           whcc_import_response = COALESCE($2, whcc_import_response),
           whcc_submit_response = COALESCE($3, whcc_submit_response),
           whcc_request_log = COALESCE($4, whcc_request_log),
           whcc_order_number = COALESCE($5, whcc_order_number),
           whcc_webhook_status = COALESCE($6, whcc_webhook_status),
           whcc_webhook_event = COALESCE($7, whcc_webhook_event),
           whcc_last_error = $8,
           batch_queue_status = CASE WHEN is_batch = 1 THEN 'failed' ELSE batch_queue_status END
       WHERE id IN (${updateErrorPlaceholders})`,
      [
        confirmationId,
        stringifyForDb(importResponseData),
        stringifyForDb(submitResponseData),
        stringifyForDb(requestLog),
        errorResponseDetails.orderNumber,
        errorResponseDetails.webhookStatus,
        errorResponseDetails.webhookEvent,
        stringifyForDb(errorPayload),
        ...targetOrderIds,
      ]
    );

    console.error(`[WHCC] Failed to submit order(s) ${targetOrderIds.join(', ')} to WHCC:`, errorPayload);
    // Enhanced error logging for debugging
    if (error) {
      console.error('[WHCC] Full error object:', error);
      if (error?.response) {
        console.error('[WHCC] Error response data:', error.response.data);
        console.error('[WHCC] Error response status:', error.response.status);
        console.error('[WHCC] Error response headers:', error.response.headers);
      }
      if (error?.config) {
        console.error('[WHCC] Error config:', error.config);
      }
    }
    if (throwOnError) {
      const submitError = new Error(errorPayload.message || 'WHCC submission failed');
      submitError.details = errorPayload;
      throw submitError;
    }

    // Non-blocking error — don't fail the order creation
    return {
      submitted: false,
      confirmationId,
      error: errorPayload,
      importResponse: importResponseData,
      submitResponse: submitResponseData,
      requestLog,
    };
  }
};

const sendOrderReceipts = async (orderId) => {
  if (!orderReceiptService.isConfigured()) {
    console.warn('SMTP is not configured; skipping order receipts for order', orderId);
    return;
  }

  const order = await queryRow(
    `SELECT o.id,
            o.user_id as userId,
            o.total as totalAmount,
            o.subtotal,
            o.tax_amount as taxAmount,
            o.shipping_cost as shippingCost,
          o.discount_code as discountCode,
            o.stripe_fee_amount as stripeFeeAmount,
            o.payment_intent_id as paymentIntentId,
            o.stripe_charge_id as stripeChargeId,
            o.shipping_address as shippingAddress,
            o.created_at as createdAt,
            u.email as customerEmail,
            u.name as customerName
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!order) return;

  if (Number(order.stripeFeeAmount || 0) <= 0 && order.paymentIntentId) {
    const refreshedAccounting = await fetchPaymentIntentAccounting(order.paymentIntentId);
    const refreshedStripeFee = Number(refreshedAccounting?.stripeFeeAmount || 0);

    if (refreshedStripeFee > 0 || refreshedAccounting?.chargeId) {
      order.stripeFeeAmount = refreshedStripeFee;
      if (refreshedAccounting?.chargeId) {
        order.stripeChargeId = refreshedAccounting.chargeId;
      }

      await query(
        `UPDATE orders
         SET stripe_fee_amount = CASE WHEN $1 > 0 THEN $1 ELSE COALESCE(stripe_fee_amount, 0) END,
             stripe_charge_id = COALESCE($2, stripe_charge_id)
         WHERE id = $3`,
        [refreshedStripeFee, refreshedAccounting?.chargeId || null, order.id]
      ).catch((err) => {
        console.error('Failed to persist refreshed Stripe accounting before receipts:', err?.message || err);
      });

      // --- PATCH: Update per-item allocated Stripe fee ---
      // Fetch all order items for this order
      const orderItems = await queryRows(
        `SELECT oi.id, oi.quantity FROM order_items oi WHERE oi.order_id = $1`,
        [order.id]
      );
      if (orderItems && orderItems.length > 0) {
        // Allocate the refreshedStripeFee proportionally by item total
        const itemTotals = orderItems.map(item => Number(item.quantity || 1));
        const totalQty = itemTotals.reduce((a, b) => a + b, 0) || 1;
        let allocated = 0;
        for (let i = 0; i < orderItems.length; i++) {
          // Last item gets the remainder to avoid rounding issues
          let allocFee = (i === orderItems.length - 1)
            ? (refreshedStripeFee - allocated)
            : Math.round((itemTotals[i] / totalQty) * refreshedStripeFee * 100) / 100;
          allocated += allocFee;
          await query(
            `UPDATE order_items SET stripe_fee_allocated_amount = $1 WHERE id = $2`,
            [allocFee, orderItems[i].id]
          );
        }
      }
      // --- END PATCH ---
    }
  }

  const items = await queryRows(
    `SELECT oi.id,
            oi.photo_id as photoId,
            oi.photo_ids as photoIds,
            oi.source_album_id as sourceAlbumId,
            oi.digital_download_scope as digitalDownloadScope,
            oi.quantity,
            oi.price as unitPrice,
            ph.file_name as photoFileName,
            COALESCE(oi.product_options_snapshot, p.options) as productOptions,
            p.category as productCategory,
            p.name as productName,
            a.studio_id as studioId,
            s.name as studioName,
            s.email as studioEmail,
            COALESCE(oi.base_revenue_amount / NULLIF(oi.quantity, 0), COALESCE(ps.price, p.price, 0)) as basePrice,
            COALESCE(oi.production_cost_amount / NULLIF(oi.quantity, 0), COALESCE(ps.cost, p.cost, 0)) as cost,
            oi.studio_payout_amount as studioPayoutAmount,
            oi.super_admin_share_amount as superAdminShareAmount,
            oi.stripe_fee_allocated_amount as stripeFeeAllocatedAmount,
            oi.studio_net_payout_amount as studioNetPayoutAmount
     FROM order_items oi
     INNER JOIN products p ON p.id = oi.product_id
     INNER JOIN product_sizes ps ON ps.id = oi.product_size_id
     INNER JOIN photos ph ON ph.id = oi.photo_id
     INNER JOIN albums a ON a.id = ph.album_id
     INNER JOIN studios s ON s.id = a.studio_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  // Ensure APP_BASE_URL is set, fallback to canonical public URL
  const appBase = String(process.env.APP_BASE_URL || process.env.CANONICAL_APP_URL || 'https://labs.campeaphotography.com').trim().replace(/\/$/, '');
  const digitalDownloads = items
    .filter((item) => isDigitalDownloadItem(item))
    .map((item) => {
      const downloadScope = resolveDigitalDownloadScope({ item });
      const token = createDigitalDownloadToken({
        orderId: order.id,
        userId: order.userId,
        orderItemId: item.id,
        photoId: item.photoId,
        downloadScope,
        sourceAlbumId: resolveDigitalSourceAlbumId({ item }),
      });
      const relativeUrl = `/api/orders/digital-download/${token}`;
      return {
        orderItemId: item.id,
        photoId: item.photoId,
        productName: item.productName,
        photoFileName: downloadScope === 'album' ? `Album ${item.sourceAlbumId || ''}`.trim() : item.photoFileName,
        url: appBase ? `${appBase}${relativeUrl}` : relativeUrl,
      };
    });

  const parsedShippingAddress = safeJsonParse(order.shippingAddress, {});
  const superAdminBcc = await getSuperAdminReceiptBcc();
  // Fetch studio email for Reply-To
  let studioEmail = null;
  if (items && items.length > 0) {
    if (items[0].studioId) {
      const studio = await queryRow('SELECT email FROM studios WHERE id = $1', [items[0].studioId]);
      if (studio && studio.email) studioEmail = studio.email;
    }
  }
  const customerSent = await orderReceiptService.sendCustomerReceipt({
    to: parsedShippingAddress?.email || order.customerEmail,
    customerName: parsedShippingAddress?.fullName || order.customerName,
    order,
    items,
    digitalDownloads,
    replyTo: studioEmail,
  });

  // Add delay to avoid Mailtrap rate limiting (free tier: too many emails per second)
  await new Promise(resolve => setTimeout(resolve, 1500));

  const totalItemRevenue = items.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)), 0);
  const studioGroups = new Map();
  for (const item of items) {
    const studioId = Number(item.studioId) || 0;
    if (!studioId) continue;
    if (!studioGroups.has(studioId)) {
      studioGroups.set(studioId, {
        studioName: item.studioName,
        studioEmail: item.studioEmail,
        items: [],
      });
    }
    studioGroups.get(studioId).items.push(item);
  }

  let anyStudioSent = false;
  for (const [, studioGroup] of studioGroups) {
    const studioRevenue = studioGroup.items.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)), 0);
    const baseRevenue = studioGroup.items.reduce((sum, item) => sum + ((Number(item.basePrice) || 0) * (Number(item.quantity) || 0)), 0);
    const productionCost = studioGroup.items.reduce((sum, item) => sum + ((Number(item.cost) || 0) * (Number(item.quantity) || 0)), 0);
    const superAdminProfit = studioGroup.items.reduce((sum, item) => sum + (Number(item.superAdminShareAmount) || 0), 0);
    let stripeFeeAmount = studioGroup.items.reduce((sum, item) => sum + (Number(item.stripeFeeAllocatedAmount) || 0), 0);
    // Fallback: if all items are digital and allocated fee is zero but order-level fee exists, use it
    const allDigital = studioGroup.items.length > 0 && studioGroup.items.every(item => {
      const options = (() => {
        try {
          return typeof item.productOptions === 'string' ? JSON.parse(item.productOptions) : (item.productOptions || {});
        } catch { return {}; }
      })();
      const category = String(item.productCategory || '').toLowerCase();
      const name = String(item.productName || '').toLowerCase();
      return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
    });
    if (allDigital && stripeFeeAmount === 0 && Number(order.stripeFeeAmount) > 0) {
      stripeFeeAmount = Number(order.stripeFeeAmount);
    }
    const orderUrl = String(process.env.APP_BASE_URL || '').trim()
      ? `${String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '')}/admin/orders?orderId=${order.id}`
      : null;
    const studioEmail = normalizeEmail(studioGroup.studioEmail);
    const filteredBcc = superAdminBcc.filter((email) => email && email !== studioEmail);

    const sent = await orderReceiptService.sendStudioReceipt({
      to: studioGroup.studioEmail,
      bcc: filteredBcc,
      studioName: studioGroup.studioName,
      customerEmail: parsedShippingAddress?.email || order.customerEmail,
      order: {
        ...order,
        orderUrl,
        studioRevenue,
        baseRevenue,
        productionCost,
        grossStudioMarkup: studioGroup.items.reduce((sum, item) => sum + (Number(item.studioPayoutAmount) || 0), 0),
        stripeFeeAmount,
        studioProfitNet: studioGroup.items.reduce((sum, item) => sum + (Number(item.studioNetPayoutAmount) || 0), 0),
        superAdminProfit,
      },
      items: studioGroup.items,
    });
    anyStudioSent = anyStudioSent || sent;
    // Small delay between studio emails to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (customerSent || anyStudioSent) {
    // Check if all items are digital
    const allDigital = items.length > 0 && items.every(isDigitalProductRow);
    let updateSql = `UPDATE orders
      SET customer_receipt_sent_at = CASE WHEN $1 = 1 THEN CURRENT_TIMESTAMP ELSE customer_receipt_sent_at END,
          studio_receipt_sent_at = CASE WHEN $2 = 1 THEN CURRENT_TIMESTAMP ELSE studio_receipt_sent_at END`;
    const params = [customerSent ? 1 : 0, anyStudioSent ? 1 : 0];
    if (allDigital) {
      updateSql += ', status = \'completed\'';
    }
    updateSql += ' WHERE id = $3';
    params.push(orderId);
    await query(updateSql, params);
  }
};

// Protect all order routes except tokenized digital download links
router.use((req, res, next) => {
  if (req.path.startsWith('/digital-download/')) {
    return next();
  }
  return authRequired(req, res, next);
});

router.get('/digital-download/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Download token is required' });
    }

    let payload;
    try {
      payload = jwt.verify(token, DOWNLOAD_TOKEN_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired download link' });
    }

    if (payload?.scope !== 'digital-download') {
      return res.status(401).json({ error: 'Invalid download scope' });
    }

    const orderItem = await queryRow(
      `SELECT oi.id as orderItemId,
              oi.photo_id as photoId,
              oi.photo_ids as photoIds,
              oi.source_album_id as sourceAlbumId,
              oi.digital_download_scope as digitalDownloadScope,
              oi.product_options_snapshot as productOptionsSnapshot,
              o.id as orderId,
              o.user_id as userId,
              p.name as productName,
              p.category as productCategory,
              p.options as productOptions
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.id = $1
         AND o.id = $2
         AND o.user_id = $3`,
      [payload.orderItemId, payload.orderId, payload.userId]
    );

    if (!orderItem) {
      return res.status(404).json({ error: 'Download item not found' });
    }

    if (!isDigitalDownloadItem(orderItem)) {
      return res.status(403).json({ error: 'This item is not a digital download product' });
    }

    const downloadScope = resolveDigitalDownloadScope({ item: orderItem, tokenPayload: payload });
    if (downloadScope !== 'album') {
      if (Number(payload.photoId || 0) > 0 && Number(orderItem.photoId || 0) !== Number(payload.photoId || 0)) {
        return res.status(404).json({ error: 'Download item not found' });
      }
      return res.redirect(302, `/api/photos/${orderItem.photoId}/asset?variant=full`);
    }

    const parsedPhotoIds = safeJsonParse(orderItem.photoIds, orderItem.photoId ? [orderItem.photoId] : []);
    const photoIds = Array.isArray(parsedPhotoIds)
      ? parsedPhotoIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (!photoIds.length) {
      return res.status(404).json({ error: 'No album photos found for this download' });
    }

    const placeholders = photoIds.map((_, index) => `$${index + 1}`).join(',');
    const photoRows = await queryRows(
      `SELECT id, file_name as fileName, full_image_url as fullImageUrl
       FROM photos
       WHERE id IN (${placeholders})
       ORDER BY id ASC`,
      photoIds
    );

    if (!photoRows.length) {
      return res.status(404).json({ error: 'Album photos are unavailable for download' });
    }

    const { default: archiver } = await import('archiver');
    const axios = (await import('axios')).default;
    const assetBaseUrl = buildAssetBaseUrl(req);
    const sourceAlbumId = resolveDigitalSourceAlbumId({ item: orderItem, tokenPayload: payload });
    const archiveName = sanitizeDownloadFileName(`${orderItem.productName || 'album-download'}-${sourceAlbumId || 'album'}`, 'album-download');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const usedNames = new Map();
    for (const photo of photoRows) {
      const assetUrl = assetBaseUrl ? `${assetBaseUrl}/api/photos/${photo.id}/asset?variant=full` : '';
      if (!assetUrl) continue;

      const response = await axios.get(assetUrl, { responseType: 'stream' });
      const rawName = sanitizeDownloadFileName(photo.fileName || `photo-${photo.id}.jpg`, `photo-${photo.id}.jpg`);
      const currentCount = usedNames.get(rawName) || 0;
      usedNames.set(rawName, currentCount + 1);
      const finalName = currentCount === 0
        ? rawName
        : rawName.replace(/(\.[^.]+)?$/, `-${currentCount + 1}$1`);
      archive.append(response.data, { name: finalName });
    }

    archive.on('error', (error) => {
      throw error;
    });
    await archive.finalize();
    return;
  } catch (error) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {}
      return;
    }
    return res.status(500).json({ error: error.message });
  }
});

const handleWhccRetryRequest = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) return res.status(400).json({ error: 'Invalid orderId' });

    const order = await queryRow(
      `SELECT id, lab_submitted, is_batch FROM orders WHERE id = $1`,
      [orderId]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.is_batch) return res.status(400).json({ error: 'Cannot retry WHCC submission for batch orders' });
    if (order.lab_submitted) return res.status(400).json({ error: 'Order has already been successfully submitted to WHCC' });

    await query(
      `UPDATE orders
       SET whcc_last_error = NULL,
           whcc_confirmation_id = NULL,
           whcc_import_response = NULL,
           whcc_submit_response = NULL,
           whcc_request_log = NULL
       WHERE id = $1`,
      [orderId]
    );

    submitOrderToWhcc(orderId).catch((err) => {
      console.error(`[WHCC retry] Unhandled error for order ${orderId}:`, err?.message || err);
    });

    res.json({ success: true, message: `WHCC retry started for order ${orderId}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get current user's orders
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await queryRows(`
            SELECT o.id, o.user_id as userId, o.total, o.shipping_address as shippingAddress,
              o.created_at as createdAt,
              o.stripe_fee_amount as stripeFeeAmount,
              o.payment_intent_id as paymentIntentId
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
    `, [userId]);
    
    // Parse JSON items
    const parsedOrders = [];
    for (const order of orders) {
      const items = await queryRows(
        `SELECT oi.id, oi.photo_id as photoId, oi.photo_ids as photoIds, oi.product_id as productId,
                oi.quantity, oi.price, oi.crop_data as cropData
         FROM order_items oi WHERE oi.order_id = $1`,
        [order.id]
      );
      parsedOrders.push({
        ...order,
        shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
        items: items.map(item => ({
          ...item,
          cropData: item.cropData ? JSON.parse(item.cropData) : null,
          photoIds: item.photoIds ? JSON.parse(item.photoIds) : item.photoId ? [item.photoId] : [],
        })),
      });
    }
    
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order for current user (requires active subscription for studio selling)
router.post('/', requireActiveSubscription, async (req, res) => {
  try {
    await ensureOrderItemAccountingSchema();
    const userId = req.user.id;
    const { 
      items, 
      subtotal,
      taxAmount,
      taxRate,
      shippingAddress, 
      shippingOption, 
      shippingCost, 
      discountCode,
      paymentIntentId,
      isBatch,
      labSubmitted,
      batchShippingAddress,
      batchLabVendor,
    } = req.body;

    // Determine if all items are digital-only
    const allDigital = Array.isArray(items) && items.length > 0 && items.every((item) => {
      // Use the same logic as isDigitalProductRow
      const options = (() => {
        try {
          return typeof item.productOptions === 'string' ? JSON.parse(item.productOptions) : (item.productOptions || {});
        } catch { return {}; }
      })();
      const category = String(item.productCategory || '').toLowerCase();
      const name = String(item.productName || '').toLowerCase();
      return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
    });

    // If all items are digital, force shipping to 0
    const computedSubtotal = Number(subtotal) || 0;
    const computedShipping = allDigital ? 0 : (Number(shippingCost) || 0);
    const computedTax = Number(taxAmount) || 0;
    const total = +(computedSubtotal + computedShipping + computedTax).toFixed(2);

    // --- PATCH: If all items are digital, update Stripe payment intent to correct amount (no shipping) ---
    if (allDigital && paymentIntentId) {
      try {
        const stripe = await getConfiguredStripeClient();
        if (stripe) {
          await stripe.paymentIntents.update(paymentIntentId, {
            amount: Math.round(total * 100),
          });
        }
      } catch (err) {
        console.error('[Stripe] Failed to update payment intent for digital-only order:', err?.message || err);
      }
    }

    const paymentAccounting = await fetchPaymentIntentAccounting(paymentIntentId);

    const requestedShippingOption = String(shippingOption || '').toLowerCase();
    const batchOrder = !!isBatch || requestedShippingOption === 'batch';
    const directOrder = !batchOrder;
    // If all digital, shipping option is forced to 'none'
    const normalizedShippingOption = allDigital ? 'none' : (batchOrder ? 'batch' : 'direct');
    const orderStudioId = await getOrderStudioIdFromItems(items);
    if (!orderStudioId) {
      return res.status(400).json({ error: 'Unable to determine studio for this order' });
    }

    let batchReadyDate = null;
    if (batchOrder) {
      const batchEligibility = await validateBatchEligibilityForOrder({
        studioId: orderStudioId,
        items,
      });

      if (!batchEligibility.ok) {
        return res.status(400).json({ error: batchEligibility.error || 'Batch shipping is unavailable for this order' });
      }

      batchReadyDate = batchEligibility.batchReadyDate || null;
    }

    // studio_shipping_cost and shipping_margin are not known at order creation time
    // (WHCC shipping is charged after lab submission). Store as 0.
    const studioShippingCost = 0;
    const shippingMargin = 0;

    // Set all new orders to 'pending' and do not auto-submit direct shipping orders to WHCC
    const nextStatus = 'pending';
    const shouldMarkLabSubmitted = !!labSubmitted;

    // Insert order and get the returned id

    // Set approval_status to 'pending' for all new WHCC-fulfillable orders
    const orderResult = await queryRow(`
      INSERT INTO orders (
        studio_id,
        user_id, 
        status,
        approval_status,
        total, 
        subtotal,
        tax_amount,
        tax_rate,
        shipping_address, 
        shipping_option, 
        shipping_cost,
        studio_shipping_cost,
        shipping_margin,
        discount_code,
        is_batch,
        batch_shipping_address,
        batch_ready_date,
        batch_queue_status,
        batch_lab_vendor,
        lab_submitted,
        lab_submitted_at,
        payment_intent_id,
        stripe_fee_amount,
        stripe_charge_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CASE WHEN $20 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, $21, $22, $23
      )
      RETURNING id
    `, [
      orderStudioId,
      userId, 
      nextStatus,
      'pending', // approval_status
      total,
      subtotal || 0, 
      taxAmount || 0,
      taxRate || 0,
      JSON.stringify(shippingAddress),
      normalizedShippingOption,
      allDigital ? 0 : (shippingCost || 0),
      studioShippingCost,
      shippingMargin,
      discountCode || null,
      batchOrder,
      batchShippingAddress ? JSON.stringify(batchShippingAddress) : null,
      batchReadyDate,
      batchOrder ? 'queued' : null,
      batchLabVendor || null,
      shouldMarkLabSubmitted,
      paymentAccounting.paymentIntentId,
      paymentAccounting.stripeFeeAmount,
      paymentAccounting.chargeId,
    ]);

    const orderId = orderResult.id;

    if (discountCode) {
      await query(
        `UPDATE discount_codes
         SET usage_count = usage_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE UPPER(code) = UPPER($1) AND studio_id = $2`,
        [discountCode, orderStudioId]
      ).catch(() => {});
    }

    const whccVariantSnapshotCache = new Map();
    // DEBUG: Log before itemsWithAccounting construction
    console.debug('[ORDER ITEM ACCOUNTING DEBUG] About to build itemsWithAccounting for order', { itemsLength: Array.isArray(items) ? items.length : 0, items });
    const hydrateProductOptionsWithWhccVariants = async (productSizeId, productOptions) => {
      const normalizedSizeId = Number(productSizeId || 0);
      if (!Number.isInteger(normalizedSizeId) || normalizedSizeId <= 0) {
        return productOptions;
      }

      const existingVariants = Array.isArray(productOptions?.whccVariants)
        ? productOptions.whccVariants
            .map((variant) => {
              const uid = Number(variant?.whccProductUID || 0);
              if (!Number.isInteger(uid) || uid <= 0) return null;
              return {
                ...variant,
                id: Number.isInteger(Number(variant?.id)) ? Number(variant.id) : null,
                localId: String(variant?.localId || ''),
                displayName: String(variant?.displayName || ''),
                whccProductUID: uid,
                whccProductNodeIDs: Array.isArray(variant?.whccProductNodeIDs)
                  ? variant.whccProductNodeIDs.map(Number).filter((v) => Number.isInteger(v) && v > 0)
                  : [],
                whccItemAttributeUIDs: Array.isArray(variant?.whccItemAttributeUIDs)
                  ? variant.whccItemAttributeUIDs.map(Number).filter((v) => Number.isInteger(v) && v > 0)
                  : [],
                isDefault: Boolean(variant?.isDefault),
                isActive: variant?.isActive === undefined ? true : Boolean(variant?.isActive),
              };
            })
            .filter(Boolean)
        : [];

      if (existingVariants.length > 0) {
        const selectedVariantId = Number(
          productOptions?.whccSelectedVariantId ??
          productOptions?.selectedWhccVariantId ??
          productOptions?.selectedVariantId
        );
        const selectedVariantLocalId = String(
          productOptions?.whccSelectedVariantLocalId ??
          productOptions?.selectedWhccVariantLocalId ??
          ''
        ).trim();

        const selectedVariant = existingVariants.find((variant) => variant?.id && selectedVariantId && Number(variant.id) === selectedVariantId)
          || existingVariants.find((variant) => selectedVariantLocalId && variant?.localId === selectedVariantLocalId)
          || existingVariants.find((variant) => variant?.isDefault && variant?.isActive)
          || existingVariants.find((variant) => variant?.isActive)
          || existingVariants[0]
          || null;

        if (selectedVariant?.whccProductUID) {
          return {
            ...(productOptions || {}),
            whccVariants: existingVariants,
            whccSelectedVariantId: selectedVariant.id,
            whccSelectedVariantLocalId: selectedVariant.localId || null,
            whccProductUID: selectedVariant.whccProductUID,
            whccProductNodeID: Array.isArray(selectedVariant.whccProductNodeIDs) && selectedVariant.whccProductNodeIDs.length
              ? selectedVariant.whccProductNodeIDs[0]
              : null,
            whccItemAttributeUIDs: Array.isArray(selectedVariant.whccItemAttributeUIDs)
              ? selectedVariant.whccItemAttributeUIDs
              : [],
          };
        }
      }

      if (!whccVariantSnapshotCache.has(normalizedSizeId)) {
        const rows = await queryRows(
          `SELECT v.id,
                  v.display_name,
                  v.whcc_product_uid,
                  v.whcc_product_node_ids,
                  v.whcc_item_attribute_uids,
                  v.base_cost,
                  v.price,
                  v.is_default,
                  v.is_active
           FROM super_price_list_item_whcc_variants v
           INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
           WHERE spi.product_size_id = $1
             AND spi.is_active = 1
           ORDER BY v.is_default DESC, v.id ASC`,
          [normalizedSizeId]
        );

        const variants = (rows || [])
          .map((row) => {
            const uid = Number(row?.whcc_product_uid || 0);
            if (!Number.isInteger(uid) || uid <= 0) return null;
            return {
              id: Number(row?.id || 0) || null,
              displayName: String(row?.display_name || ''),
              whccProductUID: uid,
              whccProductNodeIDs: safeJsonParse(row?.whcc_product_node_ids, [])
                .map(Number)
                .filter((v) => Number.isInteger(v) && v > 0),
              whccItemAttributeUIDs: safeJsonParse(row?.whcc_item_attribute_uids, [])
                .map(Number)
                .filter((v) => Number.isInteger(v) && v > 0),
              baseCost: row?.base_cost === null || row?.base_cost === undefined ? null : Number(row.base_cost),
              price: row?.price === null || row?.price === undefined ? null : Number(row.price),
              isDefault: Boolean(row?.is_default),
              isActive: Boolean(row?.is_active),
            };
          })
          .filter(Boolean);

        whccVariantSnapshotCache.set(normalizedSizeId, variants);
      }

      const variants = whccVariantSnapshotCache.get(normalizedSizeId) || [];
      if (!variants.length) return productOptions;

      const selectedVariant = variants.find((variant) => variant.isDefault && variant.isActive)
        || variants.find((variant) => variant.isActive)
        || variants[0]
        || null;
      if (!selectedVariant?.whccProductUID) return productOptions;

      return {
        ...(productOptions || {}),
        whccVariants: variants,
        whccSelectedVariantId: selectedVariant.id,
        whccProductUID: selectedVariant.whccProductUID,
        whccProductNodeID: Array.isArray(selectedVariant.whccProductNodeIDs) && selectedVariant.whccProductNodeIDs.length
          ? selectedVariant.whccProductNodeIDs[0]
          : null,
        whccItemAttributeUIDs: Array.isArray(selectedVariant.whccItemAttributeUIDs)
          ? selectedVariant.whccItemAttributeUIDs
          : [],
      };
    };

    const itemsWithAccounting = [];
    try {
      for (const item of items) {
      const photoIds = Array.isArray(item.photoIds)
        ? item.photoIds
        : item.photoId
        ? [item.photoId]
        : [];
      const primaryPhotoId = photoIds[0];
      if (!primaryPhotoId) {
        throw new Error('Order item missing photo');
      }

      const photoRow = await queryRow(
        `SELECT album_id as albumId
         FROM photos
         WHERE id = $1`,
        [primaryPhotoId]
      );

      let productRow = null;
      if (item.productSizeId) {
        productRow = await queryRow(
          `SELECT TOP 1
                  p.id as productId,
                  p.name as productName,
                  p.category as productCategory,
                  p.options as productOptions,
                  p.price as productBasePrice,
                  p.cost as productCost,
                  ps.id as productSizeId,
                  ps.price as sizeBasePrice,
                  ps.cost as sizeCost
           FROM product_sizes ps
           INNER JOIN products p ON p.id = ps.product_id
           WHERE ps.id = $1`,
          [item.productSizeId]
        );
      } else if (item.productId) {
        productRow = await queryRow(
          `SELECT TOP 1
                  id as productId,
                  name as productName,
                  category as productCategory,
                  options as productOptions,
                  price as productBasePrice,
                  cost as productCost
           FROM products
           WHERE id = $1`,
          [item.productId]
        );
      }

      const baseProductOptions = safeJsonParse(productRow?.productOptions, {}) || {};
      const incomingProductOptions = safeJsonParse(item.productOptions, {}) || {};
      const mergedProductOptions = {
        ...baseProductOptions,
        ...incomingProductOptions,
      };
      // Always assign productOptionsSnapshot before extraction
      item.productOptionsSnapshot = item.productOptionsSnapshot || stringifyForDb(mergedProductOptions);
      // ...
      // Robustly resolve attributes from all possible sources and merge
      let attributes = [];
      // Always extract whccItemAttributeUIDs from productOptionsSnapshot if present
      let parsedSnapshot = item.productOptionsSnapshot;
      if (typeof parsedSnapshot === 'string') {
        try { parsedSnapshot = JSON.parse(parsedSnapshot); } catch { parsedSnapshot = {}; }
      } else if (typeof parsedSnapshot === 'object' && parsedSnapshot !== null) {
        // Use as-is
      } else {
        parsedSnapshot = {};
      }
      // Debug: log parsed snapshot
      // ...
      if (parsedSnapshot && typeof parsedSnapshot === 'object') {
        if (Array.isArray(parsedSnapshot.whccItemAttributeUIDs) && parsedSnapshot.whccItemAttributeUIDs.length > 0) {
          attributes = attributes.concat(parsedSnapshot.whccItemAttributeUIDs);
        }
        if (Array.isArray(parsedSnapshot.attributes) && parsedSnapshot.attributes.length > 0) {
          attributes = attributes.concat(parsedSnapshot.attributes);
        } else if (typeof parsedSnapshot.attributes === 'string') {
          attributes.push(parsedSnapshot.attributes);
        }
      }
      // 1. Top-level item.attributes
      if (Array.isArray(item.attributes) && item.attributes.length > 0) {
        attributes = attributes.concat(item.attributes);
      } else if (item.attributes && typeof item.attributes === 'string') {
        attributes.push(item.attributes);
      }
      // 3. productOptions
      if (item.productOptions) {
        let options = item.productOptions;
        if (typeof options === 'string') {
          try { options = JSON.parse(options); } catch { options = {}; }
        }
        if (options && typeof options === 'object') {
          if (Array.isArray(options.whccItemAttributeUIDs) && options.whccItemAttributeUIDs.length > 0) {
            attributes = attributes.concat(options.whccItemAttributeUIDs);
          }
          if (Array.isArray(options.attributes) && options.attributes.length > 0) {
            attributes = attributes.concat(options.attributes);
          } else if (typeof options.attributes === 'string') {
            attributes.push(options.attributes);
          }
        }
      }
      // 4. Remove falsy and deduplicate
      // Debug: log raw attributes before filtering
      // ...
      // Allow both numbers and non-empty strings (for future-proofing)
      attributes = attributes.filter(x => x !== undefined && x !== null && x !== '').map(x => {
        if (typeof x === 'string' && /^\d+$/.test(x)) return Number(x);
        return x;
      });
      // Remove duplicates
      attributes = Array.from(new Set(attributes));
      // Debug: log filtered attributes
      // ...
      // Assign extracted attributes to item.attributes for downstream use
      item.attributes = attributes.length ? attributes : undefined;
      // Debug: log assignment
      // ...
      // For downstream accounting, hydrate with backend logic
      const productOptions = await hydrateProductOptionsWithWhccVariants(item.productSizeId, mergedProductOptions);
      const isDigital = isDigitalProductRow({
        productOptions,
        productCategory: productRow?.productCategory,
        productName: productRow?.productName,
      });
      const accounting = calculateItemAccountingSnapshot({
        unitPrice: item.price,
        quantity: item.quantity,
        baseUnitPrice: productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0,
        productionUnitCost: productRow?.sizeCost ?? productRow?.productCost ?? 0,
        isDigital,
        productOptions,
      });

      itemsWithAccounting.push({
        ...item,
        photoIds,
        primaryPhotoId,
        sourceAlbumId: Number(item.albumId || photoRow?.albumId || 0) || null,
        productOptionsSnapshot: item.productOptionsSnapshot,
        attributes,
        accounting,
      });
      }
      // DEBUG: Log after itemsWithAccounting construction
      // ...
    } catch (err) {
      // ...
      throw err;
    }
// Global error handlers for this module


    const totalItemRevenue = itemsWithAccounting.reduce(
      (sum, item) => sum + (Number(item.accounting?.studioRevenueAmount) || 0),
      0
    );

    // Insert order items
    console.log('[ORDER ITEM LOOP DEBUG] About to insert order items', { itemsWithAccountingCount: itemsWithAccounting.length, itemsWithAccounting });
    for (const item of itemsWithAccounting) {
      const stripeFeeAllocatedAmount = totalItemRevenue > 0
        ? (Number(paymentAccounting.stripeFeeAmount) || 0) * ((Number(item.accounting?.studioRevenueAmount) || 0) / totalItemRevenue)
        : 0;
      const studioNetPayoutAmount = (Number(item.accounting?.studioPayoutAmount) || 0) - stripeFeeAllocatedAmount;

      // Use attribute UIDs from item.attributes (array of numbers or strings)
      let attrs = Array.isArray(item.attributes)
        ? item.attributes
            .map(x => typeof x === 'string' ? Number(x) : x)
            .filter(x => typeof x === 'number' && !isNaN(x))
        : [];
      // PATCH: Filter out default attribute UID (5) if another is present
      if (attrs.length > 1 && attrs.includes(5)) {
        attrs = attrs.filter(x => x !== 5);
      }
      const attributesJson = attrs && attrs.length ? JSON.stringify(attrs) : null;
      // Debug logging for attribute extraction and what will be saved
      console.log('[ORDER ITEM ATTR DEBUG]', {
        productOptionsSnapshot: item.productOptionsSnapshot,
        itemAttributes: item.attributes,
        resolvedAttrs: attrs,
        attributesJsonToSave: attributesJson
      });
      // Extra debug: log full item payload before insert
      console.log('[ORDER ITEM INSERT PAYLOAD]', {
        orderId,
        primaryPhotoId: item.primaryPhotoId,
        photoIds: item.photoIds,
        productId: item.productId,
        productSizeId: item.productSizeId,
        quantity: item.quantity,
        price: item.price,
        cropData: item.cropData,
        productOptionsSnapshot: item.productOptionsSnapshot,
        accounting: item.accounting,
        sourceAlbumId: item.sourceAlbumId,
        attributesJson
      });
      // Patch: always save the resolved attribute UIDs array in both columns
      let options = item.productOptionsSnapshot;
      if (typeof options === 'string') {
        try { options = JSON.parse(options); } catch { options = {}; }
      }
      let productOptionsSnapshotPatched = options && typeof options === 'object'
        ? JSON.stringify({ ...options, attributes: attrs })
        : item.productOptionsSnapshot;

      try {
        const sql = `
          INSERT INTO order_items (
            order_id, photo_id, photo_ids, product_id, product_size_id, quantity, price, crop_data,
            product_options_snapshot, fulfillment_type, digital_download_scope, source_album_id, pricing_snapshot,
            studio_revenue_amount, base_revenue_amount, production_cost_amount, gross_studio_markup_amount,
            studio_payout_amount, super_admin_share_amount, stripe_fee_allocated_amount, studio_net_payout_amount,
            attributes
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, $20, $21,
            $22
          )
        `;
        const params = [
          orderId,
          item.primaryPhotoId,
          JSON.stringify(item.photoIds),
          item.productId,
          item.productSizeId || null,
          item.quantity,
          item.price,
          item.cropData ? JSON.stringify(item.cropData) : null,
          productOptionsSnapshotPatched,
          item.accounting?.fulfillmentType || null,
          item.accounting?.digitalDownloadScope || null,
          item.sourceAlbumId,
          stringifyForDb(item.accounting?.pricingSnapshot || null),
          Number(item.accounting?.studioRevenueAmount) || 0,
          Number(item.accounting?.baseRevenueAmount) || 0,
          Number(item.accounting?.productionCostAmount) || 0,
          Number(item.accounting?.grossStudioMarkupAmount) || 0,
          Number(item.accounting?.studioPayoutAmount) || 0,
          Number(item.accounting?.superAdminShareAmount) || 0,
          stripeFeeAllocatedAmount,
          studioNetPayoutAmount,
          attributesJson,
        ];
        console.log('[ORDER ITEM SQL DEBUG]', { sql, params });
        await query(sql, params);
      } catch (err) {
        console.error('[ORDER ITEM INSERT ERROR]', err && err.message, err && err.stack);
        throw err;
      }
    }

    // Generate studio invoice line items for each order item
    try {
      // Collect per-studio invoice items
      const studioItemMap = new Map(); // studio_id -> { subscriptionEnd, items: [] }

      for (const item of itemsWithAccounting) {
        if (!item.productSizeId && !item.productId) continue;
        const photoIds = Array.isArray(item.photoIds) ? item.photoIds : item.photoId ? [item.photoId] : [];
        const primaryPhotoId = photoIds[0];
        if (!primaryPhotoId) continue;

        // Resolve studio via photo -> album
        const photo = await queryRow('SELECT album_id FROM photos WHERE id = $1', [primaryPhotoId]);
        if (!photo?.album_id) continue;

        const album = await queryRow(
          'SELECT a.studio_id, a.price_list_id FROM albums a WHERE a.id = $1',
          [photo.album_id]
        );
        if (!album?.studio_id) continue;

        // Get the super admin price for this size (studio's cost)
        let unitCost = 0;
        if (item.productSizeId) {
          const sizeRow = await queryRow(
            'SELECT price FROM product_sizes WHERE id = $1',
            [item.productSizeId]
          );
          unitCost = Number(sizeRow?.price) || 0;
        }

        const studioId = Number(album.studio_id);
        if (!studioItemMap.has(studioId)) {
          const studio = await queryRow(
            'SELECT subscription_end FROM studios WHERE id = $1',
            [studioId]
          );
          studioItemMap.set(studioId, { subscriptionEnd: studio?.subscription_end || null, items: [] });
        }
        studioItemMap.get(studioId).items.push({
          productId: item.productId || null,
          productSizeId: item.productSizeId || null,
          quantity: Number(item.quantity) || 1,
          unitCost,
        });
      }

      // For each studio, upsert the open invoice and add line items
      for (const [studioId, { items: invoiceItems }] of studioItemMap) {
        let invoice = await queryRow(
          `SELECT id, total_amount, item_count FROM studio_invoices
           WHERE studio_id = $1 AND status = 'open'
           ORDER BY created_at DESC`,
          [studioId]
        );

        if (!invoice) {
          const result = await queryRow(
            `INSERT INTO studio_invoices (studio_id, billing_period_start, status, total_amount, item_count)
             VALUES ($1, CURRENT_TIMESTAMP, 'open', 0, 0)
             RETURNING id`,
            [studioId]
          );
          invoice = { id: result.id, total_amount: 0, item_count: 0 };
        }

        let addedTotal = 0;
        let addedItemCount = 0;
        for (const invoiceItem of invoiceItems) {
          const totalCost = invoiceItem.unitCost * invoiceItem.quantity;
          await query(
            `INSERT INTO studio_invoice_items
               (invoice_id, studio_id, order_id, product_id, product_size_id, quantity, unit_cost, total_cost, order_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [
              invoice.id, studioId, orderId,
              invoiceItem.productId, invoiceItem.productSizeId,
              invoiceItem.quantity, invoiceItem.unitCost, totalCost,
            ]
          );
          addedTotal += totalCost;
          addedItemCount += invoiceItem.quantity;
        }

        await query(
          `UPDATE studio_invoices
           SET total_amount = total_amount + $1, item_count = item_count + $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [addedTotal, addedItemCount, invoice.id]
        );
      }
    } catch (invoiceErr) {
      // Invoice generation is non-blocking — log but don't fail the order
      console.error('Invoice generation error (non-fatal):', invoiceErr);
    }

    // Do not auto-submit direct shipping orders to WHCC; submission must be manual/approved
    // ...existing code...

    // Return the created order
    // PATCH: Suppress email receipts for test orders
    const suppressEmail = req.body.suppressEmail === true;
    if (!suppressEmail) {
      try {
        await sendOrderReceipts(orderId);
      } catch (receiptError) {
        console.error('Order receipt send failed (non-fatal):', receiptError);
      }
    } else {
      console.log('[ORDER][DEBUG] Email receipts suppressed for test order:', orderId);
    }

    const createdOrder = await queryRow('SELECT * FROM orders WHERE id = $1', [orderId]);
    res.status(201).json({
      id: createdOrder.id,
      userId: createdOrder.user_id,
      totalAmount: createdOrder.total,
      subtotal: createdOrder.subtotal,
      taxAmount: createdOrder.tax_amount,
      taxRate: createdOrder.tax_rate,
      stripeFeeAmount: Number(createdOrder.stripe_fee_amount) || 0,
      paymentIntentId: createdOrder.payment_intent_id || null,
      status: createdOrder.status || 'Pending',
      orderDate: createdOrder.created_at,
      shippingAddress: createdOrder.shipping_address ? JSON.parse(createdOrder.shipping_address) : null,
      shippingOption: createdOrder.shipping_option,
      shippingCost: createdOrder.shipping_cost,
      batchShippingAddress: safeJsonParse(createdOrder.batch_shipping_address),
      batchReadyDate: createdOrder.batch_ready_date,
      batchQueueStatus: createdOrder.batch_queue_status,
      batchLabVendor: createdOrder.batch_lab_vendor,
      isBatch: Boolean(createdOrder.is_batch),
      labSubmitted: Boolean(createdOrder.lab_submitted),
      labSubmittedAt: createdOrder.lab_submitted_at,
      items: [],
      message: 'Order created successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's orders (customer view)
router.get('/', async (req, res) => {
  try {
    console.log('[GET /api/orders] Query params:', req.query);
    console.log('[GET /api/orders] User:', req.user);
    const userId = req.user.id;
    const actingStudioId = req.headers['x-acting-studio-id'];
    const includeItems = String(req.query.includeItems || '').toLowerCase() === '1' || String(req.query.includeItems || '').toLowerCase() === 'true';
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 200)
      : 100;
    let orders;
    if (actingStudioId) {
      orders = await queryRows(`
        SELECT TOP ${limit}
          o.id, 
          o.user_id as userId, 
          o.total as totalAmount,
          o.subtotal,
          o.tax_amount as taxAmount,
          o.tax_rate as taxRate,
          o.status,
          o.shipping_address as shippingAddress,
          o.shipping_option as shippingOption,
          o.shipping_cost as shippingCost,
          o.is_batch as isBatch,
          o.batch_shipping_address as batchShippingAddress,
          o.batch_ready_date as batchReadyDate,
          o.batch_queue_status as batchQueueStatus,
          o.batch_lab_vendor as batchLabVendor,
          o.lab_submitted as labSubmitted,
          o.lab_submitted_at as labSubmittedAt,
          o.stripe_fee_amount as stripeFeeAmount,
          o.payment_intent_id as paymentIntentId,
          o.customer_receipt_sent_at as customerReceiptSentAt,
          o.studio_receipt_sent_at as studioReceiptSentAt,
          o.created_at as orderDate
        FROM orders o
        WHERE o.studio_id = $1
        ORDER BY o.created_at DESC
      `, [actingStudioId]);
    } else {
      orders = await queryRows(`
        SELECT TOP ${limit}
          o.id, 
          o.user_id as userId, 
          o.total as totalAmount,
          o.subtotal,
          o.tax_amount as taxAmount,
          o.tax_rate as taxRate,
          o.status,
          o.shipping_address as shippingAddress,
          o.shipping_option as shippingOption,
          o.shipping_cost as shippingCost,
          o.is_batch as isBatch,
          o.batch_shipping_address as batchShippingAddress,
          o.batch_ready_date as batchReadyDate,
          o.batch_queue_status as batchQueueStatus,
          o.batch_lab_vendor as batchLabVendor,
          o.lab_submitted as labSubmitted,
          o.lab_submitted_at as labSubmittedAt,
          o.stripe_fee_amount as stripeFeeAmount,
          o.payment_intent_id as paymentIntentId,
          o.customer_receipt_sent_at as customerReceiptSentAt,
          o.studio_receipt_sent_at as studioReceiptSentAt,
          o.created_at as orderDate
        FROM orders o
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC
      `, [userId]);
    }
    
    const parsedOrders = [];
    for (const order of orders) {

      // Always fetch items for digital-only recalculation
      const items = await queryRows(
        `SELECT oi.id, oi.photo_id as photoId, oi.photo_ids as photoIds, oi.product_id as productId,
                oi.product_size_id as productSizeId, oi.quantity, oi.price, oi.crop_data as cropData,
                oi.digital_download_scope as digitalDownloadScope,
                oi.studio_revenue_amount as studioRevenueAmount,
                oi.base_revenue_amount as baseRevenueAmount,
                oi.production_cost_amount as productionCostAmount,
                oi.studio_payout_amount as studioPayoutAmount,
                oi.super_admin_share_amount as superAdminShareAmount,
                oi.stripe_fee_allocated_amount as stripeFeeAllocatedAmount,
                oi.studio_net_payout_amount as studioNetPayoutAmount,
                attributes
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      const itemsWithPhotos = [];
      for (const item of items) {
        const photo = await queryRow(
          `SELECT id, album_id as albumId, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl, width, height
           FROM photos WHERE id = $1`,
          [item.photoId]
        );
        let unitCost = 0;
        let productName = null;
        let productSizeName = null;
        if (item.productSizeId) {
          const size = await queryRow(
            `SELECT ps.price, ps.size_name as sizeName, p.name as productName, p.id as productId
             FROM product_sizes ps
             LEFT JOIN products p ON p.id = ps.product_id
             WHERE ps.id = $1`,
            [item.productSizeId]
          );
          unitCost = Number(size?.price) || 0;
          productSizeName = size?.sizeName || null;
          if (!productName) productName = size?.productName || null;
        } else if (item.productId) {
          const product = await queryRow(
            `SELECT p.price, p.name FROM products p WHERE p.id = $1`,
            [item.productId]
          );
          unitCost = Number(product?.price) || 0;
          productName = product?.name || null;
        }

        // --- Attribute UID to Name Mapping ---
        // 1. Get album for this photo
        let album = null;
        if (item.photoId) {
          const photoRow = await queryRow('SELECT album_id FROM photos WHERE id = $1', [item.photoId]);
          if (photoRow?.album_id) {
            album = await queryRow('SELECT price_list_id FROM albums WHERE id = $1', [photoRow.album_id]);
          }
        }
        let priceListId = album?.price_list_id || null;
        let attributeIdToName = {};
        if (priceListId && item.productSizeId) {
          // Load whccAttributeCategories for this product/size from the price list
          const priceListItems = await queryRows(
            `SELECT spi.product_size_id, sspi.whcc_attribute_categories
             FROM studio_price_list_items spi
             JOIN super_price_list_items sspi ON sspi.product_size_id = spi.product_size_id AND sspi.super_price_list_id = (SELECT super_price_list_id FROM studio_price_lists WHERE id = $1)
             WHERE spi.studio_price_list_id = $1 AND spi.product_size_id = $2`,
            [priceListId, item.productSizeId]
          );
          for (const pli of priceListItems) {
            let categories = [];
            try {
              categories = JSON.parse(pli.whcc_attribute_categories || '[]');
            } catch { categories = []; }
            for (const cat of categories) {
              if (Array.isArray(cat.attributes)) {
                for (const attr of cat.attributes) {
                  if (attr.uid && attr.name) attributeIdToName[attr.uid] = attr.name;
                }
              }
            }
          }
        }
        // Parse attributes and map UIDs to names
        let parsedAttributes = safeJsonParse(item.attributes);
        if (parsedAttributes == null) {
          parsedAttributes = [];
        } else if (typeof parsedAttributes === 'string' && parsedAttributes.trim() !== '') {
          parsedAttributes = [parsedAttributes];
        } else if (Array.isArray(parsedAttributes)) {
          parsedAttributes = parsedAttributes.filter((a) => typeof a === 'string' || typeof a === 'number');
        } else {
          parsedAttributes = [];
        }
        // Map UIDs to names, fallback to UID if no name found
        const mappedAttributes = parsedAttributes.map((uid) => attributeIdToName[uid] || String(uid));

        itemsWithPhotos.push({
          ...item,
          price: item.price || 0,
          cost: unitCost,
          digitalDownloadScope: item.digitalDownloadScope || null,
          studioRevenueAmount: Number(item.studioRevenueAmount) || 0,
          baseRevenueAmount: Number(item.baseRevenueAmount) || 0,
          productionCostAmount: Number(item.productionCostAmount) || 0,
          studioPayoutAmount: Number(item.studioPayoutAmount) || 0,
          superAdminShareAmount: Number(item.superAdminShareAmount) || 0,
          stripeFeeAllocatedAmount: Number(item.stripeFeeAllocatedAmount) || 0,
          studioNetPayoutAmount: Number(item.studioNetPayoutAmount) || 0,
          productName,
          productSizeName,
          cropData: safeJsonParse(item.cropData),
          photoIds: safeJsonParse(item.photoIds, item.photoId ? [item.photoId] : []),
          attributes: mappedAttributes,
          photo: photo ? {
            id: photo.id,
            albumId: photo.albumId,
            fileName: photo.filename ?? photo.fileName,
            width: photo.width || null,
            height: photo.height || null,
            thumbnailUrl: `/api/photos/${photo.id}/asset?variant=thumbnail`,
            url: `/api/photos/${photo.id}/asset?variant=full`,
          } : {
            id: item.photoId,
            albumId: 0,
            fileName: `Photo #${item.photoId}`,
            width: null,
            height: null,
            thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
            url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
          },
        });
      }

      // If all items are digital, recalculate all amounts using robust digital detection
      let shippingCostOut = order.shippingCost;
      let subtotalOut = order.subtotal;
      let totalAmountOut = order.totalAmount;
      let taxAmountOut = order.taxAmount;
      if (itemsWithPhotos.length > 0 && itemsWithPhotos.every((item) => isDigitalDownloadItem(item))) {
        shippingCostOut = 0;
        subtotalOut = itemsWithPhotos.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
        taxAmountOut = Number(order.taxAmount) || 0;
        totalAmountOut = +(subtotalOut + shippingCostOut + taxAmountOut).toFixed(2);
      }
      parsedOrders.push({
        ...order,
        status: order.status || 'Pending',
        isBatch: Boolean(order.isBatch),
        labSubmitted: Boolean(order.labSubmitted),
        shippingAddress: safeJsonParse(order.shippingAddress),
        batchShippingAddress: safeJsonParse(order.batchShippingAddress),
        batchReadyDate: order.batchReadyDate,
        batchQueueStatus: order.batchQueueStatus,
        batchLabVendor: order.batchLabVendor,
        labSubmittedAt: order.labSubmittedAt,
        whccConfirmationId: canViewWhccFields ? order.whccConfirmationId : undefined,
        whccImportResponse: canViewWhccFields ? safeJsonParse(order.whccImportResponse) : undefined,
        whccSubmitResponse: canViewWhccFields ? safeJsonParse(order.whccSubmitResponse) : undefined,
        whccRequestLog: canViewWhccFields ? safeJsonParse(order.whccRequestLog) : undefined,
        whccLastError: canViewWhccFields ? safeJsonParse(order.whccLastError) : undefined,
        whccOrderNumber: canViewWhccFields ? order.whccOrderNumber : undefined,
        whccWebhookStatus: canViewWhccFields ? order.whccWebhookStatus : undefined,
        whccWebhookEvent: canViewWhccFields ? order.whccWebhookEvent : undefined,
        shippingCarrier: canViewWhccFields ? order.shippingCarrier : undefined,
        trackingNumber: canViewWhccFields ? order.trackingNumber : undefined,
        trackingUrl: canViewWhccFields ? order.trackingUrl : undefined,
        shippedAt: canViewWhccFields ? order.shippedAt : undefined,
        items: itemsWithPhotos,
        shippingCost: shippingCostOut,
        subtotal: subtotalOut,
        totalAmount: totalAmountOut,
        taxAmount: taxAmountOut,
        // excludedItemsNote removed to fix ReferenceError
      });
    }
    res.json(parsedOrders);
  } catch (error) {
    console.error('[GET /api/orders] Error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

router.get('/details/:orderId', async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) {
      return res.status(400).json({ error: 'Valid orderId is required' });
    }

    const userId = req.user.id;
    const actingStudioId = req.headers['x-acting-studio-id'];
    let order;

    if (actingStudioId) {
      order = await queryRow(
        `SELECT o.id,
                o.user_id as userId,
                o.total as totalAmount,
                o.subtotal,
                o.tax_amount as taxAmount,
                o.tax_rate as taxRate,
                o.status,
                o.shipping_address as shippingAddress,
                o.shipping_option as shippingOption,
                o.shipping_cost as shippingCost,
                o.is_batch as isBatch,
                o.batch_shipping_address as batchShippingAddress,
                o.batch_ready_date as batchReadyDate,
                o.batch_queue_status as batchQueueStatus,
                o.batch_lab_vendor as batchLabVendor,
                o.lab_submitted as labSubmitted,
                o.lab_submitted_at as labSubmittedAt,
                o.stripe_fee_amount as stripeFeeAmount,
                o.payment_intent_id as paymentIntentId,
                o.customer_receipt_sent_at as customerReceiptSentAt,
                o.studio_receipt_sent_at as studioReceiptSentAt,
                o.created_at as orderDate
         FROM orders o
         WHERE o.id = $1
           AND o.studio_id = $2`,
        [orderId, actingStudioId]
      );
    } else {
      order = await queryRow(
        `SELECT o.id,
                o.user_id as userId,
                o.total as totalAmount,
                o.subtotal,
                o.tax_amount as taxAmount,
                o.tax_rate as taxRate,
                o.status,
                o.shipping_address as shippingAddress,
                o.shipping_option as shippingOption,
                o.shipping_cost as shippingCost,
                o.is_batch as isBatch,
                o.batch_shipping_address as batchShippingAddress,
                o.batch_ready_date as batchReadyDate,
                o.batch_queue_status as batchQueueStatus,
                o.batch_lab_vendor as batchLabVendor,
                o.lab_submitted as labSubmitted,
                o.lab_submitted_at as labSubmittedAt,
                o.stripe_fee_amount as stripeFeeAmount,
                o.payment_intent_id as paymentIntentId,
                o.customer_receipt_sent_at as customerReceiptSentAt,
                o.studio_receipt_sent_at as studioReceiptSentAt,
                o.created_at as orderDate
         FROM orders o
         WHERE o.id = $1
           AND o.user_id = $2`,
        [orderId, userId]
      );
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await queryRows(
      `SELECT id, photo_id as photoId, photo_ids as photoIds, product_id as productId,
              product_size_id as productSizeId, quantity, price, crop_data as cropData,
              digital_download_scope as digitalDownloadScope,
              studio_revenue_amount as studioRevenueAmount,
              base_revenue_amount as baseRevenueAmount,
              production_cost_amount as productionCostAmount,
              studio_payout_amount as studioPayoutAmount,
              super_admin_share_amount as superAdminShareAmount,
              stripe_fee_allocated_amount as stripeFeeAllocatedAmount,
              studio_net_payout_amount as studioNetPayoutAmount,
              attributes
       FROM order_items WHERE order_id = $1`,
      [order.id]
    );

    const itemsWithPhotos = [];
    for (const item of items) {
      const photo = await queryRow(
        `SELECT id, album_id as albumId, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl, width, height
         FROM photos WHERE id = $1`,
        [item.photoId]
      );
      let unitCost = 0;
      let productName = null;
      let productSizeName = null;
      if (item.productSizeId) {
        const size = await queryRow(
          `SELECT ps.price, ps.size_name as sizeName, p.name as productName, p.id as productId
           FROM product_sizes ps
           LEFT JOIN products p ON p.id = ps.product_id
           WHERE ps.id = $1`,
          [item.productSizeId]
        );
        unitCost = Number(size?.price) || 0;
        productSizeName = size?.sizeName || null;
        productName = size?.productName || null;
        item.productId = size?.productId || item.productId;
      } else if (item.productId) {
          const product = await queryRow(
            `SELECT p.price, p.name FROM products p WHERE p.id = $1`,
            [item.productId]
          );
        unitCost = Number(product?.price) || 0;
        productName = product?.name || null;
      }

      // --- Attribute UID to Name Mapping ---
      // 1. Get album for this photo
      let album = null;
      if (item.photoId) {
        const photoRow = await queryRow('SELECT album_id FROM photos WHERE id = $1', [item.photoId]);
        if (photoRow?.album_id) {
          album = await queryRow('SELECT price_list_id FROM albums WHERE id = $1', [photoRow.album_id]);
        }
      }
      let priceListId = album?.price_list_id || null;
      let attributeIdToName = {};
      if (priceListId && item.productSizeId) {
        // Load whccAttributeCategories for this product/size from the price list
        const priceListItems = await queryRows(
          `SELECT spi.product_size_id, sspi.whcc_attribute_categories
           FROM studio_price_list_items spi
           JOIN super_price_list_items sspi ON sspi.product_size_id = spi.product_size_id AND sspi.super_price_list_id = (SELECT super_price_list_id FROM studio_price_lists WHERE id = $1)
           WHERE spi.studio_price_list_id = $1 AND spi.product_size_id = $2`,
          [priceListId, item.productSizeId]
        );
        for (const pli of priceListItems) {
          let categories = [];
          try {
            categories = JSON.parse(pli.whcc_attribute_categories || '[]');
          } catch { categories = []; }
          for (const cat of categories) {
            if (Array.isArray(cat.attributes)) {
              for (const attr of cat.attributes) {
                if (attr.uid && attr.name) attributeIdToName[attr.uid] = attr.name;
              }
            }
          }
        }
      }
      // Parse attributes and map UIDs to names
      let parsedAttributes = safeJsonParse(item.attributes);
      if (parsedAttributes == null) {
        parsedAttributes = [];
      } else if (typeof parsedAttributes === 'string' && parsedAttributes.trim() !== '') {
        parsedAttributes = [parsedAttributes];
      } else if (Array.isArray(parsedAttributes)) {
        parsedAttributes = parsedAttributes.filter((a) => typeof a === 'string' || typeof a === 'number');
      } else {
        parsedAttributes = [];
      }
      // Map UIDs to names, fallback to UID if no name found
      const mappedAttributes = parsedAttributes.map((uid) => attributeIdToName[uid] || String(uid));

      itemsWithPhotos.push({
        ...item,
        price: item.price || 0,
        cost: unitCost,
        digitalDownloadScope: item.digitalDownloadScope || null,
        studioRevenueAmount: Number(item.studioRevenueAmount) || 0,
        baseRevenueAmount: Number(item.baseRevenueAmount) || 0,
        productionCostAmount: Number(item.productionCostAmount) || 0,
        studioPayoutAmount: Number(item.studioPayoutAmount) || 0,
        superAdminShareAmount: Number(item.superAdminShareAmount) || 0,
        stripeFeeAllocatedAmount: Number(item.stripeFeeAllocatedAmount) || 0,
        studioNetPayoutAmount: Number(item.studioNetPayoutAmount) || 0,
        productName,
        productSizeName,
        cropData: safeJsonParse(item.cropData),
        photoIds: safeJsonParse(item.photoIds, item.photoId ? [item.photoId] : []),
        attributes: mappedAttributes,
        photo: photo ? {
          id: photo.id,
          albumId: photo.albumId,
          fileName: photo.filename ?? photo.fileName,
          width: photo.width || null,
          height: photo.height || null,
          thumbnailUrl: `/api/photos/${photo.id}/asset?variant=thumbnail`,
          url: `/api/photos/${photo.id}/asset?variant=full`,
        } : {
          id: item.photoId,
          albumId: 0,
          fileName: `Photo #${item.photoId}`,
          width: null,
          height: null,
          thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
          url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
        },
      });
    }

    // Add digital item flags for admin UI
    const digitalItems = itemsWithPhotos.filter((item) => isDigitalDownloadItem(item));
    // If all items are digital, recalculate all amounts
    let shippingCostOut = order.shippingCost;
    let subtotalOut = order.subtotal;
    let totalAmountOut = order.totalAmount;
    let taxAmountOut = order.taxAmount;
    if (itemsWithPhotos.length > 0 && itemsWithPhotos.every((item) => {
      const options = (() => {
        try {
          return typeof item.productOptions === 'string' ? JSON.parse(item.productOptions) : (item.productOptions || {});
        } catch { return {}; }
      })();
      const category = String(item.productCategory || '').toLowerCase();
      const name = String(item.productName || '').toLowerCase();
      return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
    })) {
      shippingCostOut = 0;
      subtotalOut = itemsWithPhotos.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
      taxAmountOut = Number(order.taxAmount) || 0;
      totalAmountOut = +(subtotalOut + shippingCostOut + taxAmountOut).toFixed(2);
    }
    return res.json({
      ...order,
      status: order.status || 'Pending',
      isBatch: Boolean(order.isBatch),
      labSubmitted: Boolean(order.labSubmitted),
      shippingAddress: safeJsonParse(order.shippingAddress),
      batchShippingAddress: safeJsonParse(order.batchShippingAddress),
      batchReadyDate: order.batchReadyDate,
      batchQueueStatus: order.batchQueueStatus,
      batchLabVendor: order.batchLabVendor,
      labSubmittedAt: order.labSubmittedAt,
      whccConfirmationId: canViewWhccFields ? order.whccConfirmationId : undefined,
      whccImportResponse: canViewWhccFields ? safeJsonParse(order.whccImportResponse) : undefined,
      whccSubmitResponse: canViewWhccFields ? safeJsonParse(order.whccSubmitResponse) : undefined,
      whccRequestLog: canViewWhccFields ? safeJsonParse(order.whccRequestLog) : undefined,
      whccLastError: canViewWhccFields ? safeJsonParse(order.whccLastError) : undefined,
      whccOrderNumber: canViewWhccFields ? order.whccOrderNumber : undefined,
      whccWebhookStatus: canViewWhccFields ? order.whccWebhookStatus : undefined,
      whccWebhookEvent: canViewWhccFields ? order.whccWebhookEvent : undefined,
      shippingCarrier: canViewWhccFields ? order.shippingCarrier : undefined,
      trackingNumber: canViewWhccFields ? order.trackingNumber : undefined,
      trackingUrl: canViewWhccFields ? order.trackingUrl : undefined,
      shippedAt: canViewWhccFields ? order.shippedAt : undefined,
      hasDigitalItems: digitalItems.length > 0,
      digitalItemCount: digitalItems.length,
      items: itemsWithPhotos,
      shippingCost: shippingCostOut,
      subtotal: subtotalOut,
      totalAmount: totalAmountOut,
      taxAmount: taxAmountOut,
      // excludedItemsNote removed to fix ReferenceError
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Get all orders (admin view)
router.get('/admin/all-orders', adminRequired, async (req, res) => {
  try {
    const actingStudioId = req.headers['x-acting-studio-id'];
    const canViewWhccFields = req.user.role === 'super_admin' || req.user.role === 'studio_admin' || req.user.role === 'admin';
    const includeItems = String(req.query.includeItems || '').toLowerCase() === '1' || String(req.query.includeItems || '').toLowerCase() === 'true';
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 500)
      : 200;
    let queryText = `
      SELECT TOP ${limit}
        o.id, 
        o.user_id as userId, 
        o.total as totalAmount,
        o.subtotal,
        o.tax_amount as taxAmount,
        o.tax_rate as taxRate,
        o.status,
        o.shipping_address as shippingAddress,
        o.shipping_option as shippingOption,
        o.shipping_cost as shippingCost,
        o.is_batch as isBatch,
        o.batch_shipping_address as batchShippingAddress,
        o.batch_ready_date as batchReadyDate,
        o.batch_queue_status as batchQueueStatus,
        o.batch_lab_vendor as batchLabVendor,
        o.lab_submitted as labSubmitted,
        o.lab_submitted_at as labSubmittedAt,
        o.stripe_fee_amount as stripeFeeAmount,
        o.payment_intent_id as paymentIntentId,
        o.customer_receipt_sent_at as customerReceiptSentAt,
        o.studio_receipt_sent_at as studioReceiptSentAt,
        ${canViewWhccFields ? `o.whcc_confirmation_id as whccConfirmationId,
        o.whcc_import_response as whccImportResponse,
        o.whcc_submit_response as whccSubmitResponse,
        o.whcc_request_log as whccRequestLog,
        o.whcc_last_error as whccLastError,
        o.whcc_order_number as whccOrderNumber,
        o.whcc_webhook_status as whccWebhookStatus,
        o.whcc_webhook_event as whccWebhookEvent,
        o.shipping_carrier as shippingCarrier,
        o.tracking_number as trackingNumber,
        o.tracking_url as trackingUrl,
        o.shipped_at as shippedAt,` : ''}
        o.created_at as orderDate
      FROM orders o
    `;
    const params = [];
    if (actingStudioId) {
      queryText += ` WHERE o.studio_id = $1`;
      params.push(actingStudioId);
    } else if (req.user.role === 'studio_admin') {
      queryText += ` WHERE o.user_id IN (SELECT u.id FROM users u WHERE u.studio_id = $1)`;
      params.push(req.user.studio_id);
    }
    queryText += ` ORDER BY o.created_at DESC`;

    const orders = await queryRows(queryText, params);
    
    const parsedOrders = [];
    for (const order of orders) {
      let itemsWithPhotos = [];
      let excludedCount = 0;

      if (includeItems) {
        const items = await queryRows(
              `SELECT oi.id as id,
              oi.photo_id as photoId,
              oi.photo_ids as photoIds,
              oi.product_id as productId,
              oi.product_size_id as productSizeId,
              oi.digital_download_scope as digitalDownloadScope,
              oi.source_album_id as sourceAlbumId,
              oi.quantity,
              oi.price as price,
              oi.crop_data as cropData,
              oi.product_options_snapshot as productOptionsSnapshot,
              p.name as productName,
              p.category as productCategory,
              p.options as productOptions,
              ps.size_name as productSizeName,
              COALESCE(ps.price, p.price, 0) as basePrice,
              COALESCE(ps.cost, p.cost, 0) as cost,
              oi.studio_payout_amount as studioPayoutAmount,
              oi.super_admin_share_amount as superAdminShareAmount,
              oi.stripe_fee_allocated_amount as stripeFeeAllocatedAmount,
              oi.studio_net_payout_amount as studioNetPayoutAmount,
              attributes
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       LEFT JOIN photos ph ON ph.id = oi.photo_id
       WHERE oi.order_id = $1`,
          [order.id]
        );

        for (const item of items) {
          // Exclude if productName is null or 'Unknown Product'
          if (!item.productName || item.productName === 'Unknown Product') {
            excludedCount += 1;
            continue;
          }
          const photo = await queryRow(
            `SELECT id, album_id as albumId, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl, width, height
             FROM photos WHERE id = $1`,
            [item.photoId]
          );
          itemsWithPhotos.push({
            ...item,
            price: item.price || 0,
            basePrice: Number(item.basePrice) || 0,
            labCost: Number(item.labCost) || 0,
            digitalDownloadScope: item.digitalDownloadScope || null,
            studioRevenueAmount: Number(item.studioRevenueAmount) || 0,
            baseRevenueAmount: Number(item.baseRevenueAmount) || 0,
            productionCostAmount: Number(item.productionCostAmount) || 0,
            studioPayoutAmount: Number(item.studioPayoutAmount) || 0,
            superAdminShareAmount: Number(item.superAdminShareAmount) || 0,
            stripeFeeAllocatedAmount: Number(item.stripeFeeAllocatedAmount) || 0,
            studioNetPayoutAmount: Number(item.studioNetPayoutAmount) || 0,
            productName: item.productName || (item.productId ? `Product #${item.productId}` : 'Unknown Product'),
            productSizeName: item.productSizeName || undefined,
            cropData: safeJsonParse(item.cropData),
            photoIds: safeJsonParse(item.photoIds, item.photoId ? [item.photoId] : []),
            photo: photo ? {
              id: photo.id,
              albumId: photo.albumId,
              fileName: photo.filename ?? photo.fileName,
              width: photo.width || null,
              height: photo.height || null,
              thumbnailUrl: `/api/photos/${photo.id}/asset?variant=thumbnail`,
              fullImageUrl: `/api/photos/${photo.id}/asset?variant=full`,
            } : {
              id: item.photoId,
              albumId: 0,
              fileName: `Photo #${item.photoId}`,
              width: null,
              height: null,
              thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
              fullImageUrl: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
            },
          });
        }
      }

      // If all items are digital, recalculate all amounts
      let shippingCostOut = order.shippingCost;
      let subtotalOut = order.subtotal;
      let totalAmountOut = order.totalAmount;
      let taxAmountOut = order.taxAmount;
      if (itemsWithPhotos.length > 0 && itemsWithPhotos.every((item) => {
        const options = (() => {
          try {
            return typeof item.productOptions === 'string' ? JSON.parse(item.productOptions) : (item.productOptions || {});
          } catch { return {}; }
        })();
        const category = String(item.productCategory || '').toLowerCase();
        const name = String(item.productName || '').toLowerCase();
        return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
      })) {
        shippingCostOut = 0;
        subtotalOut = itemsWithPhotos.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
        taxAmountOut = Number(order.taxAmount) || 0;
        totalAmountOut = +(subtotalOut + shippingCostOut + taxAmountOut).toFixed(2);
      }
      parsedOrders.push({
        ...order,
        status: order.status || 'Pending',
        isBatch: Boolean(order.isBatch),
        labSubmitted: Boolean(order.labSubmitted),
        shippingAddress: safeJsonParse(order.shippingAddress),
        batchShippingAddress: safeJsonParse(order.batchShippingAddress),
        batchReadyDate: order.batchReadyDate,
        batchQueueStatus: order.batchQueueStatus,
        batchLabVendor: order.batchLabVendor,
        labSubmittedAt: order.labSubmittedAt,
        whccConfirmationId: canViewWhccFields ? order.whccConfirmationId : undefined,
        whccImportResponse: canViewWhccFields ? safeJsonParse(order.whccImportResponse) : undefined,
        whccSubmitResponse: canViewWhccFields ? safeJsonParse(order.whccSubmitResponse) : undefined,
        whccRequestLog: canViewWhccFields ? safeJsonParse(order.whccRequestLog) : undefined,
        whccLastError: canViewWhccFields ? safeJsonParse(order.whccLastError) : undefined,
        whccOrderNumber: canViewWhccFields ? order.whccOrderNumber : undefined,
        whccWebhookStatus: canViewWhccFields ? order.whccWebhookStatus : undefined,
        whccWebhookEvent: canViewWhccFields ? order.whccWebhookEvent : undefined,
        shippingCarrier: canViewWhccFields ? order.shippingCarrier : undefined,
        trackingNumber: canViewWhccFields ? order.trackingNumber : undefined,
        trackingUrl: canViewWhccFields ? order.trackingUrl : undefined,
        shippedAt: canViewWhccFields ? order.shippedAt : undefined,
        items: itemsWithPhotos,
        shippingCost: shippingCostOut,
        subtotal: subtotalOut,
        totalAmount: totalAmountOut,
        taxAmount: taxAmountOut,
        excludedItemsNote: includeItems && excludedCount > 0 ? `${excludedCount} product(s) with amount were excluded from profit calculations because they are not linked to a valid product.` : undefined,
      });
    }
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/admin/order-details/:orderId', adminRequired, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    console.log('[ADMIN ORDER DETAILS] Endpoint hit for orderId:', orderId, 'user:', req.user?.id, 'role:', req.user?.role);
    if (!orderId) {
      console.log('[ADMIN ORDER DETAILS] Invalid orderId:', req.params.orderId);
      return res.status(400).json({ error: 'Valid orderId is required' });
    }

    const actingStudioId = req.headers['x-acting-studio-id'];
    const canViewWhccFields = req.user.role === 'super_admin' || req.user.role === 'studio_admin' || req.user.role === 'admin';
    let queryText = `
      SELECT
        o.id,
        o.user_id as userId,
        o.total as totalAmount,
        o.subtotal,
        o.tax_amount as taxAmount,
        o.tax_rate as taxRate,
        o.status,
        o.shipping_address as shippingAddress,
        o.shipping_option as shippingOption,
        o.shipping_cost as shippingCost,
        o.is_batch as isBatch,
        o.batch_shipping_address as batchShippingAddress,
        o.batch_ready_date as batchReadyDate,
        o.batch_queue_status as batchQueueStatus,
        o.batch_lab_vendor as batchLabVendor,
        o.lab_submitted as labSubmitted,
        o.lab_submitted_at as labSubmittedAt,
        o.stripe_fee_amount as stripeFeeAmount,
        o.payment_intent_id as paymentIntentId,
        o.customer_receipt_sent_at as customerReceiptSentAt,
        o.studio_receipt_sent_at as studioReceiptSentAt,
        ${canViewWhccFields ? `o.whcc_confirmation_id as whccConfirmationId,
        o.whcc_import_response as whccImportResponse,
        o.whcc_submit_response as whccSubmitResponse,
        o.whcc_request_log as whccRequestLog,
        o.whcc_last_error as whccLastError,
        o.whcc_order_number as whccOrderNumber,
        o.whcc_webhook_status as whccWebhookStatus,
        o.whcc_webhook_event as whccWebhookEvent,
        o.shipping_carrier as shippingCarrier,
        o.tracking_number as trackingNumber,
        o.tracking_url as trackingUrl,
        o.shipped_at as shippedAt,` : ''}
        o.created_at as orderDate
      FROM orders o
      WHERE o.id = $1
    `;
    const params = [orderId];

    if (actingStudioId) {
      queryText += ` AND o.studio_id = $2`;
      params.push(actingStudioId);
    } else if (req.user.role === 'studio_admin') {
      queryText += ` AND o.user_id IN (SELECT u.id FROM users u WHERE u.studio_id = $2)`;
      params.push(req.user.studio_id);
    }


    const order = await queryRow(queryText, params);
    if (!order) {
      console.log('[ADMIN ORDER DETAILS] Order not found for orderId:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }


    const items = await queryRows(
      `SELECT oi.id,
              oi.photo_id as photoId,
              oi.photo_ids as photoIds,
              oi.product_id as productId,
              oi.product_size_id as productSizeId,
              oi.digital_download_scope as digitalDownloadScope,
              oi.source_album_id as sourceAlbumId,
              oi.quantity,
              oi.price as price,
              oi.crop_data as cropData,
              oi.product_options_snapshot as productOptionsSnapshot,
              p.name as productName,
              p.category as productCategory,
              p.options as productOptions,
              ps.size_name as productSizeName,
              COALESCE(ps.price, p.price, 0) as basePrice,
              COALESCE(ps.cost, p.cost, 0) as cost,
              oi.studio_payout_amount as studioPayoutAmount,
              oi.super_admin_share_amount as superAdminShareAmount,
              oi.stripe_fee_allocated_amount as stripeFeeAllocatedAmount,
              oi.studio_net_payout_amount as studioNetPayoutAmount,
              attributes
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       LEFT JOIN photos ph ON ph.id = oi.photo_id
       WHERE oi.order_id = $1`,
      [order.id]
    );
    console.log('ADMIN ORDER DETAILS: items for orderId', order.id);
    console.log(items);

    const photoIds = [...new Set(items.map((item) => Number(item.photoId)).filter(Boolean))];
    let photosById = new Map();
    if (photoIds.length > 0) {
      const placeholders = photoIds.map((_, index) => `$${index + 1}`).join(',');
      const photos = await queryRows(
        `SELECT id, album_id as albumId, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl, width, height
         FROM photos
         WHERE id IN (${placeholders})`,
        photoIds
      );
      photosById = new Map(photos.map((photo) => [Number(photo.id), photo]));
    }

    const itemsWithPhotos = items.map((item) => {
      const photo = photosById.get(Number(item.photoId));
      const resolvedDigitalScope = hasExplicitDigitalDownloadScope(item)
        ? resolveDigitalDownloadScope({ item })
        : null;
      const isDigital = isDigitalDownloadItem(item);
      return {
        ...item,
        isDigital,
        digitalDownloadScope: resolvedDigitalScope,
        sourceAlbumId: resolveDigitalSourceAlbumId({ item }),
        price: item.price || 0,
        basePrice: Number(item.basePrice) || 0,
        labCost: Number(item.labCost) || 0,
        productName: item.productName || (item.productId ? `Product #${item.productId}` : 'Unknown Product'),
        productSizeName: item.productSizeName || undefined,
        cropData: safeJsonParse(item.cropData),
        photoIds: safeJsonParse(item.photoIds, item.photoId ? [item.photoId] : []),
        photo: photo ? {
          id: photo.id,
          albumId: photo.albumId,
          fileName: photo.filename ?? photo.fileName,
          width: photo.width || null,
          height: photo.height || null,
          thumbnailUrl: `/api/photos/${photo.id}/asset?variant=thumbnail`,
          fullImageUrl: `/api/photos/${photo.id}/asset?variant=full`,
        } : {
          id: item.photoId,
          albumId: 0,
          fileName: `Photo #${item.photoId}`,
          width: null,
          height: null,
          thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
          fullImageUrl: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
        },
      };
    });

    const digitalItems = itemsWithPhotos.filter((item) => item.isDigital || Boolean(item.digitalDownloadScope));

    // If all items are digital, recalculate all amounts
    let shippingCostOut = order.shippingCost;
    let subtotalOut = order.subtotal;
    let totalAmountOut = order.totalAmount;
    let taxAmountOut = order.taxAmount;
    if (itemsWithPhotos.length > 0 && itemsWithPhotos.every((item) => item.isDigital)) {
      shippingCostOut = 0;
      subtotalOut = itemsWithPhotos.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
      taxAmountOut = Number(order.taxAmount) || 0;
      totalAmountOut = +(subtotalOut + shippingCostOut + taxAmountOut).toFixed(2);
    }

    res.json({
      ...order,
      status: order.status || 'Pending',
      isBatch: Boolean(order.isBatch),
      labSubmitted: Boolean(order.labSubmitted),
      shippingAddress: safeJsonParse(order.shippingAddress),
      batchShippingAddress: safeJsonParse(order.batchShippingAddress),
      batchReadyDate: order.batchReadyDate,
      batchQueueStatus: order.batchQueueStatus,
      batchLabVendor: order.batchLabVendor,
      labSubmittedAt: order.labSubmittedAt,
      whccConfirmationId: canViewWhccFields ? order.whccConfirmationId : undefined,
      whccImportResponse: canViewWhccFields ? safeJsonParse(order.whccImportResponse) : undefined,
      whccSubmitResponse: canViewWhccFields ? safeJsonParse(order.whccSubmitResponse) : undefined,
      whccRequestLog: canViewWhccFields ? safeJsonParse(order.whccRequestLog) : undefined,
      whccLastError: canViewWhccFields ? safeJsonParse(order.whccLastError) : undefined,
      whccOrderNumber: canViewWhccFields ? order.whccOrderNumber : undefined,
      whccWebhookStatus: canViewWhccFields ? order.whccWebhookStatus : undefined,
      whccWebhookEvent: canViewWhccFields ? order.whccWebhookEvent : undefined,
      shippingCarrier: canViewWhccFields ? order.shippingCarrier : undefined,
      trackingNumber: canViewWhccFields ? order.trackingNumber : undefined,
      trackingUrl: canViewWhccFields ? order.trackingUrl : undefined,
      shippedAt: canViewWhccFields ? order.shippedAt : undefined,
      hasDigitalItems: digitalItems.length > 0,
      digitalItemCount: digitalItems.length,
      items: itemsWithPhotos,
      shippingCost: shippingCostOut,
      subtotal: subtotalOut,
      totalAmount: totalAmountOut,
      taxAmount: taxAmountOut,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retry WHCC submission for a failed order
router.post('/admin/whcc-retry/:orderId', superAdminRequired, handleWhccRetryRequest);
router.post('/admin/:orderId/whcc-retry', superAdminRequired, handleWhccRetryRequest);

// Update order status (admin)
router.patch('/admin/:orderId/status', adminRequired, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { status, cancelReason, refund } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({ error: 'orderId and status are required' });
    }

    const allowedStatuses = ['pending', 'processing', 'completed', 'shipped', 'cancelled', 'waiting'];
    if (!allowedStatuses.includes(String(status).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    // Fetch order details for validation and refund

    // Fetch order and join user email if order.email is null
    let order = await queryRow(
      `SELECT o.id, o.user_id as userId, o.status, o.total_amount as totalAmount, o.payment_intent_id as paymentIntentId, o.stripe_charge_id as stripeChargeId, o.email, o.studio_id as studioId
       FROM orders o
       WHERE o.id = $1`,
      [orderId]
    );
    if (order && !order.email) {
      // Fallback: fetch user email
      const user = await queryRow(
        'SELECT email FROM users WHERE id = $1',
        [order.userId]
      );
      if (user && user.email) {
        order.email = user.email;
      }
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (req.user.role === 'studio_admin') {
      const user = await queryRow(
        `SELECT studio_id as studioId FROM users WHERE id = $1`,
        [order.userId]
      );
      if (!user || user.studioId !== req.user.studio_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Only allow cancellation if not already cancelled or shipped/completed
    if (String(status).toLowerCase() === 'cancelled') {
      // Treat 'waiting' as a cancellable state (like 'pending')
      const nonCancellable = ['cancelled', 'shipped', 'completed'];
      const orderStatus = String(order.status).toLowerCase();
      console.log('[CANCEL DEBUG] Order #', orderId, 'status from DB:', JSON.stringify(order.status));
      if (nonCancellable.includes(orderStatus)) {
        return res.status(400).json({ error: 'Order cannot be cancelled in its current state.' });
      }
      // If status is 'waiting', allow cancellation (treat as 'pending')
      if (!cancelReason || typeof cancelReason !== 'string' || cancelReason.length < 3) {
        return res.status(400).json({ error: 'Cancel reason is required.' });
      }

      // Refund via Stripe if requested and payment exists
      let refundStatus = null;
      let refundId = null;
      let refundError = null;
      if (refund && order.paymentIntentId) {
        try {
          const stripe = await getConfiguredStripeClient();
          if (!stripe) throw new Error('Stripe not configured');
          // Find the charge to refund
          let chargeId = order.stripeChargeId;
          if (!chargeId) {
            // Try to get from payment intent
            const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge'] });
            chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
          }
          if (!chargeId) throw new Error('No Stripe charge found for refund');
          const refundObj = await stripe.refunds.create({ charge: chargeId, reason: 'requested_by_customer' });
          refundStatus = refundObj.status;
          refundId = refundObj.id;
        } catch (err) {
          refundStatus = 'failed';
          refundError = err?.message || String(err);
        }
      }

      // Update order with cancel info
      await query(
        `UPDATE orders
         SET status = 'cancelled', cancel_reason = $1, cancel_by = $2, cancel_at = CURRENT_TIMESTAMP, refund_status = $3, refund_id = $4
         WHERE id = $5`,
        [cancelReason, req.user.id, refundStatus, refundId, orderId]
      );

      // Insert audit log
      await query(
        `INSERT INTO order_cancellation_audit (order_id, cancelled_by, cancelled_at, reason, refund_status, refund_id, refund_error)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6)`,
        [orderId, req.user.id, cancelReason, refundStatus, refundId, refundError]
      );

      // Send cancellation email to customer

      let studioEmail = null;
      try {
        // Fetch order items for email
        const items = await queryRows(
          `SELECT oi.id, oi.photo_id as photoId, oi.product_id as productId, oi.product_size_id as productSizeId, oi.quantity, oi.price as price, oi.crop_data as cropData, p.name as productName, ps.size_name as productSizeName, a.studio_id as studioId
           FROM order_items oi
           LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
           LEFT JOIN products p ON p.id = COALESCE(oi.product_id, ps.product_id)
           LEFT JOIN photos ph ON ph.id = oi.photo_id
           LEFT JOIN albums a ON a.id = ph.album_id
           WHERE oi.order_id = $1`,
          [orderId]
        );
        if (items && items.length > 0 && items[0].studioId) {
          const studio = await queryRow('SELECT email FROM studios WHERE id = $1', [items[0].studioId]);
          if (studio && studio.email) studioEmail = studio.email;
        }
        const { sendOrderCancellationEmail } = await import('../services/orderReceiptService.js');
        console.log('[CANCEL EMAIL] Attempting to send cancellation email to:', order.email, 'for order:', orderId, 'reason:', cancelReason);
        const emailResult = await sendOrderCancellationEmail({
          to: order.email,
          customerName: '',
          order: { ...order, status: 'cancelled' },
          items,
          cancelReason,
          replyTo: studioEmail
        });
        console.log('[CANCEL EMAIL] sendOrderCancellationEmail result:', emailResult);
      } catch (emailErr) {
        // Log but do not fail
        console.error('Failed to send cancellation email:', emailErr);
      }

      return res.json({ success: true, cancelled: true, refundStatus, refundId, refundError });
    } else {
      // For other status updates, just update status
      await query(
        `UPDATE orders
         SET status = $1
         WHERE id = $2`,
        [status, orderId]
      );
      return res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit batch orders to lab (admin)
router.post('/admin/submit-batch', adminRequired, async (req, res) => {
  try {
    const { orderIds, batchAddress, selectedLab, specialInstructions } = req.body;
    const trimmedSpecialInstructions = String(specialInstructions || '').trim();

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds must be a non-empty array' });
    }

    const accessStudioId = resolveOrderAccessStudioId(req);
    const configuredLab = await resolveConfiguredLabVendor(accessStudioId);
    const effectiveSelectedLab = String(selectedLab || configuredLab || 'whcc').toLowerCase();

    if (
      !batchAddress ||
      !batchAddress.fullName ||
      !batchAddress.addressLine1 ||
      !batchAddress.city ||
      !batchAddress.state ||
      !batchAddress.zipCode ||
      !batchAddress.email
    ) {
      return res.status(400).json({ error: 'Valid batchAddress is required' });
    }

    const ids = orderIds.map((id) => Number(id)).filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid order IDs provided' });
    }

    if (trimmedSpecialInstructions.length > 500) {
      return res.status(400).json({ error: 'Special instructions must be 500 characters or fewer' });
    }

    let updatedCount = 0;
    let notReadyCount = 0;
    let failedCount = 0;
    const now = new Date();
    const eligibleIds = [];

    for (const orderId of ids) {
      const order = await queryRow(
        `SELECT o.id, o.user_id as userId, o.is_batch as isBatch, o.lab_submitted as labSubmitted
         FROM orders o
         WHERE o.id = $1`,
        [orderId]
      );

      if (!order || !order.isBatch || order.labSubmitted) continue;

      // PATCH: Ignore batchReadyDate for eligibility

      if (req.user.role === 'studio_admin') {
        const user = await queryRow(
          `SELECT studio_id as studioId FROM users WHERE id = $1`,
          [order.userId]
        );

        if (!user || user.studioId !== req.user.studio_id) {
          continue;
        }
      }

      eligibleIds.push(orderId);
    }

    if (effectiveSelectedLab === 'whcc') {
      if (eligibleIds.length > 0) {
        const whccPlaceholders = eligibleIds.map((_, index) => `$${index + 2}`).join(',');
        await query(
          `UPDATE orders
           SET batch_shipping_address = $1,
               batch_lab_vendor = 'whcc',
               batch_queue_status = 'submitting',
               status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END,
               whcc_last_error = NULL
           WHERE id IN (${whccPlaceholders})`,
          [JSON.stringify(batchAddress), ...eligibleIds]
        );

        try {
          await submitOrderToWhcc(eligibleIds[0], {
            allowBatch: true,
            shippingAddressOverride: batchAddress,
            aggregateOrderIds: eligibleIds,
            specialInstructions: trimmedSpecialInstructions,
          });
        } catch (error) {
          // Ignore here; failed statuses are persisted by submitOrderToWhcc and counted below.
        }

        const submittedRows = await queryRows(
          `SELECT id, lab_submitted as labSubmitted
           FROM orders
           WHERE id IN (${eligibleIds.map((_, index) => `$${index + 1}`).join(',')})`,
          eligibleIds
        );

        const submittedMap = new Map(submittedRows.map((row) => [row.id, Boolean(row.labSubmitted)]));
        for (const orderId of eligibleIds) {
          if (submittedMap.get(orderId)) {
            updatedCount += 1;
          } else {
            failedCount += 1;
          }
        }
      }
    } else {
      for (const orderId of eligibleIds) {
        await query(
          `UPDATE orders
           SET lab_submitted = 1,
               lab_submitted_at = CURRENT_TIMESTAMP,
               batch_shipping_address = $2,
               batch_lab_vendor = $3,
               batch_queue_status = 'submitted',
               status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END
           WHERE id = $1`,
          [orderId, JSON.stringify(batchAddress), effectiveSelectedLab]
        );

        updatedCount += 1;
      }
    }

    if (updatedCount > 0 && accessStudioId) {
      await query(
        `IF EXISTS (SELECT 1 FROM shipping_config WHERE id = $1)
         BEGIN
           UPDATE shipping_config
           SET is_active = 0,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
         END
         ELSE
         BEGIN
           INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active, batch_shipping_address)
           VALUES ($1, '2099-12-31T23:59:59Z', 10.00, 0, NULL)
         END`,
        [accessStudioId]
      );
    }

    res.json({ success: true, selectedLab: effectiveSelectedLab, updatedCount, notReadyCount, failedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get batch queue summary (admin)
router.get('/admin/batch-queue', adminRequired, async (req, res) => {
  try {
    const accessStudioId = resolveOrderAccessStudioId(req);
    const configuredLab = await resolveConfiguredLabVendor(accessStudioId);
    let queryText = `
      SELECT
        o.id,
        o.total as totalAmount,
        o.shipping_address as shippingAddress,
        o.user_id as userId,
        o.batch_ready_date as batchReadyDate,
        o.created_at as createdAt,
        o.status,
        u.name as customerName,
        u.email as customerEmail
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.is_batch = 1
        AND (o.lab_submitted = 0 OR o.lab_submitted IS NULL)
    `;
    const params = [];
    if (accessStudioId) {
      queryText += ` AND o.studio_id = $1`;
      params.push(accessStudioId);
    }
    queryText += ` ORDER BY o.created_at ASC`;

    const queuedOrders = await queryRows(queryText, params);
    // Filter out orders that are digital-only (all items are digital) and those that are cancelled
    const filteredOrders = [];
    for (const order of queuedOrders) {
      if (String(order.status).toLowerCase() === 'cancelled') continue;
      // Fetch order items for this order
      const items = await queryRows(
        `SELECT oi.id, oi.product_id, oi.product_size_id, p.options as productOptions, p.category as productCategory, p.name as productName
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [order.id]
      );
      // If there are no items, keep the order (to avoid hiding empty orders by accident)
      if (!items.length) {
        filteredOrders.push(order);
        continue;
      }
      // Use isDigitalProductRow logic from above
      const allDigital = items.every((item) => {
        const options = (() => {
          try {
            return typeof item.productOptions === 'string' ? JSON.parse(item.productOptions) : (item.productOptions || {});
          } catch { return {}; }
        })();
        const category = String(item.productCategory || '').toLowerCase();
        const name = String(item.productName || '').toLowerCase();
        return options.isDigital === true || options.is_digital_only === true || options.digitalOnly === true || category.includes('digital') || name.includes('digital');
      });
      if (!allDigital) {
        filteredOrders.push(order);
      }
    }
    const shippingConfig = accessStudioId
      ? await queryRow(
          `SELECT batch_shipping_address as batchShippingAddress
           FROM shipping_config
           WHERE id = $1`,
          [accessStudioId]
        )
      : null;
    const fallbackBatchAddressRow = accessStudioId
      ? await queryRow(
          `SELECT TOP 1 batch_shipping_address as batchShippingAddress
           FROM orders
           WHERE studio_id = $1
             AND batch_shipping_address IS NOT NULL
           ORDER BY COALESCE(lab_submitted_at, created_at) DESC, id DESC`,
          [accessStudioId]
        )
      : null;
    const resolvedBatchShippingAddress =
      safeJsonParse(shippingConfig?.batchShippingAddress) ||
      safeJsonParse(fallbackBatchAddressRow?.batchShippingAddress) ||
      null;

    // PATCH: All non-cancelled, non-digital batch orders are eligible (ignore batchReadyDate)
    const eligibleOrderIds = filteredOrders.map(order => order.id);
    const mappedOrders = filteredOrders.map(order => ({
      id: order.id,
      userId: order.userId,
      totalAmount: Number(order.totalAmount) || 0,
      customerName: order.customerName || order.customerEmail || `Customer #${order.userId}`,
      customerEmail: order.customerEmail || '',
      createdAt: order.createdAt,
      batchReadyDate: order.batchReadyDate,
      isEligible: true,
      shippingAddress: safeJsonParse(order.shippingAddress),
    }));
    const nextBatchDate = null;

    res.json({
      totalQueued: filteredOrders.length,
      eligibleCount: eligibleOrderIds.length,
      eligibleOrderIds,
      shouldPromptSubmission: eligibleOrderIds.length > 0,
      nextBatchDate,
      orders: mappedOrders,
      batchShippingAddress: resolvedBatchShippingAddress,
      labOptions: [configuredLab],
      selectedLab: configuredLab,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

// Extract attributes from an order item (for unit testing and backend logic)
function extractAttributesFromOrderItem(item) {
  let attrs = null;
  let options = item.productOptions;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = {}; }
  }
  if (options && typeof options === 'object') {
    if (Array.isArray(options.attributes) && options.attributes.length > 0) {
      attrs = options.attributes;
    } else if (typeof options.attributes === 'string') {
      attrs = [options.attributes];
    } else if (Array.isArray(options.whccItemAttributeUIDs) && options.whccItemAttributeUIDs.length > 0) {
      attrs = options.whccItemAttributeUIDs;
    }
  }
  if ((!attrs || (Array.isArray(attrs) && attrs.length === 0)) && item.productOptionsSnapshot) {
    let snapshot = item.productOptionsSnapshot;
    if (typeof snapshot === 'string') {
      try { snapshot = JSON.parse(snapshot); } catch { snapshot = {}; }
    }
    if (snapshot && typeof snapshot === 'object') {
      if (Array.isArray(snapshot.attributes) && snapshot.attributes.length > 0) {
        attrs = snapshot.attributes;
      } else if (typeof snapshot.attributes === 'string') {
        attrs = [snapshot.attributes];
      } else if (Array.isArray(snapshot.whccItemAttributeUIDs) && snapshot.whccItemAttributeUIDs.length > 0) {
        attrs = snapshot.whccItemAttributeUIDs;
      }
    }
  }
  if ((!attrs || (Array.isArray(attrs) && attrs.length === 0)) && item.attributes) {
    attrs = Array.isArray(item.attributes) ? item.attributes : [item.attributes];
  }
  return attrs && attrs.length ? attrs : undefined;
}

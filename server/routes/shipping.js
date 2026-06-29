import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { authRequired } from '../middleware/auth.js';
import { calculateWhccShippingQuote, getWhccRubricSummary, setWhccShippingRubricProxy } from '../services/whccShippingCostService.js';
import {
  extractWhccItemConfig,
  getCatalogProducts,
  getCatalogProductUID,
  getCatalogProductNodeIDs,
  resolveAttributeParents,
} from '../utils/whccItemBuilder.js';

const roundCurrency = (v) => Number((Number(v) || 0).toFixed(2));

// Mirrors the same function in orders.js — sums shipping-keyword line items from WHCC import response.
const extractWhccShippingCostFromImportResponse = (importData) => {
  const SHIPPING_KEYWORDS = [
    'fulfillment shipping', 'delivery area surcharge', 'shipping surcharge',
    'residential delivery', 'fuel surcharge', 'delivery surcharge',
    'extended surcharge', 'shipping & handling', 'handling',
  ];
  let total = 0;
  for (const order of (importData?.Orders ?? importData?.orders ?? [])) {
    for (const product of (order?.Products ?? order?.products ?? [])) {
      const desc = String(product?.ProductDescription ?? product?.productDescription ?? '').toLowerCase();
      if (SHIPPING_KEYWORDS.some(kw => desc.includes(kw))) {
        total += (parseFloat(product?.Price ?? product?.price ?? 0) || 0)
               * Math.max(1, Number(product?.Quantity ?? product?.quantity ?? 1));
      }
    }
  }
  return roundCurrency(total);
};

const router = express.Router();

router.use(authRequired);

const ensureShippingConfigSchema = async () => {
    await query(`
      IF COL_LENGTH('shipping_config', 'batch_shipping_note') IS NULL
      BEGIN
        ALTER TABLE shipping_config ADD batch_shipping_note NVARCHAR(MAX) NULL
      END
    `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'shipping_config')
    BEGIN
      CREATE TABLE shipping_config (
        id INT PRIMARY KEY,
        batch_deadline NVARCHAR(255) DEFAULT '2099-12-31T23:59:59Z',
        direct_shipping_charge FLOAT DEFAULT 10.00,
        is_active BIT DEFAULT 1,
        batch_shipping_address NVARCHAR(MAX),
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    END
  `);

  await query(`
    IF COL_LENGTH('shipping_config', 'batch_shipping_address') IS NULL
    BEGIN
      ALTER TABLE shipping_config ADD batch_shipping_address NVARCHAR(MAX) NULL
    END
  `);

  await query(`
    IF COL_LENGTH('shipping_config', 'direct_pricing_mode') IS NULL
    BEGIN
      ALTER TABLE shipping_config ADD direct_pricing_mode NVARCHAR(32) DEFAULT 'flat_fee'
    END
  `);

  await query(`
    IF COL_LENGTH('shipping_config', 'direct_flat_fee') IS NULL
    BEGIN
      ALTER TABLE shipping_config ADD direct_flat_fee FLOAT NULL
    END
  `);

  await query(`
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_shipping_config_id')
    BEGIN
      ALTER TABLE shipping_config DROP CONSTRAINT ck_shipping_config_id
    END
  `);
};

const mapConfigRowToResponse = (config, studioId) => {
  if (!config) {
    return {
      id: Number(studioId),
      batchDeadline: '',
      directShippingCharge: 9.95,
      directPricingMode: 'flat_fee',
      directFlatFee: 9.95,
      directHandlingFee: 0,
      isActive: true,
      batchShippingAddress: null,
    };
  }

  return {
    id: Number(config.id),
    batchDeadline: config.batch_deadline,
    directShippingCharge: Number(config.direct_shipping_charge || 0),
    directPricingMode: String(config.direct_pricing_mode || 'flat_fee').toLowerCase() === 'flat_fee'
      ? 'flat_fee'
      : 'pass_through',
    directFlatFee: config.direct_flat_fee == null ? null : Number(config.direct_flat_fee),
    directHandlingFee: Number(config.direct_handling_fee || 0),
    isActive: Boolean(config.is_active),
    batchShippingAddress: config.batch_shipping_address ? JSON.parse(config.batch_shipping_address) : null,
    batchShippingNote: config.batch_shipping_note || '',
  };
};

const getStudioShippingConfig = async (studioId) => {
  const config = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
  return mapConfigRowToResponse(config, studioId);
};

const getStudioIdFromItems = async (items) => {
  let studioId = null;

  for (const item of items || []) {
    const photoIds = Array.isArray(item.photoIds)
      ? item.photoIds
      : item.photoId
      ? [item.photoId]
      : [];

    const primaryPhotoId = photoIds[0];
    if (!primaryPhotoId) continue;

    const row = await queryRow(
      `SELECT a.studio_id as studioId
       FROM photos p
       INNER JOIN albums a ON a.id = p.album_id
       WHERE p.id = $1`,
      [primaryPhotoId]
    );

    if (!row?.studioId) continue;

    if (studioId && Number(studioId) !== Number(row.studioId)) {
      throw new Error('Orders cannot span multiple studios for shipping quotes');
    }

    studioId = Number(row.studioId);
  }

  return studioId;
};

const getProductCategoriesForItems = async (items) => {
  const productIds = Array.from(new Set(
    (items || [])
      .map((item) => Number(item?.productId || 0))
      .filter((id) => Number.isInteger(id) && id > 0)
  ));

  if (!productIds.length) return [];

  const placeholders = productIds.map((_, idx) => `$${idx + 1}`).join(', ');
  const rows = await queryRows(
    `SELECT id, category
     FROM products
     WHERE id IN (${placeholders})`,
    productIds
  );

  return rows.map((row) => row.category).filter(Boolean);
};

const resolveStudioId = (req) => {
  const user = req.user;
  const headerStudioIdRaw = req.headers['x-acting-studio-id'];
  const headerStudioId = Number(Array.isArray(headerStudioIdRaw) ? headerStudioIdRaw[0] : headerStudioIdRaw);
  const queryStudioId = Number(req.query?.studioId);
  const bodyStudioId = Number(req.body?.studioId);

  if (user?.role === 'super_admin') {
    if (Number.isInteger(queryStudioId) && queryStudioId > 0) return queryStudioId;
    if (Number.isInteger(bodyStudioId) && bodyStudioId > 0) return bodyStudioId;
    if (Number.isInteger(headerStudioId) && headerStudioId > 0) return headerStudioId;
    return null;
  }

  if ((user?.role === 'admin' || user?.role === 'studio_admin') && Number.isInteger(headerStudioId) && headerStudioId > 0) {
    return headerStudioId;
  }

  return user?.studio_id || null;
};

// Get shipping configuration (studio-specific, super admin can specify studioId)
router.get('/config', async (req, res) => {
  try {
    const studioId = resolveStudioId(req);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    const config = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
    res.json(mapConfigRowToResponse(config, studioId));
  } catch (error) {
    console.error('Error fetching shipping config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update shipping configuration (studio-specific, super admin can specify studioId)
router.put('/config', async (req, res) => {
  try {
    const studioId = resolveStudioId(req);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    const current = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
    const { batchDeadline, directShippingCharge, directPricingMode, directFlatFee, directHandlingFee, isActive, batchShippingAddress, batchShippingNote } = req.body;
    const nextBatchDeadline = batchDeadline ?? current?.batch_deadline ?? '';
    const nextDirectShippingCharge = directShippingCharge ?? current?.direct_shipping_charge ?? 0;
    const nextDirectPricingMode = String(
      directPricingMode ?? current?.direct_pricing_mode ?? 'flat_fee'
    ).toLowerCase() === 'flat_fee'
      ? 'flat_fee'
      : 'pass_through';
    const nextDirectFlatFee = directFlatFee === undefined
      ? (current?.direct_flat_fee ?? null)
      : (directFlatFee === null || directFlatFee === '' ? null : Number(directFlatFee));
    const nextDirectHandlingFee = directHandlingFee === undefined
      ? Number(current?.direct_handling_fee || 0)
      : Math.max(0, Number(directHandlingFee) || 0);
    const nextIsActive = typeof isActive === 'boolean' ? isActive : Boolean(current?.is_active ?? true);
    const nextBatchShippingAddress = batchShippingAddress === undefined
      ? current?.batch_shipping_address ?? null
      : batchShippingAddress
        ? JSON.stringify(batchShippingAddress)
        : null;

    await query(`
      IF EXISTS (SELECT 1 FROM shipping_config WHERE id = $1)
      BEGIN
        UPDATE shipping_config
        SET batch_deadline = $2,
            direct_shipping_charge = $3,
            direct_pricing_mode = $4,
            direct_flat_fee = $5,
            direct_handling_fee = $6,
            is_active = $7,
            batch_shipping_address = $8,
            batch_shipping_note = $9,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      END
      ELSE
      BEGIN
        INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, direct_pricing_mode, direct_flat_fee, direct_handling_fee, is_active, batch_shipping_address, batch_shipping_note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      END
    `, [
      studioId,
      nextBatchDeadline,
      nextDirectShippingCharge,
      nextDirectPricingMode,
      nextDirectFlatFee,
      nextDirectHandlingFee,
      !!nextIsActive,
      nextBatchShippingAddress,
      batchShippingNote || '',
    ]);
    const updated = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
    res.json(mapConfigRowToResponse(updated, studioId));
  } catch (error) {
    console.error('Error updating shipping config:', error);
    res.status(500).json({ error: error.message });
  }
});


// Get rubric summary (for super admin/lab config UI)
router.get('/rubric', async (_req, res) => {
  try {
    const rubric = await getWhccRubricSummary();
    res.json(rubric);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update rubric (super admin only)
router.put('/rubric', async (req, res) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin only' });
    }
    const { matrix } = req.body;
    if (!matrix || typeof matrix !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid rubric matrix' });
    }
    await setWhccShippingRubricProxy(matrix);
    const rubric = await getWhccRubricSummary();
    res.json(rubric);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quote shipping cost using WHCC rubric + studio pricing policy
router.post('/quote', async (req, res) => {
  try {
    const { shippingOption = 'direct', shippingAddress = null, items = [] } = req.body || {};

    let studioId = resolveStudioId(req);
    if (!studioId && Array.isArray(items) && items.length > 0) {
      studioId = await getStudioIdFromItems(items);
    }

    if (!studioId) {
      return res.status(400).json({ error: 'Studio ID required for shipping quote' });
    }

    const studioConfig = await getStudioShippingConfig(studioId);
    const productCategories = await getProductCategoriesForItems(items);

    const destinationAddress = shippingOption === 'batch'
      ? (studioConfig.batchShippingAddress || shippingAddress || {})
      : (shippingAddress || {});

    const quote = await calculateWhccShippingQuote({
      shippingOption,
      destinationAddress,
      productCategories,
      studioConfig,
    });

    res.json({
      studioId: Number(studioId),
      ...quote,
    });
  } catch (error) {
    console.error('Error quoting shipping:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get actual WHCC shipping cost by running a live OrderImport (pass-through mode only).
// Falls back to rubric estimate on any WHCC error so checkout always gets a number.
router.post('/whcc-live-quote', async (req, res) => {
  const { items = [], shippingAddress, shippingOption = 'direct' } = req.body || {};

  const fallbackToRubric = async (studioConfig, reason) => {
    console.warn(`[shipping] whcc-live-quote falling back to rubric: ${reason}`);
    const quote = await calculateWhccShippingQuote({
      shippingOption,
      destinationAddress: shippingAddress || {},
      productCategories: [],
      studioConfig,
    });
    const handlingFee = roundCurrency(Number(studioConfig?.directHandlingFee || 0));
    return res.json({
      source: 'rubric-fallback',
      whccShippingCost: quote.whccShippingCost,
      handlingFee,
      customerShippingCost: roundCurrency(quote.whccShippingCost + handlingFee),
    });
  };

  try {
    let studioId = resolveStudioId(req);
    if (!studioId && items.length > 0) studioId = await getStudioIdFromItems(items);
    console.log(`[whcc-live-quote] hit — studioId=${studioId} items=${items.length}`);
    if (!studioId) return res.status(400).json({ error: 'Studio ID required' });

    const studioConfig = await getStudioShippingConfig(studioId);
    const handlingFee = roundCurrency(Number(studioConfig?.directHandlingFee || 0));
    console.log(`[whcc-live-quote] mode=${studioConfig?.directPricingMode} handlingFee=${handlingFee}`);

    // Flat-fee mode: return configured fee immediately, no WHCC call needed.
    if (studioConfig?.directPricingMode !== 'pass_through') {
      const flatFee = roundCurrency(
        studioConfig?.directFlatFee != null && Number.isFinite(Number(studioConfig.directFlatFee))
          ? Number(studioConfig.directFlatFee)
          : Number(studioConfig?.directShippingCharge || 9.95)
      );
      console.log(`[whcc-live-quote] flat-fee response: $${flatFee}`);
      return res.json({ source: 'flat-fee', customerShippingCost: flatFee, handlingFee: 0 });
    }

    if (!shippingAddress) return res.status(400).json({ error: 'shippingAddress required' });

    const consumerKey = process.env.WHCC_CONSUMER_KEY || process.env.WHCC_API_KEY;
    const consumerSecret = process.env.WHCC_CONSUMER_SECRET || process.env.WHCC_API_SECRET;
    console.log(`[whcc-live-quote] WHCC credentials present=${!!(consumerKey && consumerSecret)}`);
    if (!consumerKey || !consumerSecret) return fallbackToRubric(studioConfig, 'no WHCC credentials');

    const isSandbox = process.env.WHCC_SANDBOX === 'true';
    const azureBaseUrl = (process.env.AZURE_BASE_URL || '').replace(/\/$/, '');

    const axios = (await import('axios')).default;
    const { fetchToken } = await import('./whccProxy.js');
    const baseUrl = isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';
    const token = await fetchToken(consumerKey, consumerSecret, isSandbox);

    // Fetch WHCC catalog once — used for node IDs and attribute parent resolution
    let catalogProducts = [];
    try {
      const catalogResp = await axios.get(`${baseUrl}/api/catalog`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 10000,
      });
      catalogProducts = getCatalogProducts(catalogResp.data);
      console.log(`[whcc-live-quote] catalog fetched — ${catalogProducts.length} products`);
    } catch (err) {
      console.warn(`[whcc-live-quote] catalog fetch failed, falling back to product options only:`, err?.message);
    }

    // Build WHCC order items using shared helpers (same as orders.js submitOrderToWhcc)
    const whccOrderItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const opts = (() => {
        const snap = item.productOptionsSnapshot;
        if (!snap) return item.productOptions || {};
        try { return typeof snap === 'string' ? JSON.parse(snap) : snap; } catch { return {}; }
      })();

      const itemConfig = extractWhccItemConfig(opts);
      const productUID = itemConfig.productUID;
      console.log(`[whcc-live-quote] item[${i}] productUID=${productUID}`);
      if (!productUID) continue;

      // Find the catalog product to get canonical node IDs and resolve attribute parents
      const catalogMatch = catalogProducts.find((p) => getCatalogProductUID(p) === productUID) || null;
      const catalogNodeIDs = catalogMatch ? getCatalogProductNodeIDs(catalogMatch) : [];
      const nodeIDs = catalogNodeIDs.length > 0 ? catalogNodeIDs : itemConfig.productNodeIDs;

      // Start with attribute UIDs from product options, then resolve parent dependencies using catalog
      const rawAttrUIDs = itemConfig.itemAttributeUIDs.length
        ? itemConfig.itemAttributeUIDs
        : (Array.isArray(item.attributes)
            ? item.attributes.map((a) => Number(a?.AttributeUID ?? a)).filter((v) => Number.isInteger(v) && v > 0)
            : []);
      const finalAttrUIDs = catalogMatch
        ? resolveAttributeParents(rawAttrUIDs, catalogMatch)
        : rawAttrUIDs;

      console.log(`[whcc-live-quote] item[${i}] nodeIDs=${nodeIDs.join(',')} attrUIDs=${finalAttrUIDs.join(',')}`);

      // Resolve photo URL for ItemAssets
      let assetPath = null;
      const photoId = item.photoId || item.photo?.id;
      if (photoId && nodeIDs.length > 0) {
        const photo = await queryRow(
          'SELECT file_name, full_image_url, album_id FROM photos WHERE id = $1',
          [photoId]
        );
        if (photo) {
          const url = photo.full_image_url;
          if (url?.startsWith('http')) {
            assetPath = url;
          } else if (azureBaseUrl) {
            assetPath = url
              ? `${azureBaseUrl}/${url}`
              : (photo.file_name && photo.album_id
                  ? `${azureBaseUrl}/albums/${photo.album_id}/${photo.file_name}`
                  : null);
          }
        }
      }

      whccOrderItems.push({
        ProductUID: productUID,
        Quantity: Math.max(1, Number(item.quantity) || 1),
        LineItemID: String(i + 1),
        ...(nodeIDs.length > 0 && assetPath
          ? { ItemAssets: nodeIDs.map((id) => ({ ProductNodeID: id, AssetPath: assetPath, AutoRotate: false })) }
          : {}),
        ...(finalAttrUIDs.length > 0
          ? { ItemAttributes: finalAttrUIDs.map((uid) => ({ AttributeUID: uid })) }
          : {}),
      });
    }

    console.log(`[whcc-live-quote] resolved ${whccOrderItems.length}/${items.length} items with WHCC productUIDs`);
    if (!whccOrderItems.length) return res.status(400).json({ error: 'No WHCC-compatible items in cart' });

    // Studio ship-from address
    const studioRow = await queryRow(
      `SELECT ship_from_name, ship_from_address1, ship_from_address2,
              ship_from_city, ship_from_state, ship_from_zip, ship_from_country
       FROM studios WHERE id = $1`,
      [studioId]
    );

    const toAddr = (a) => String(a || '').trim();
    const whccShipTo = {
      Name: toAddr(shippingAddress.fullName) || 'Customer',
      Attn: null,
      Addr1: toAddr(shippingAddress.addressLine1) || 'Address unavailable',
      Addr2: toAddr(shippingAddress.addressLine2) || null,
      City: toAddr(shippingAddress.city) || 'Unknown',
      State: toAddr(shippingAddress.state) || 'NA',
      Zip: toAddr(shippingAddress.zipCode) || '00000',
      Country: toAddr(shippingAddress.country) || 'US',
    };
    const whccShipFrom = {
      Name: toAddr(studioRow?.ship_from_name) || whccShipTo.Name,
      Attn: null,
      Addr1: toAddr(studioRow?.ship_from_address1) || whccShipTo.Addr1,
      Addr2: toAddr(studioRow?.ship_from_address2) || null,
      City: toAddr(studioRow?.ship_from_city) || whccShipTo.City,
      State: toAddr(studioRow?.ship_from_state) || whccShipTo.State,
      Zip: toAddr(studioRow?.ship_from_zip) || whccShipTo.Zip,
      Country: toAddr(studioRow?.ship_from_country) || 'US',
    };

    const orderAttributeUIDs = process.env.WHCC_ORDER_ATTRIBUTE_UIDS
      ? String(process.env.WHCC_ORDER_ATTRIBUTE_UIDS).split(',').map(Number).filter(n => Number.isInteger(n) && n > 0)
      : [96, 545];

    const quoteId = `quote-${studioId}-${Date.now()}`;
    const whccPayload = {
      EntryId: quoteId,
      Orders: [{
        SequenceNumber: 1,
        Reference: `ShippingQuote-${quoteId}`,
        ShipToAddress: whccShipTo,
        ShipFromAddress: whccShipFrom,
        OrderAttributes: orderAttributeUIDs.map(uid => ({ AttributeUID: uid })),
        OrderItems: whccOrderItems,
        DropShipFlag: 1,
      }],
    };

    console.log(`[whcc-live-quote] calling WHCC OrderImport — sandbox=${isSandbox} url=${baseUrl}/api/OrderImport payload items=${whccOrderItems.length}`);
    console.log(`[whcc-live-quote] token obtained, posting to WHCC`);

    const importResp = await axios.post(
      `${baseUrl}/api/OrderImport`,
      whccPayload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const importData = importResp.data;
    console.log(`[whcc-live-quote] WHCC response status=${importResp.status} confirmationId=${importData?.confirmationId || importData?.ConfirmationID} rawKeys=${Object.keys(importData || {}).join(',')}`);

    // WHCC returns 200 even for validation failures — check BrokenRules
    const brokenRules = Array.isArray(importData?.BrokenRules) ? importData.BrokenRules : [];
    if (brokenRules.length > 0) {
      const ruleDescriptions = brokenRules.map(r => r?.Description || String(r)).join(' | ');
      console.warn(`[whcc-live-quote] WHCC validation failed (BrokenRules) — falling back to rubric. Rules: ${ruleDescriptions}`);
      return fallbackToRubric(studioConfig, `WHCC validation: ${ruleDescriptions}`);
    }

    const confirmationId = importData?.confirmationId || importData?.ConfirmationID || null;
    const whccShippingCost = extractWhccShippingCostFromImportResponse(importData);
    const customerShippingCost = roundCurrency(whccShippingCost + handlingFee);
    console.log(`[whcc-live-quote] extracted whccShippingCost=${whccShippingCost} handlingFee=${handlingFee} customerShippingCost=${customerShippingCost}`);
    if (whccShippingCost === 0) {
      console.warn(`[whcc-live-quote] WARNING: shipping cost is 0 after successful import — full response:`, JSON.stringify(importData).slice(0, 2000));
    }

    return res.json({ source: 'whcc-live', whccShippingCost, handlingFee, customerShippingCost, confirmationId });

  } catch (err) {
    console.error('[shipping] whcc-live-quote error:', err?.response?.data || err?.message);
    try {
      const studioId = resolveStudioId(req) || (items.length ? await getStudioIdFromItems(items) : null);
      if (studioId && shippingAddress) {
        const studioConfig = await getStudioShippingConfig(studioId);
        return fallbackToRubric(studioConfig, err?.message || 'WHCC error');
      }
    } catch {}
    res.status(500).json({ error: err?.message || 'Failed to get shipping quote' });
  }
});

export default router;

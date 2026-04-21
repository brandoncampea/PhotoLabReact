
import express from 'express';
import jwt from 'jsonwebtoken';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { authRequired, adminRequired, superAdminRequired } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import orderReceiptService from '../services/orderReceiptService.js';
const router = express.Router();

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

const isDigitalProductRow = (item) => {
  const options = safeJsonParse(item?.productOptions, {}) || {};
  const category = String(item?.productCategory || '').toLowerCase();
  const name = String(item?.productName || '').toLowerCase();
  return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
};

const createDigitalDownloadToken = ({ orderId, userId, orderItemId, photoId }) => jwt.sign(
  {
    scope: 'digital-download',
    orderId: Number(orderId),
    userId: Number(userId),
    orderItemId: Number(orderItemId),
    photoId: Number(photoId),
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
  const config = await queryRow('SELECT secret_key as secretKey, is_active as isActive FROM stripe_config WHERE id = 1');
  const secretKey = String(config?.secretKey || '').trim();
  if (!config?.isActive || !secretKey || secretKey.includes('example') || secretKey.includes('***')) {
    return null;
  }
  const Stripe = (await import('stripe')).default;
  return new Stripe(secretKey, { apiVersion: '2023-10-16' });
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

const submitOrderToWhcc = async (orderId, options = {}) => {
  const allowBatch = Boolean(options?.allowBatch);
  const shippingAddressOverride = options?.shippingAddressOverride || null;
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

  const targetOrderIds = isAggregateSubmission ? aggregateOrderIds : [orderId];

  try {
    let orders = [];
    if (isAggregateSubmission) {
      const orderPlaceholders = targetOrderIds.map((_, index) => `$${index + 1}`).join(',');
      orders = await queryRows(
        `SELECT id,
                studio_id,
                is_batch,
                shipping_address as shippingAddress,
                batch_shipping_address as batchShippingAddress,
                created_at as createdAt
         FROM orders
         WHERE id IN (${orderPlaceholders})`,
        targetOrderIds
      );
    } else {
      const singleOrder = await queryRow(
        `SELECT id,
                studio_id,
                is_batch,
                shipping_address as shippingAddress,
                batch_shipping_address as batchShippingAddress,
                created_at as createdAt
         FROM orders
         WHERE id = $1`,
        [orderId]
      );
      if (singleOrder) orders = [singleOrder];
    }

    if (!orders.length) {
      return;
    }

    const order = orders[0];
    if (orders.some((entry) => entry.is_batch) && !allowBatch) {
      return; // Don't submit batch orders to WHCC unless explicitly allowed
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

    const defaultShipFromAddress = {
      Name: process.env.WHCC_SHIP_FROM_NAME || 'Returns Department',
      Addr1: process.env.WHCC_SHIP_FROM_ADDR1 || '3432 Denmark Ave',
      Addr2: process.env.WHCC_SHIP_FROM_ADDR2 || 'Suite 390',
      City: process.env.WHCC_SHIP_FROM_CITY || 'Eagan',
      State: process.env.WHCC_SHIP_FROM_STATE || 'MN',
      Zip: process.env.WHCC_SHIP_FROM_ZIP || '55123',
      Country: process.env.WHCC_SHIP_FROM_COUNTRY || 'US',
      Phone: normalizePhone(process.env.WHCC_SHIP_FROM_PHONE || '8002525234'),
    };

    const itemPlaceholders = targetOrderIds.map((_, index) => `$${index + 1}`).join(',');
    const items = await queryRows(
      `SELECT oi.id,
              oi.order_id as orderId,
              oi.photo_id,
              oi.product_id,
              oi.product_size_id,
              oi.quantity,
              oi.crop_data,
              p.name as productName,
              p.category as productCategory,
              ps.size_name as sizeName,
              p.options as productOptions,
              p.image_url as productImageUrl,
              ph.file_name as fileName,
              ph.full_image_url as fullImageUrl,
              ph.thumbnail_url as thumbnailUrl
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

    // Get WHCC credentials from environment
    const consumerKey = process.env.WHCC_CONSUMER_KEY;
    const consumerSecret = process.env.WHCC_CONSUMER_SECRET;
    const isSandbox = process.env.WHCC_SANDBOX === 'true';
    sandboxMode = isSandbox;

    if (!consumerKey || !consumerSecret) {
      console.warn('[WHCC] WHCC_CONSUMER_KEY or WHCC_CONSUMER_SECRET not configured; skipping WHCC submission');
      return;
    }

    const { createHash } = await import('node:crypto');

    const parseProductOptions = (value) => safeJsonParse(value, {}) || {};
    const extractWhccItemConfig = (productOptions) => {
      const direct = productOptions || {};
      const nested = direct.whcc || direct.whccConfig || {};
      return {
        productUID: Number(
          direct.whccProductUID ??
          direct.productUID ??
          nested.productUID ??
          nested.ProductUID
        ) || null,
        productNodeID: Number(
          direct.whccProductNodeID ??
          direct.productNodeID ??
          nested.productNodeID ??
          nested.ProductNodeID
        ) || null,
        itemAttributeUIDs: Array.isArray(direct.whccItemAttributeUIDs)
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
          .map((c) => Number(c?.RequiredLevel ?? c?.requiredLevel ?? 0))
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

    // Get WHCC token using the Order Submit API access-token endpoint
    currentStage = 'token';
    currentRequestUrl = `${baseUrl}/api/AccessToken`;
    const tokenResponse = await axios.get(currentRequestUrl, {
      params: {
        grant_type: 'consumer_credentials',
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
      headers: {
        'Accept': 'application/json',
      },
    });

    const token = tokenResponse.data?.Token || tokenResponse.data?.token || null;
    if (!token) {
      throw new Error('WHCC token response did not include a token');
    }

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
    const resolvedWhccItems = items
      .map((item, index) => {
        const productOptions = parseProductOptions(item.productOptions);
        if (isDigitalOrderItem(item, productOptions)) {
          return null;
        }

        const assetPath = toAbsoluteAssetUrl(item.fullImageUrl) || toAbsoluteAssetUrl(item.thumbnailUrl);
        if (!assetPath) {
          return null;
        }

        const imageHash = createHash('md5').update(assetPath).digest('hex');
        const cropData = safeJsonParse(item.crop_data, null);

        const optionsConfig = extractWhccItemConfig(productOptions);
        const catalogMatch = matchCatalogProduct(catalogProducts, item);

        const productUID =
          optionsConfig.productUID ||
          getCatalogProductUID(catalogMatch) ||
          getStaticWhccFallbackProductUID(item);

        if (!productUID) {
          throw new Error(`No WHCC product mapping found for ${item.productName || 'Unknown Product'}${item.sizeName ? ` (${item.sizeName})` : ''}. Add WHCC mapping data before retrying.`);
        }

        // Determine all product nodes — multi-node products need one ItemAsset per node
        const productNodeIDs = optionsConfig.productNodeID
          ? [Number(optionsConfig.productNodeID)]
          : getCatalogProductNodeIDs(catalogMatch);

        // Press product deduplication: WHCC allows only one press design per order
        if (isPressProduct(catalogMatch)) {
          if (pressProductUIDsUsed.has(productUID)) {
            console.warn(`[WHCC] Skipping duplicate press product ${item.productName || productUID} — only one press design allowed per WHCC order.`);
            return null;
          }
          pressProductUIDsUsed.add(productUID);
        }

        const optionAttributeUIDs = (optionsConfig.itemAttributeUIDs || [])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0);
        const catalogAttributeUIDs = getCatalogItemAttributeUIDs(catalogMatch);

        // Prefer WHCC catalog defaults (source of truth). Fall back to stored options if catalog has none.
        const finalAttributeUIDs = catalogAttributeUIDs.length
          ? catalogAttributeUIDs
          : optionAttributeUIDs;

        const cropOverrides = cropData && typeof cropData === 'object'
          ? {
              X: Number(cropData.x) || 0,
              Y: Number(cropData.y) || 0,
              ZoomX: Number(cropData.scaleX) ? Number(cropData.scaleX) * 100 : 100,
              ZoomY: Number(cropData.scaleY) ? Number(cropData.scaleY) * 100 : 100,
            }
          : {};

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
          nodeCount: productNodeIDs.length,
          payload: {
            ProductUID: productUID,
            Quantity: Math.max(1, Number(item.quantity) || 1),
            LineItemID: String(item.id || index + 1),
            // One ItemAsset per ProductNode — WHCC requires this for multi-node products
            ItemAssets: productNodeIDs.map((nodeId) => ({
              ProductNodeID: nodeId,
              AssetPath: assetPath,
              ImageHash: imageHash,
              PrintedFileName: item.fileName || `order-${orderId}-item-${index + 1}.jpg`,
              AutoRotate: true,
              ...cropOverrides,
            })),
            ...(finalAttributeUIDs.length
              ? { ItemAttributes: finalAttributeUIDs.map((uid) => ({ AttributeUID: uid })) }
              : {}),
          },
        };
      })
      .filter(Boolean);

    const whccOrderItems = resolvedWhccItems.map((item) => item.payload);

    if (!whccOrderItems.length) {
      console.log(`[WHCC] Order(s) ${targetOrderIds.join(', ')} have no physical items to submit (digital-only or non-submittable items). Skipping WHCC submission.`);
      return;
    }

    const whccEntryId = isAggregateSubmission
      ? `batch-${Date.now()}`
      : String(orderId);
    const whccReference = isAggregateSubmission
      ? `Batch Orders #${targetOrderIds.join(',')}`
      : `Order #${orderId}`;

    const whccOrderRequest = {
      EntryId: whccEntryId,
      Orders: [
        {
          SequenceNumber: 1,
          Reference: whccReference,
          Instructions: null,
          SendNotificationEmailAddress: String(shippingAddress.email || '').trim() || null,
          SendNotificationEmailToAccount: true,
          ShipToAddress: {
            Name: String(shippingAddress.fullName || '').trim() || `Order ${orderId}`,
            Attn: null,
            Addr1: String(shippingAddress.addressLine1 || '').trim() || 'Address unavailable',
            Addr2: String(shippingAddress.addressLine2 || '').trim() || null,
            City: String(shippingAddress.city || '').trim() || 'Unknown',
            State: String(shippingAddress.state || '').trim() || 'NA',
            Zip: String(shippingAddress.zipCode || '').trim() || '00000',
            Country: String(shippingAddress.country || '').trim() || 'US',
            Phone: normalizePhone(shippingAddress.phone),
          },
          ShipFromAddress: defaultShipFromAddress,
          OrderAttributes: orderAttributeUIDs.map((uid) => ({ AttributeUID: uid })),
          OrderItems: whccOrderItems,
        },
      ],
    };

    requestLog = {
      sandbox: isSandbox,
      localOrderIds: targetOrderIds,
      tokenRequest: {
        url: `${baseUrl}/api/AccessToken`,
        runAt: nowIso(),
        params: {
          grant_type: 'consumer_credentials',
          consumerKeyPreview: previewSecret(consumerKey),
        },
      },
      importRequest: {
        url: `${baseUrl}/api/OrderImport`,
        runAt: nowIso(),
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

    const updateImportPlaceholders = targetOrderIds.map((_, index) => `$${index + 4}`).join(',');
    await query(
      `UPDATE orders
       SET whcc_confirmation_id = $1,
           whcc_import_response = $2,
           whcc_request_log = $3,
           whcc_last_error = NULL
       WHERE id IN (${updateImportPlaceholders})`,
      [confirmationId, stringifyForDb(importResponseData), stringifyForDb(requestLog), ...targetOrderIds]
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
    requestLog = {
      ...requestLog,
      submitResponseMeta: {
        runAt: nowIso(),
        status: submitResponse?.status || null,
      },
    };

    const updateSubmitPlaceholders = targetOrderIds.map((_, index) => `$${index + 6}`).join(',');
    await query(
      `UPDATE orders
       SET lab_submitted = 1,
           lab_submitted_at = CURRENT_TIMESTAMP,
           batch_lab_vendor = CASE WHEN is_batch = 1 THEN 'whcc' ELSE batch_lab_vendor END,
           batch_queue_status = CASE WHEN is_batch = 1 THEN 'submitted' ELSE batch_queue_status END,
           batch_shipping_address = CASE WHEN is_batch = 1 THEN COALESCE($5, batch_shipping_address) ELSE batch_shipping_address END,
           status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END,
           whcc_confirmation_id = $1,
           whcc_import_response = $2,
           whcc_submit_response = $3,
           whcc_request_log = $4,
           whcc_last_error = NULL
       WHERE id IN (${updateSubmitPlaceholders})`,
      [
        confirmationId,
        stringifyForDb(importResponseData),
        stringifyForDb(submitResponseData),
        stringifyForDb(requestLog),
        shippingAddressOverride ? stringifyForDb(shippingAddressOverride) : null,
        ...targetOrderIds,
      ]
    );

    console.log(`[WHCC] Order(s) ${targetOrderIds.join(', ')} submitted successfully`);
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

    const updateErrorPlaceholders = targetOrderIds.map((_, index) => `$${index + 6}`).join(',');
    await query(
      `UPDATE orders
       SET whcc_confirmation_id = COALESCE($1, whcc_confirmation_id),
           whcc_import_response = COALESCE($2, whcc_import_response),
           whcc_submit_response = COALESCE($3, whcc_submit_response),
           whcc_request_log = COALESCE($4, whcc_request_log),
           whcc_last_error = $5,
           batch_queue_status = CASE WHEN is_batch = 1 THEN 'failed' ELSE batch_queue_status END
       WHERE id IN (${updateErrorPlaceholders})`,
      [
        confirmationId,
        stringifyForDb(importResponseData),
        stringifyForDb(submitResponseData),
        stringifyForDb(requestLog),
        stringifyForDb(errorPayload),
        ...targetOrderIds,
      ]
    );

    console.error(`[WHCC] Failed to submit order(s) ${targetOrderIds.join(', ')} to WHCC:`, errorPayload);
    // Non-blocking error — don't fail the order creation
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
            o.stripe_fee_amount as stripeFeeAmount,
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

  const items = await queryRows(
    `SELECT oi.id,
            oi.photo_id as photoId,
            oi.quantity,
            oi.price as unitPrice,
            ph.file_name as photoFileName,
            p.options as productOptions,
            p.category as productCategory,
            p.name as productName,
            a.studio_id as studioId,
            s.name as studioName,
            s.email as studioEmail,
            COALESCE(ps.price, p.price, 0) as basePrice,
            COALESCE(ps.cost, p.cost, 0) as cost
     FROM order_items oi
     INNER JOIN photos ph ON ph.id = oi.photo_id
     INNER JOIN albums a ON a.id = ph.album_id
     INNER JOIN studios s ON s.id = a.studio_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  // Ensure APP_BASE_URL is set, fallback to canonical public URL
  const appBase = String(process.env.APP_BASE_URL || process.env.CANONICAL_APP_URL || 'https://labs.campeaphotography.com').trim().replace(/\/$/, '');
  const digitalDownloads = items
    .filter((item) => isDigitalProductRow(item))
    .map((item) => {
      const token = createDigitalDownloadToken({
        orderId: order.id,
        userId: order.userId,
        orderItemId: item.id,
        photoId: item.photoId,
      });
      const relativeUrl = `/api/orders/digital-download/${token}`;
      return {
        orderItemId: item.id,
        photoId: item.photoId,
        productName: item.productName,
        photoFileName: item.photoFileName,
        url: appBase ? `${appBase}${relativeUrl}` : relativeUrl,
      };
    });

  const parsedShippingAddress = safeJsonParse(order.shippingAddress, {});
  const superAdminBcc = await getSuperAdminReceiptBcc();
  const customerSent = await orderReceiptService.sendCustomerReceipt({
    to: parsedShippingAddress?.email || order.customerEmail,
    customerName: parsedShippingAddress?.fullName || order.customerName,
    order,
    items,
    digitalDownloads,
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
    const superAdminProfit = studioGroup.items.reduce(
      (sum, item) => sum + (((Number(item.basePrice) || 0) - (Number(item.cost) || 0)) * (Number(item.quantity) || 0)),
      0
    );
    const stripeFeeAmount = totalItemRevenue > 0
      ? (Number(order.stripeFeeAmount) || 0) * (studioRevenue / totalItemRevenue)
      : 0;
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
        grossStudioMarkup: studioRevenue - baseRevenue,
        stripeFeeAmount,
        studioProfitNet: (studioRevenue - baseRevenue) - stripeFeeAmount,
        superAdminProfit,
      },
      items: studioGroup.items,
    });
    anyStudioSent = anyStudioSent || sent;
    // Small delay between studio emails to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (customerSent || anyStudioSent) {
    await query(
      `UPDATE orders
       SET customer_receipt_sent_at = CASE WHEN $1 = 1 THEN CURRENT_TIMESTAMP ELSE customer_receipt_sent_at END,
           studio_receipt_sent_at = CASE WHEN $2 = 1 THEN CURRENT_TIMESTAMP ELSE studio_receipt_sent_at END
       WHERE id = $3`,
      [customerSent ? 1 : 0, anyStudioSent ? 1 : 0, orderId]
    );
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
         AND o.user_id = $3
         AND oi.photo_id = $4`,
      [payload.orderItemId, payload.orderId, payload.userId, payload.photoId]
    );

    if (!orderItem) {
      return res.status(404).json({ error: 'Download item not found' });
    }

    if (!isDigitalProductRow(orderItem)) {
      return res.status(403).json({ error: 'This item is not a digital download product' });
    }

    return res.redirect(302, `/api/photos/${orderItem.photoId}/asset?variant=full`);
  } catch (error) {
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
        `SELECT id, photo_id as photoId, photo_ids as photoIds, product_id as productId,
                quantity, price, crop_data as cropData
         FROM order_items WHERE order_id = $1`,
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
    const userId = req.user.id;
    const { 
      items, 
      total, 
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

    const paymentAccounting = await fetchPaymentIntentAccounting(paymentIntentId);

    const batchOrder = !!isBatch;
    const directOrder = !batchOrder && shippingOption === 'direct';
    const orderStudioId = await getOrderStudioIdFromItems(items);
    if (!orderStudioId) {
      return res.status(400).json({ error: 'Unable to determine studio for this order' });
    }
    let batchReadyDate = null;
    if (batchOrder && orderStudioId) {
      const shippingConfig = await queryRow(
        'SELECT batch_deadline as batchDeadline FROM shipping_config WHERE id = $1',
        [orderStudioId]
      );
      if (shippingConfig?.batchDeadline) {
        const parsedDate = new Date(shippingConfig.batchDeadline);
        if (!Number.isNaN(parsedDate.getTime())) {
          batchReadyDate = parsedDate.toISOString();
        }
      }
    }

    // Calculate studio_shipping_cost and shipping_margin
    let studioShippingCost = 0;
    let shippingMargin = 0;
    // Studio shipping cost: sum of base cost for each item (from product_sizes or products)
    for (const item of items) {
      let baseCost = 0;
      if (item.productSizeId) {
        const sizeRow = await queryRow(
          'SELECT cost FROM product_sizes WHERE id = $1',
          [item.productSizeId]
        );
        baseCost = Number(sizeRow?.cost) || 0;
      } else if (item.productId) {
        const prodRow = await queryRow(
          'SELECT cost FROM products WHERE id = $1',
          [item.productId]
        );
        baseCost = Number(prodRow?.cost) || 0;
      }
      studioShippingCost += baseCost * (Number(item.quantity) || 1);
    }
    // Margin = what customer paid for shipping minus studio base cost
    shippingMargin = (Number(shippingCost) || 0) - studioShippingCost;

    const nextStatus = directOrder ? 'processing' : 'pending';
    const shouldMarkLabSubmitted = directOrder ? false : !!labSubmitted;

    // Insert order and get the returned id

    const orderResult = await queryRow(`
      INSERT INTO orders (
        studio_id,
        user_id, 
        status,
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CASE WHEN $19 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, $20, $21, $22
      )
      RETURNING id
    `, [
      orderStudioId,
      userId, 
      nextStatus,
      total,
      subtotal || 0, 
      taxAmount || 0,
      taxRate || 0,
      JSON.stringify(shippingAddress),
      shippingOption || 'direct',
      shippingCost || 0,
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

    // Insert order items
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

      await query(`
        INSERT INTO order_items (order_id, photo_id, photo_ids, product_id, product_size_id, quantity, price, crop_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        orderId,
        primaryPhotoId,
        JSON.stringify(photoIds),
        item.productId,
        item.productSizeId || null,
        item.quantity,
        item.price,
        item.cropData ? JSON.stringify(item.cropData) : null,
      ]);
    }

    // Generate studio invoice line items for each order item
    try {
      // Collect per-studio invoice items
      const studioItemMap = new Map(); // studio_id -> { subscriptionEnd, items: [] }

      for (const item of items) {
        if (!item.productSizeId && !item.productId) continue;
        const photoIds = Array.isArray(item.photoIds) ? item.photoIds : item.photoId ? [item.photoId] : [];
        const primaryPhotoId = photoIds[0];
        if (!primaryPhotoId) continue;

        // Resolve studio via photo -> album
        const photo = await queryRow('SELECT album_id FROM photos WHERE id = $1', [primaryPhotoId]);
        if (!photo?.album_id) continue;

        const album = await queryRow(
          'SELECT studio_id, price_list_id FROM albums WHERE id = $1',
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

    // Automatically submit direct shipping orders to WHCC
    if (directOrder) {
      try {
        await submitOrderToWhcc(orderId);
      } catch (whccErr) {
        console.error('WHCC submission failed (non-fatal):', whccErr);
      }
    }

    // Return the created order
    try {
      await sendOrderReceipts(orderId);
    } catch (receiptError) {
      console.error('Order receipt send failed (non-fatal):', receiptError);
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
      const itemsWithPhotos = [];
      if (includeItems) {
        const items = await queryRows(
          `SELECT id, photo_id as photoId, photo_ids as photoIds, product_id as productId,
                  product_size_id as productSizeId, quantity, price, crop_data as cropData
           FROM order_items WHERE order_id = $1`,
          [order.id]
        );

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
              `SELECT ps.price, ps.size_name as sizeName, p.name as productName
               FROM product_sizes ps
               LEFT JOIN products p ON p.id = ps.product_id
               WHERE ps.id = $1`,
              [item.productSizeId]
            );
            unitCost = Number(size?.price) || 0;
            productSizeName = size?.sizeName || null;
            productName = size?.productName || null;
          } else if (item.productId) {
            const product = await queryRow(
              `SELECT price, name FROM products WHERE id = $1`,
              [item.productId]
            );
            unitCost = Number(product?.price) || 0;
            productName = product?.name || null;
          }
          itemsWithPhotos.push({
            ...item,
            price: item.price || 0,
            cost: unitCost,
            productName,
            productSizeName,
            cropData: safeJsonParse(item.cropData),
            photoIds: safeJsonParse(item.photoIds, item.photoId ? [item.photoId] : []),
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
              thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
              url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
            },
          });
        }
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
        items: itemsWithPhotos,
      });
    }
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
              product_size_id as productSizeId, quantity, price, crop_data as cropData
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
          `SELECT ps.price, ps.size_name as sizeName, p.name as productName
           FROM product_sizes ps
           LEFT JOIN products p ON p.id = ps.product_id
           WHERE ps.id = $1`,
          [item.productSizeId]
        );
        unitCost = Number(size?.price) || 0;
        productSizeName = size?.sizeName || null;
        productName = size?.productName || null;
      } else if (item.productId) {
        const product = await queryRow(
          `SELECT price, name FROM products WHERE id = $1`,
          [item.productId]
        );
        unitCost = Number(product?.price) || 0;
        productName = product?.name || null;
      }
      itemsWithPhotos.push({
        ...item,
        price: item.price || 0,
        cost: unitCost,
        productName,
        productSizeName,
        cropData: safeJsonParse(item.cropData),
        photoIds: safeJsonParse(item.photoIds, item.photoId ? [item.photoId] : []),
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
          thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
          url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
        },
      });
    }

    // Add digital item flags for admin UI
    const digitalItems = itemsWithPhotos.filter((item) => isDigitalProductRow(item));
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
      items: itemsWithPhotos,
      hasDigitalItems: digitalItems.length > 0,
      digitalItemCount: digitalItems.length,
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
          `SELECT oi.id,
                  oi.photo_id as photoId,
                  oi.photo_ids as photoIds,
                  oi.product_id as productId,
                  oi.product_size_id as productSizeId,
                  oi.quantity,
                  oi.price,
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
    if (!orderId) {
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
      return res.status(404).json({ error: 'Order not found' });
    }


    const items = await queryRows(
      `SELECT oi.id,
              oi.photo_id as photoId,
              oi.photo_ids as photoIds,
              oi.product_id as productId,
              oi.product_size_id as productSizeId,
              oi.quantity,
              oi.price,
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
    console.log('ADMIN ORDER DETAILS: items for orderId', order.id);
    console.log(items);

    const photoIds = [...new Set(items.map((item) => Number(item.photoId)).filter(Boolean))];
    let photosById = new Map();
    if (photoIds.length > 0) {
      const placeholders = photoIds.map((_, index) => `$${index + 1}`).join(', ');
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
      return {
        ...item,
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
      items: itemsWithPhotos,
      // excludedItemsNote removed to fix ReferenceError
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

    const allowedStatuses = ['pending', 'processing', 'completed', 'shipped', 'cancelled'];
    if (!allowedStatuses.includes(String(status).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    // Fetch order details for validation and refund
    const order = await queryRow(
      `SELECT o.id, o.user_id as userId, o.status, o.total_amount as totalAmount, o.payment_intent_id as paymentIntentId, o.stripe_charge_id as stripeChargeId, o.email, o.studio_id as studioId
       FROM orders o
       WHERE o.id = $1`,
      [orderId]
    );

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
      if (['cancelled', 'shipped', 'completed'].includes(String(order.status).toLowerCase())) {
        return res.status(400).json({ error: 'Order cannot be cancelled in its current state.' });
      }
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
      try {
        // Fetch order items for email
        const items = await queryRows(
          `SELECT oi.id, oi.photo_id as photoId, oi.product_id as productId, oi.product_size_id as productSizeId, oi.quantity, oi.price, oi.crop_data as cropData, p.name as productName, ps.size_name as productSizeName
           FROM order_items oi
           LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
           LEFT JOIN products p ON p.id = COALESCE(oi.product_id, ps.product_id)
           WHERE oi.order_id = $1`,
          [orderId]
        );
        await orderReceiptService.sendCustomerReceipt({
          to: order.email,
          customerName: '',
          order: { ...order, status: 'cancelled' },
          items,
          digitalDownloads: [],
        });
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
    const { orderIds, batchAddress, selectedLab } = req.body;

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

    let updatedCount = 0;
    let notReadyCount = 0;
    let failedCount = 0;
    const now = new Date();
    const eligibleIds = [];

    for (const orderId of ids) {
      const order = await queryRow(
        `SELECT o.id, o.user_id as userId, o.is_batch as isBatch, o.lab_submitted as labSubmitted,
                o.batch_ready_date as batchReadyDate
         FROM orders o
         WHERE o.id = $1`,
        [orderId]
      );

      if (!order || !order.isBatch || order.labSubmitted) continue;

      if (order.batchReadyDate) {
        const readyDate = new Date(order.batchReadyDate);
        if (!Number.isNaN(readyDate.getTime()) && readyDate > now) {
          notReadyCount += 1;
          continue;
        }
      }

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
    // Filter out orders that are digital-only (all items are digital)
    const filteredOrders = [];
    for (const order of queuedOrders) {
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
        const options = (() => { try { return JSON.parse(item.productOptions || '{}'); } catch { return {}; } })();
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
    const now = new Date();
    const eligibleOrderIds = [];
    let nextBatchDate = null;
    const mappedOrders = [];

    for (const order of filteredOrders) {
      const readyDate = order.batchReadyDate ? new Date(order.batchReadyDate) : null;
      const isEligible = !readyDate || Number.isNaN(readyDate.getTime()) || readyDate <= now;
      if (!readyDate || Number.isNaN(readyDate.getTime()) || readyDate <= now) {
        eligibleOrderIds.push(order.id);
      } else if (!nextBatchDate || readyDate < new Date(nextBatchDate)) {
        nextBatchDate = readyDate.toISOString();
      }

      mappedOrders.push({
        id: order.id,
        userId: order.userId,
        totalAmount: Number(order.totalAmount) || 0,
        customerName: order.customerName || order.customerEmail || `Customer #${order.userId}`,
        customerEmail: order.customerEmail || '',
        createdAt: order.createdAt,
        batchReadyDate: order.batchReadyDate,
        isEligible,
        shippingAddress: safeJsonParse(order.shippingAddress),
      });
    }

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

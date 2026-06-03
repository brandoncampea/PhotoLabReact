import express from 'express';
import jwt from 'jsonwebtoken';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query, tableExists, columnExists } = mssql;
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeCodePayload = (row) => ({
  id: Number(row.id),
  code: String(row.code || ''),
  description: String(row.description || ''),
  discountType: row.discountType,
  discountValue: toNumber(row.discountValue),
  applicationType: row.applicationType,
  applicableProductIds: Array.isArray(row.applicableProductIds) ? row.applicableProductIds.map(Number).filter(Boolean) : [],
  bundleQuantity: row.bundleQuantity == null ? undefined : toNumber(row.bundleQuantity),
  bundlePrice: row.bundlePrice == null ? undefined : toNumber(row.bundlePrice),
  applicableCategoryNames: parseJsonArray(row.applicableCategoryNames).map((entry) => String(entry || '').trim()).filter(Boolean),
  applicableAlbumIds: parseJsonArray(row.applicableAlbumIds).map(Number).filter(Boolean),
  startDate: row.startDate || null,
  expirationDate: row.expirationDate || null,
  minSubtotal: row.minSubtotal == null ? undefined : toNumber(row.minSubtotal),
  isOneTimeUse: !!row.isOneTimeUse,
  usageCount: toNumber(row.usageCount),
  maxUsages: row.maxUsages == null ? undefined : toNumber(row.maxUsages),
  perCustomerLimit: row.perCustomerLimit == null ? undefined : toNumber(row.perCustomerLimit),
  firstOrderOnly: !!row.firstOrderOnly,
  isActive: !!row.isActive,
  createdDate: row.createdDate,
  studioId: row.studioId == null ? undefined : toNumber(row.studioId),
  validationMessage: row.validationMessage || undefined,
});

const ensureDiscountSchema = async () => {
  const hasDiscountCodes = await tableExists('discount_codes');
  if (!hasDiscountCodes) {
    await query(`
      CREATE TABLE discount_codes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(255) UNIQUE NOT NULL,
        description NVARCHAR(MAX) NULL,
        discount_type NVARCHAR(50) NOT NULL,
        discount_value FLOAT NOT NULL DEFAULT 0,
        application_type NVARCHAR(50) NOT NULL DEFAULT 'entire-order',
        bundle_quantity INT NULL,
        bundle_price FLOAT NULL,
        applicable_category_names NVARCHAR(MAX) NULL,
        applicable_album_ids NVARCHAR(MAX) NULL,
        start_date DATETIME2 NULL,
        expiration_date DATETIME2 NULL,
        min_subtotal FLOAT NULL,
        is_one_time_use BIT NOT NULL DEFAULT 0,
        usage_count INT NOT NULL DEFAULT 0,
        max_usages INT NULL,
        per_customer_limit INT NULL,
        first_order_only BIT NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        studio_id INT NULL,
        validation_message NVARCHAR(500) NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='application_type') ALTER TABLE discount_codes ADD application_type NVARCHAR(50) NOT NULL DEFAULT 'entire-order'`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='bundle_quantity') ALTER TABLE discount_codes ADD bundle_quantity INT NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='bundle_price') ALTER TABLE discount_codes ADD bundle_price FLOAT NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='applicable_category_names') ALTER TABLE discount_codes ADD applicable_category_names NVARCHAR(MAX) NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='applicable_album_ids') ALTER TABLE discount_codes ADD applicable_album_ids NVARCHAR(MAX) NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='start_date') ALTER TABLE discount_codes ADD start_date DATETIME2 NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='min_subtotal') ALTER TABLE discount_codes ADD min_subtotal FLOAT NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='per_customer_limit') ALTER TABLE discount_codes ADD per_customer_limit INT NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='first_order_only') ALTER TABLE discount_codes ADD first_order_only BIT NOT NULL DEFAULT 0`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='studio_id') ALTER TABLE discount_codes ADD studio_id INT NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='validation_message') ALTER TABLE discount_codes ADD validation_message NVARCHAR(500) NULL`);
  await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='updated_at') ALTER TABLE discount_codes ADD updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP`);

  const hasDiscountCodeProducts = await tableExists('discount_code_products');
  if (!hasDiscountCodeProducts) {
    await query(`
      CREATE TABLE discount_code_products (
        discount_code_id INT NOT NULL FOREIGN KEY REFERENCES discount_codes(id) ON DELETE CASCADE,
        product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE CASCADE,
        CONSTRAINT pk_discount_code_products PRIMARY KEY (discount_code_id, product_id)
      )
    `);
  }

  const hasAuditTable = await tableExists('discount_code_audit');
  if (!hasAuditTable) {
    await query(`
      CREATE TABLE discount_code_audit (
        id INT IDENTITY(1,1) PRIMARY KEY,
        discount_code_id INT NULL,
        action NVARCHAR(50) NOT NULL,
        actor_user_id INT NULL,
        actor_role NVARCHAR(50) NULL,
        payload NVARCHAR(MAX) NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
};

const resolveOptionalUser = async (req) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = Number(payload.userId);
    if (!userId) return null;
    const userRow = await queryRow('SELECT id, role, studio_id as studioId, email FROM users WHERE id = $1', [userId]);
    if (!userRow) return null;
    return {
      id: Number(userRow.id),
      role: userRow.role,
      studioId: userRow.studioId == null ? null : Number(userRow.studioId),
      email: userRow.email,
    };
  } catch {
    return null;
  }
};

const resolveStudioIdFromItems = async (items = []) => {
  let studioId = null;
  for (const item of items) {
    const photoId = Number(item?.photo?.id || item?.photoId || item?.photoIds?.[0] || 0);
    if (!photoId) continue;
    const row = await queryRow(
      `SELECT a.studio_id as studioId
       FROM photos p
       INNER JOIN albums a ON a.id = p.album_id
       WHERE p.id = $1`,
      [photoId]
    );
    if (!row?.studioId) continue;
    if (studioId && Number(row.studioId) !== Number(studioId)) {
      throw new Error('Discounts cannot be applied across multiple studios');
    }
    studioId = Number(row.studioId);
  }
  return studioId;
};

const loadApplicableProductIds = async (discountCodeId) => {
  const rows = await queryRows(
    `SELECT product_id as productId
     FROM discount_code_products
     WHERE discount_code_id = $1`,
    [discountCodeId]
  );
  return rows.map((row) => Number(row.productId)).filter(Boolean);
};

const loadCodeById = async (discountCodeId) => {
  const row = await queryRow(
    `SELECT id,
            code,
            description,
            discount_type as discountType,
            discount_value as discountValue,
            application_type as applicationType,
            bundle_quantity as bundleQuantity,
            bundle_price as bundlePrice,
            applicable_category_names as applicableCategoryNames,
            applicable_album_ids as applicableAlbumIds,
            start_date as startDate,
            expiration_date as expirationDate,
            min_subtotal as minSubtotal,
            is_one_time_use as isOneTimeUse,
            usage_count as usageCount,
            max_usages as maxUsages,
            per_customer_limit as perCustomerLimit,
            first_order_only as firstOrderOnly,
            is_active as isActive,
            studio_id as studioId,
            validation_message as validationMessage,
            created_at as createdDate
     FROM discount_codes
     WHERE id = $1`,
    [discountCodeId]
  );
  if (!row) return null;
  return normalizeCodePayload({ ...row, applicableProductIds: await loadApplicableProductIds(discountCodeId) });
};

const getUsageStats = async (codeText) => {
  const row = await queryRow(
    `SELECT COUNT(*) as useCount,
            COUNT(DISTINCT o.id) as orderCount,
            COUNT(DISTINCT o.user_id) as customerCount,
            MIN(o.created_at) as firstUse,
            MAX(o.created_at) as lastUse,
            COALESCE(SUM(CASE
              WHEN o.discount_code IS NOT NULL AND o.discount_code <> ''
              THEN ABS((COALESCE(o.subtotal, 0) + COALESCE(o.tax_amount, 0)) - COALESCE(o.total, 0))
              ELSE 0
            END), 0) as totalCostToStudio
     FROM orders o
     WHERE UPPER(o.discount_code) = UPPER($1)`,
    [codeText]
  );

  return {
    useCount: toNumber(row?.useCount),
    orderCount: toNumber(row?.orderCount),
    customerCount: toNumber(row?.customerCount),
    firstUse: row?.firstUse || undefined,
    lastUse: row?.lastUse || undefined,
    totalCostToStudio: toNumber(row?.totalCostToStudio),
  };
};

const enrichCode = async (code) => ({ ...code, couponStats: await getUsageStats(code.code) });

const recordAudit = async ({ discountCodeId = null, action, actorUserId = null, actorRole = null, payload = null }) => {
  await query(
    `INSERT INTO discount_code_audit (discount_code_id, action, actor_user_id, actor_role, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [discountCodeId, action, actorUserId, actorRole, payload ? JSON.stringify(payload) : null]
  );
};

const summarizeDiscount = (discount, discountAmount) => {
  if (discount.discountType === 'free-shipping') return `Free shipping applied (${discount.code})`;
  if (discount.discountType === 'bundle-price') return `${discount.bundleQuantity} for $${Number(discount.bundlePrice || 0).toFixed(2)} with ${discount.code}`;
  if (discount.discountType === 'percentage') return `${discount.discountValue}% off with ${discount.code}`;
  return `$${discountAmount.toFixed(2)} off with ${discount.code}`;
};

const validateDiscountForCart = async ({ codeText, studioId, items = [], subtotal = 0, shippingCost = 0, userId = null }) => {
  await ensureDiscountSchema();
  const normalizedCodeText = String(codeText || '').trim();
  if (!normalizedCodeText) return { valid: false, reason: 'Enter a discount code.', discountAmount: 0 };

  const effectiveStudioId = studioId || await resolveStudioIdFromItems(items);
  const row = effectiveStudioId
    ? await queryRow(
        `SELECT TOP 1 id, code, description, discount_type as discountType, discount_value as discountValue,
          application_type as applicationType, bundle_quantity as bundleQuantity, bundle_price as bundlePrice, applicable_category_names as applicableCategoryNames,
                applicable_album_ids as applicableAlbumIds, start_date as startDate, expiration_date as expirationDate,
                min_subtotal as minSubtotal, is_one_time_use as isOneTimeUse, usage_count as usageCount,
                max_usages as maxUsages, per_customer_limit as perCustomerLimit, first_order_only as firstOrderOnly,
                is_active as isActive, studio_id as studioId, validation_message as validationMessage, created_at as createdDate
         FROM discount_codes
         WHERE UPPER(code) = UPPER($1) AND studio_id = $2`,
        [normalizedCodeText, effectiveStudioId]
      )
    : await queryRow(
        `SELECT TOP 1 id, code, description, discount_type as discountType, discount_value as discountValue,
          application_type as applicationType, bundle_quantity as bundleQuantity, bundle_price as bundlePrice, applicable_category_names as applicableCategoryNames,
                applicable_album_ids as applicableAlbumIds, start_date as startDate, expiration_date as expirationDate,
                min_subtotal as minSubtotal, is_one_time_use as isOneTimeUse, usage_count as usageCount,
                max_usages as maxUsages, per_customer_limit as perCustomerLimit, first_order_only as firstOrderOnly,
                is_active as isActive, studio_id as studioId, validation_message as validationMessage, created_at as createdDate
         FROM discount_codes
         WHERE UPPER(code) = UPPER($1)`,
        [normalizedCodeText]
      );

  if (!row) return { valid: false, reason: 'This discount code was not found.', discountAmount: 0 };

  const discount = normalizeCodePayload({ ...row, applicableProductIds: await loadApplicableProductIds(row.id) });
  if (!discount.isActive) return { valid: false, reason: discount.validationMessage || 'This discount code is inactive.', discountAmount: 0 };

  const now = new Date();
  if (discount.startDate && new Date(discount.startDate) > now) return { valid: false, reason: 'This discount code is not active yet.', discountAmount: 0 };
  if (discount.expirationDate && new Date(discount.expirationDate) < now) return { valid: false, reason: 'This discount code has expired.', discountAmount: 0 };
  if (discount.minSubtotal != null && subtotal < discount.minSubtotal) return { valid: false, reason: `A minimum subtotal of $${discount.minSubtotal.toFixed(2)} is required.`, discountAmount: 0 };

  const usageStats = await getUsageStats(discount.code);
  if (discount.maxUsages != null && usageStats.useCount >= discount.maxUsages) {
    return { valid: false, reason: 'This discount code has reached its maximum number of uses.', discountAmount: 0 };
  }

  if (userId) {
    const userUsage = await queryRow(`SELECT COUNT(*) as useCount FROM orders WHERE user_id = $1 AND UPPER(discount_code) = UPPER($2)`, [userId, discount.code]);
    const priorOrders = await queryRow(`SELECT COUNT(*) as orderCount FROM orders WHERE user_id = $1`, [userId]);
    const customerUseCount = toNumber(userUsage?.useCount);
    if (discount.isOneTimeUse && customerUseCount > 0) return { valid: false, reason: 'This code can only be used once per customer.', discountAmount: 0 };
    if (discount.perCustomerLimit != null && customerUseCount >= discount.perCustomerLimit) return { valid: false, reason: 'You have already used this code the maximum number of times.', discountAmount: 0 };
    if (discount.firstOrderOnly && toNumber(priorOrders?.orderCount) > 0) return { valid: false, reason: 'This discount is only available on a first order.', discountAmount: 0 };
  }

  if (discount.discountType === 'bundle-price') {
    if (discount.applicationType !== 'specific-products') {
      return { valid: false, reason: 'Bundle pricing discounts must target specific products.', discountAmount: 0 };
    }
    if (!discount.bundleQuantity || discount.bundleQuantity < 2) {
      return { valid: false, reason: 'This bundle discount is not configured correctly.', discountAmount: 0 };
    }
    if (discount.bundlePrice == null || discount.bundlePrice < 0) {
      return { valid: false, reason: 'This bundle price is not configured correctly.', discountAmount: 0 };
    }
  }

  let eligibleSubtotal = 0;
  let matchedItemCount = 0;
  if (discount.applicationType === 'shipping' || discount.discountType === 'free-shipping') {
    eligibleSubtotal = Math.max(0, shippingCost);
    matchedItemCount = eligibleSubtotal > 0 ? 1 : 0;
  } else {
    const productIds = Array.from(new Set(items.map((item) => Number(item.productId || 0)).filter(Boolean)));
    const productMap = new Map();
    for (const productId of productIds) {
      const product = await queryRow('SELECT id, category FROM products WHERE id = $1', [productId]);
      if (product) productMap.set(Number(product.id), String(product.category || '').trim().toLowerCase());
    }

    const albumMap = new Map();
    for (const item of items) {
      const photoId = Number(item?.photo?.id || item?.photoId || item?.photoIds?.[0] || 0);
      if (!photoId || albumMap.has(photoId)) continue;
      const photo = await queryRow('SELECT album_id as albumId FROM photos WHERE id = $1', [photoId]);
      albumMap.set(photoId, Number(photo?.albumId || item?.photo?.albumId || 0));
    }

    const applicableCategorySet = new Set((discount.applicableCategoryNames || []).map((entry) => String(entry).trim().toLowerCase()));
    const applicableAlbumSet = new Set((discount.applicableAlbumIds || []).map(Number));
    const applicableProductSet = new Set((discount.applicableProductIds || []).map(Number));
    const bundleGroups = new Map();

    for (const item of items) {
      const quantity = Math.max(1, toNumber(item.quantity, 1));
      const unitPrice = toNumber(item.price);
      const lineTotal = unitPrice * quantity;
      const productId = Number(item.productId || 0);
      const photoId = Number(item?.photo?.id || item?.photoId || item?.photoIds?.[0] || 0);
      const albumId = Number(item?.photo?.albumId || albumMap.get(photoId) || 0);
      const category = String(productMap.get(productId) || '').toLowerCase();

      let matches = false;
      if (discount.applicationType === 'entire-order') matches = true;
      if (discount.applicationType === 'specific-products') matches = applicableProductSet.has(productId);
      if (discount.applicationType === 'specific-categories') matches = applicableCategorySet.has(category);
      if (discount.applicationType === 'specific-albums') matches = applicableAlbumSet.has(albumId);

      if (matches) {
        eligibleSubtotal += lineTotal;
        matchedItemCount += quantity;
        if (discount.discountType === 'bundle-price') {
          const key = `${productId}:${unitPrice.toFixed(2)}`;
          const existingGroup = bundleGroups.get(key) || { quantity: 0, unitPrice, subtotal: 0 };
          existingGroup.quantity += quantity;
          existingGroup.subtotal += lineTotal;
          bundleGroups.set(key, existingGroup);
        }
      }
    }

    if (discount.discountType === 'bundle-price') {
      let discountAmount = 0;
      let bundleCount = 0;
      for (const group of bundleGroups.values()) {
        const groupBundleCount = Math.floor(toNumber(group.quantity) / Number(discount.bundleQuantity || 0));
        if (groupBundleCount <= 0) continue;
        const bundledUnits = groupBundleCount * Number(discount.bundleQuantity || 0);
        const regularPrice = toNumber(group.unitPrice) * bundledUnits;
        const bundlePriceTotal = toNumber(discount.bundlePrice) * groupBundleCount;
        discountAmount += Math.max(0, regularPrice - bundlePriceTotal);
        bundleCount += groupBundleCount;
      }

      if (bundleCount <= 0 || discountAmount <= 0) {
        return {
          valid: false,
          reason: discount.validationMessage || `Add at least ${discount.bundleQuantity} eligible items to use this bundle deal.`,
          discountAmount: 0,
        };
      }

      return {
        valid: true,
        code: { ...discount, couponStats: usageStats },
        discountAmount: Math.max(0, discountAmount),
        eligibleSubtotal,
        matchedItemCount,
        summary: summarizeDiscount(discount, Math.max(0, discountAmount)),
      };
    }
  }

  if (eligibleSubtotal <= 0) return { valid: false, reason: discount.validationMessage || 'This discount does not apply to the current cart.', discountAmount: 0 };

  let discountAmount = 0;
  if (discount.discountType === 'free-shipping') discountAmount = Math.max(0, shippingCost);
  else if (discount.discountType === 'percentage') discountAmount = eligibleSubtotal * (discount.discountValue / 100);
  else discountAmount = Math.min(discount.discountValue, eligibleSubtotal);

  return {
    valid: true,
    code: { ...discount, couponStats: usageStats },
    discountAmount: Math.max(0, discountAmount),
    eligibleSubtotal,
    matchedItemCount,
    summary: summarizeDiscount(discount, Math.max(0, discountAmount)),
  };
};

const resolveAdminStudioId = (req) => {
  if (req.user?.role === 'super_admin') {
    return Number(req.query.studioId || req.body?.studioId || req.user?.acting_studio_id || 0) || null;
  }
  return Number(req.user?.studio_id || 0) || null;
};

router.get('/public', async (req, res) => {
  try {
    await ensureDiscountSchema();

    const studioSlug = String(req.query?.studioSlug || '').trim();
    if (!studioSlug) {
      return res.status(400).json({ error: 'studioSlug is required' });
    }

    const hasPublicSlug = await columnExists('studios', 'public_slug');
    if (!hasPublicSlug) {
      return res.json([]);
    }

    const studio = await queryRow(
      'SELECT TOP 1 id FROM studios WHERE public_slug = $1',
      [studioSlug]
    );

    if (!studio?.id) {
      return res.json([]);
    }

    const rows = await queryRows(
      `SELECT id,
              code,
              description,
              discount_type as discountType,
              discount_value as discountValue,
              application_type as applicationType,
              bundle_quantity as bundleQuantity,
              bundle_price as bundlePrice,
              start_date as startDate,
              expiration_date as expirationDate,
              min_subtotal as minSubtotal,
              first_order_only as firstOrderOnly,
              max_usages as maxUsages,
              usage_count as usageCount
       FROM discount_codes
       WHERE studio_id = $1
         AND is_active = 1
         AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_TIMESTAMP)
         AND (max_usages IS NULL OR usage_count < max_usages)
       ORDER BY
         CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
         expiration_date ASC,
         created_at DESC`,
      [Number(studio.id)]
    );

    const deals = rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code || ''),
      description: String(row.description || ''),
      discountType: row.discountType,
      discountValue: toNumber(row.discountValue),
      applicationType: row.applicationType,
      bundleQuantity: row.bundleQuantity == null ? null : toNumber(row.bundleQuantity),
      bundlePrice: row.bundlePrice == null ? null : toNumber(row.bundlePrice),
      startDate: row.startDate || null,
      expirationDate: row.expirationDate || null,
      minSubtotal: row.minSubtotal == null ? null : toNumber(row.minSubtotal),
      firstOrderOnly: !!row.firstOrderOnly,
      maxUsages: row.maxUsages == null ? null : toNumber(row.maxUsages),
      usageCount: toNumber(row.usageCount),
    }));

    return res.json(deals);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load studio deals' });
  }
});

router.get('/', adminRequired, async (req, res) => {
  try {
    await ensureDiscountSchema();
    const studioId = resolveAdminStudioId(req);
    const rows = req.user?.role === 'super_admin' && !studioId
      ? await queryRows(`SELECT id, code, description, discount_type as discountType, discount_value as discountValue, application_type as applicationType, bundle_quantity as bundleQuantity, bundle_price as bundlePrice, applicable_category_names as applicableCategoryNames, applicable_album_ids as applicableAlbumIds, start_date as startDate, expiration_date as expirationDate, min_subtotal as minSubtotal, is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages, per_customer_limit as perCustomerLimit, first_order_only as firstOrderOnly, is_active as isActive, studio_id as studioId, validation_message as validationMessage, created_at as createdDate FROM discount_codes ORDER BY created_at DESC`)
      : await queryRows(`SELECT id, code, description, discount_type as discountType, discount_value as discountValue, application_type as applicationType, bundle_quantity as bundleQuantity, bundle_price as bundlePrice, applicable_category_names as applicableCategoryNames, applicable_album_ids as applicableAlbumIds, start_date as startDate, expiration_date as expirationDate, min_subtotal as minSubtotal, is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages, per_customer_limit as perCustomerLimit, first_order_only as firstOrderOnly, is_active as isActive, studio_id as studioId, validation_message as validationMessage, created_at as createdDate FROM discount_codes WHERE studio_id = $1 ORDER BY created_at DESC`, [studioId]);

    const result = [];
    for (const row of rows) {
      result.push(await enrichCode(normalizeCodePayload({ ...row, applicableProductIds: await loadApplicableProductIds(row.id) })));
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load discount codes' });
  }
});

router.post('/validate', async (req, res) => {
  try {
    const optionalUser = await resolveOptionalUser(req);
    const validation = await validateDiscountForCart({
      codeText: req.body?.code,
      studioId: toNumber(req.body?.studioId, 0) || optionalUser?.studioId || null,
      items: Array.isArray(req.body?.items) ? req.body.items : [],
      subtotal: toNumber(req.body?.subtotal),
      shippingCost: toNumber(req.body?.shippingCost),
      userId: optionalUser?.id || null,
    });
    res.json(validation);
  } catch (error) {
    res.status(500).json({ valid: false, reason: error.message || 'Failed to validate discount code', discountAmount: 0 });
  }
});

router.post('/best', async (req, res) => {
  try {
    const optionalUser = await resolveOptionalUser(req);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const requestedStudioId = toNumber(req.body?.studioId, 0) || null;
    const resolvedStudioId = requestedStudioId || optionalUser?.studioId || await resolveStudioIdFromItems(items);

    if (!resolvedStudioId) {
      return res.json({ valid: false, reason: 'Unable to determine studio for discount search.', discountAmount: 0 });
    }

    const candidates = await queryRows(
      `SELECT code
       FROM discount_codes
       WHERE studio_id = $1
         AND is_active = 1
         AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_TIMESTAMP)
       ORDER BY created_at DESC`,
      [resolvedStudioId]
    );

    let best = null;
    for (const candidate of candidates) {
      const validation = await validateDiscountForCart({
        codeText: candidate.code,
        studioId: resolvedStudioId,
        items,
        subtotal: toNumber(req.body?.subtotal),
        shippingCost: toNumber(req.body?.shippingCost),
        userId: optionalUser?.id || null,
      });

      if (!validation.valid) continue;
      if (!best || Number(validation.discountAmount) > Number(best.discountAmount)) {
        best = validation;
      }
    }

    if (!best) {
      return res.json({ valid: false, reason: 'No eligible discounts found for this cart.', discountAmount: 0, searchedCount: candidates.length });
    }

    return res.json({
      ...best,
      searchedCount: candidates.length,
    });
  } catch (error) {
    res.status(500).json({ valid: false, reason: error.message || 'Failed to find best discount', discountAmount: 0 });
  }
});

router.post('/:id/duplicate', adminRequired, async (req, res) => {
  try {
    await ensureDiscountSchema();
    const existing = await loadCodeById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Discount code not found' });
    const studioId = resolveAdminStudioId(req);
    if (studioId && existing.studioId !== studioId) return res.status(403).json({ error: 'Forbidden' });

    let suffix = 2;
    let nextCode = `${existing.code}-COPY`;
    while (await queryRow('SELECT id FROM discount_codes WHERE UPPER(code) = UPPER($1)', [nextCode])) {
      nextCode = `${existing.code}-COPY-${suffix}`;
      suffix += 1;
    }

    const inserted = await queryRow(`INSERT INTO discount_codes (code, description, discount_type, discount_value, application_type, bundle_quantity, bundle_price, applicable_category_names, applicable_album_ids, start_date, expiration_date, min_subtotal, is_one_time_use, max_usages, per_customer_limit, first_order_only, is_active, studio_id, validation_message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`, [nextCode, existing.description, existing.discountType, existing.discountValue, existing.applicationType, existing.bundleQuantity || null, existing.bundlePrice || null, JSON.stringify(existing.applicableCategoryNames || []), JSON.stringify(existing.applicableAlbumIds || []), existing.startDate || null, existing.expirationDate || null, existing.minSubtotal || null, existing.isOneTimeUse, existing.maxUsages || null, existing.perCustomerLimit || null, existing.firstOrderOnly, false, existing.studioId || studioId, existing.validationMessage || null]);

    for (const productId of existing.applicableProductIds || []) {
      await query(`INSERT INTO discount_code_products (discount_code_id, product_id) VALUES ($1, $2)`, [inserted.id, productId]);
    }

    await recordAudit({ discountCodeId: inserted.id, action: 'duplicate', actorUserId: req.user?.id || null, actorRole: req.user?.role || null, payload: { sourceId: existing.id, sourceCode: existing.code } });
    res.status(201).json(await enrichCode(await loadCodeById(inserted.id)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to duplicate discount code' });
  }
});

router.get('/:id', adminRequired, async (req, res) => {
  try {
    await ensureDiscountSchema();
    const code = await loadCodeById(req.params.id);
    if (!code) return res.status(404).json({ error: 'Discount code not found' });
    const studioId = resolveAdminStudioId(req);
    if (studioId && code.studioId !== studioId) return res.status(403).json({ error: 'Forbidden' });
    res.json(await enrichCode(code));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load discount code' });
  }
});

router.post('/', adminRequired, async (req, res) => {
  try {
    await ensureDiscountSchema();
    const studioId = resolveAdminStudioId(req);
    if (!studioId) return res.status(403).json({ error: 'Studio ID required' });

    const codeText = String(req.body?.code || '').trim().toUpperCase();
    if (!codeText) return res.status(400).json({ error: 'Code is required' });
    const existing = await queryRow('SELECT id FROM discount_codes WHERE UPPER(code) = UPPER($1)', [codeText]);
    if (existing) return res.status(409).json({ error: 'A discount code with that code already exists.' });

    if (req.body?.discountType === 'bundle-price' && (!Number(req.body?.bundleQuantity) || Number(req.body?.bundleQuantity) < 2 || req.body?.bundlePrice == null || Number(req.body?.bundlePrice) < 0)) {
      return res.status(400).json({ error: 'Bundle discounts require a quantity of at least 2 and a valid bundle price.' });
    }

    const inserted = await queryRow(`INSERT INTO discount_codes (code, description, discount_type, discount_value, application_type, bundle_quantity, bundle_price, applicable_category_names, applicable_album_ids, start_date, expiration_date, min_subtotal, is_one_time_use, max_usages, per_customer_limit, first_order_only, is_active, studio_id, validation_message, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP) RETURNING id`, [codeText, req.body?.description || '', req.body?.discountType || 'percentage', req.body?.discountType === 'free-shipping' || req.body?.discountType === 'bundle-price' ? 0 : toNumber(req.body?.discountValue), req.body?.discountType === 'bundle-price' ? 'specific-products' : (req.body?.applicationType || 'entire-order'), req.body?.discountType === 'bundle-price' ? toNumber(req.body?.bundleQuantity) : null, req.body?.discountType === 'bundle-price' ? toNumber(req.body?.bundlePrice) : null, JSON.stringify(Array.isArray(req.body?.applicableCategoryNames) ? req.body.applicableCategoryNames : []), JSON.stringify(Array.isArray(req.body?.applicableAlbumIds) ? req.body.applicableAlbumIds : []), req.body?.startDate || null, req.body?.expirationDate || null, req.body?.minSubtotal == null || req.body?.minSubtotal === '' ? null : toNumber(req.body?.minSubtotal), !!req.body?.isOneTimeUse, req.body?.maxUsages == null || req.body?.maxUsages === '' ? null : toNumber(req.body?.maxUsages), req.body?.perCustomerLimit == null || req.body?.perCustomerLimit === '' ? null : toNumber(req.body?.perCustomerLimit), !!req.body?.firstOrderOnly, req.body?.isActive !== false, studioId, req.body?.validationMessage || null]);

    const applicableProductIds = Array.isArray(req.body?.applicableProductIds) ? req.body.applicableProductIds.map(Number).filter(Boolean) : [];
    for (const productId of applicableProductIds) {
      await query(`INSERT INTO discount_code_products (discount_code_id, product_id) VALUES ($1, $2)`, [inserted.id, productId]);
    }

    await recordAudit({ discountCodeId: inserted.id, action: 'create', actorUserId: req.user?.id || null, actorRole: req.user?.role || null, payload: { code: codeText } });
    res.status(201).json(await enrichCode(await loadCodeById(inserted.id)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create discount code' });
  }
});

router.put('/:id', adminRequired, async (req, res) => {
  try {
    await ensureDiscountSchema();
    const existing = await loadCodeById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Discount code not found' });
    const studioId = resolveAdminStudioId(req);
    if (studioId && existing.studioId !== studioId) return res.status(403).json({ error: 'Forbidden' });

    if (req.body?.discountType === 'bundle-price' && (!Number(req.body?.bundleQuantity) || Number(req.body?.bundleQuantity) < 2 || req.body?.bundlePrice == null || Number(req.body?.bundlePrice) < 0)) {
      return res.status(400).json({ error: 'Bundle discounts require a quantity of at least 2 and a valid bundle price.' });
    }

    await query(`UPDATE discount_codes SET description = $1, discount_type = $2, discount_value = $3, application_type = $4, bundle_quantity = $5, bundle_price = $6, applicable_category_names = $7, applicable_album_ids = $8, start_date = $9, expiration_date = $10, min_subtotal = $11, is_one_time_use = $12, max_usages = $13, per_customer_limit = $14, first_order_only = $15, is_active = $16, validation_message = $17, updated_at = CURRENT_TIMESTAMP WHERE id = $18`, [req.body?.description || '', req.body?.discountType || existing.discountType, (req.body?.discountType || existing.discountType) === 'free-shipping' || (req.body?.discountType || existing.discountType) === 'bundle-price' ? 0 : toNumber(req.body?.discountValue, existing.discountValue), (req.body?.discountType || existing.discountType) === 'bundle-price' ? 'specific-products' : (req.body?.applicationType || existing.applicationType), (req.body?.discountType || existing.discountType) === 'bundle-price' ? toNumber(req.body?.bundleQuantity, existing.bundleQuantity) : null, (req.body?.discountType || existing.discountType) === 'bundle-price' ? toNumber(req.body?.bundlePrice, existing.bundlePrice) : null, JSON.stringify(Array.isArray(req.body?.applicableCategoryNames) ? req.body.applicableCategoryNames : []), JSON.stringify(Array.isArray(req.body?.applicableAlbumIds) ? req.body.applicableAlbumIds : []), req.body?.startDate || null, req.body?.expirationDate || null, req.body?.minSubtotal == null || req.body?.minSubtotal === '' ? null : toNumber(req.body?.minSubtotal), !!req.body?.isOneTimeUse, req.body?.maxUsages == null || req.body?.maxUsages === '' ? null : toNumber(req.body?.maxUsages), req.body?.perCustomerLimit == null || req.body?.perCustomerLimit === '' ? null : toNumber(req.body?.perCustomerLimit), !!req.body?.firstOrderOnly, req.body?.isActive !== false, req.body?.validationMessage || null, req.params.id]);

    await query('DELETE FROM discount_code_products WHERE discount_code_id = $1', [req.params.id]);
    const applicableProductIds = Array.isArray(req.body?.applicableProductIds) ? req.body.applicableProductIds.map(Number).filter(Boolean) : [];
    for (const productId of applicableProductIds) {
      await query(`INSERT INTO discount_code_products (discount_code_id, product_id) VALUES ($1, $2)`, [req.params.id, productId]);
    }

    await recordAudit({ discountCodeId: Number(req.params.id), action: 'update', actorUserId: req.user?.id || null, actorRole: req.user?.role || null, payload: { code: existing.code } });
    res.json(await enrichCode(await loadCodeById(req.params.id)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update discount code' });
  }
});

router.post('/:id/use', async (req, res) => {
  try {
    await ensureDiscountSchema();
    await query('UPDATE discount_codes SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to increment usage count' });
  }
});

router.delete('/:id', adminRequired, async (req, res) => {
  try {
    await ensureDiscountSchema();
    const existing = await loadCodeById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Discount code not found' });
    const studioId = resolveAdminStudioId(req);
    if (studioId && existing.studioId !== studioId) return res.status(403).json({ error: 'Forbidden' });

    await recordAudit({ discountCodeId: Number(req.params.id), action: 'delete', actorUserId: req.user?.id || null, actorRole: req.user?.role || null, payload: { code: existing.code } });
    await query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
    res.json({ message: 'Discount code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete discount code' });
  }
});

export default router;
export { validateDiscountForCart };

import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { authRequired } from '../middleware/auth.js';
import { calculateWhccShippingQuote, getWhccRubricSummary, setWhccShippingRubric } from '../services/whccShippingCostService.js';

const router = express.Router();

router.use(authRequired);

const ensureShippingConfigSchema = async () => {
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
    isActive: Boolean(config.is_active),
    batchShippingAddress: config.batch_shipping_address ? JSON.parse(config.batch_shipping_address) : null,
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
    await ensureShippingConfigSchema();
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
    await ensureShippingConfigSchema();
    const studioId = resolveStudioId(req);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    const current = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
    const { batchDeadline, directShippingCharge, directPricingMode, directFlatFee, isActive, batchShippingAddress } = req.body;
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
            is_active = $6,
            batch_shipping_address = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      END
      ELSE
      BEGIN
        INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, direct_pricing_mode, direct_flat_fee, is_active, batch_shipping_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      END
    `, [
      studioId,
      nextBatchDeadline,
      nextDirectShippingCharge,
      nextDirectPricingMode,
      nextDirectFlatFee,
      !!nextIsActive,
      nextBatchShippingAddress,
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
    await setWhccShippingRubric(matrix);
    const rubric = await getWhccRubricSummary();
    res.json(rubric);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quote shipping cost using WHCC rubric + studio pricing policy
router.post('/quote', async (req, res) => {
  try {
    await ensureShippingConfigSchema();

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

    const quote = calculateWhccShippingQuote({
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

export default router;

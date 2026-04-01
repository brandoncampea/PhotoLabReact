import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, query } = mssql;
import { authRequired } from '../middleware/auth.js';

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
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_shipping_config_id')
    BEGIN
      ALTER TABLE shipping_config DROP CONSTRAINT ck_shipping_config_id
    END
  `);
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
    if (!config) {
      return res.json({
        id: Number(studioId),
        batchDeadline: '',
        directShippingCharge: 0,
        isActive: true,
        batchShippingAddress: null,
      });
    }
    // Transform to camelCase for frontend
    res.json({
      id: config.id,
      batchDeadline: config.batch_deadline,
      directShippingCharge: config.direct_shipping_charge,
      isActive: Boolean(config.is_active),
      batchShippingAddress: config.batch_shipping_address ? JSON.parse(config.batch_shipping_address) : null,
    });
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
    const { batchDeadline, directShippingCharge, isActive, batchShippingAddress } = req.body;
    const nextBatchDeadline = batchDeadline ?? current?.batch_deadline ?? '';
    const nextDirectShippingCharge = directShippingCharge ?? current?.direct_shipping_charge ?? 0;
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
            is_active = $4,
            batch_shipping_address = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      END
      ELSE
      BEGIN
        INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active, batch_shipping_address)
        VALUES ($1, $2, $3, $4, $5)
      END
    `, [studioId, nextBatchDeadline, nextDirectShippingCharge, !!nextIsActive, nextBatchShippingAddress]);
    const updated = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
    res.json({
      id: updated.id,
      batchDeadline: updated.batch_deadline,
      directShippingCharge: updated.direct_shipping_charge,
      isActive: Boolean(updated.is_active),
      batchShippingAddress: updated.batch_shipping_address ? JSON.parse(updated.batch_shipping_address) : null,
    });
  } catch (error) {
    console.error('Error updating shipping config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

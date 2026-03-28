import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, query } = mssql;

const router = express.Router();

// Get shipping configuration (studio-specific, super admin can specify studioId)
router.get('/config', async (req, res) => {
  try {
    const user = req.user;
    let studioId = user?.role === 'super_admin' ? (req.query.studioId || null) : user?.studio_id;
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    const config = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
    if (!config) {
      return res.status(404).json({ error: 'Shipping config not found' });
    }
    // Transform to camelCase for frontend
    res.json({
      id: config.id,
      batchDeadline: config.batch_deadline,
      directShippingCharge: config.direct_shipping_charge,
      isActive: Boolean(config.is_active),
    });
  } catch (error) {
    console.error('Error fetching shipping config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update shipping configuration (studio-specific, super admin can specify studioId)
router.put('/config', async (req, res) => {
  try {
    const user = req.user;
    let studioId = user?.role === 'super_admin' ? (req.body.studioId || null) : user?.studio_id;
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    const { batchDeadline, directShippingCharge, isActive } = req.body;
    await query(`
      IF EXISTS (SELECT 1 FROM shipping_config WHERE id = $1)
      BEGIN
        UPDATE shipping_config
        SET batch_deadline = $2,
            direct_shipping_charge = $3,
            is_active = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      END
      ELSE
      BEGIN
        INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active)
        VALUES ($1, $2, $3, $4)
      END
    `, [studioId, batchDeadline, directShippingCharge, !!isActive]);
    const updated = await queryRow('SELECT * FROM shipping_config WHERE id = $1', [studioId]);
    res.json(updated);
  } catch (error) {
    console.error('Error updating shipping config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

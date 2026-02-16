import express from 'express';
import { queryRow, query } from '../mssql.js';

const router = express.Router();

// Get shipping configuration
router.get('/config', async (req, res) => {
  try {
    const config = await queryRow('SELECT * FROM shipping_config WHERE id = 1');
    
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

// Update shipping configuration
router.put('/config', async (req, res) => {
  try {
    const { batchDeadline, directShippingCharge, isActive } = req.body;
    
    await query(`
      IF EXISTS (SELECT 1 FROM shipping_config WHERE id = 1)
      BEGIN
        UPDATE shipping_config
        SET batch_deadline = $1,
            direct_shipping_charge = $2,
            is_active = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      END
      ELSE
      BEGIN
        INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active)
        VALUES (1, $1, $2, $3)
      END
    `, [batchDeadline, directShippingCharge, !!isActive]);
    
    const updated = await queryRow('SELECT * FROM shipping_config WHERE id = 1');
    res.json(updated);
  } catch (error) {
    console.error('Error updating shipping config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

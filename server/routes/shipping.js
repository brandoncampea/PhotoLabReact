import express from 'express';
import { db } from '../database.js';

const router = express.Router();

// Get shipping configuration
router.get('/config', (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM shipping_config WHERE id = 1').get();
    
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
router.put('/config', (req, res) => {
  try {
    const { batchDeadline, directShippingCharge, isActive } = req.body;
    
    // Ensure config exists
    const existing = db.prepare('SELECT * FROM shipping_config WHERE id = 1').get();
    
    if (!existing) {
      // Create if doesn't exist
      db.prepare(`
        INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active)
        VALUES (1, ?, ?, ?)
      `).run(batchDeadline, directShippingCharge, isActive ? 1 : 0);
    } else {
      // Update existing
      db.prepare(`
        UPDATE shipping_config
        SET batch_deadline = ?, direct_shipping_charge = ?, is_active = ?
        WHERE id = 1
      `).run(batchDeadline, directShippingCharge, isActive ? 1 : 0);
    }
    
    const updated = db.prepare('SELECT * FROM shipping_config WHERE id = 1').get();
    res.json(updated);
  } catch (error) {
    console.error('Error updating shipping config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

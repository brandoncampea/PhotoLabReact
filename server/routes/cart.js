import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get user cart
router.get('/', (req, res) => {
  try {
    const userId = req.query.userId || 0; // Default to anonymous user
    const cart = db.prepare(`
      SELECT cart_data as cartData
      FROM user_cart
      WHERE user_id = ? OR id = 1
      LIMIT 1
    `).get(userId);

    if (cart && cart.cartData) {
      res.json(JSON.parse(cart.cartData));
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save user cart
router.post('/', (req, res) => {
  try {
    const userId = req.body.userId || 0;
    const cartData = JSON.stringify(req.body.items || []);

    db.prepare(`
      INSERT INTO user_cart (user_id, cart_data)
      VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        cart_data = excluded.cart_data,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId || null, cartData);

    res.json({ success: true, message: 'Cart saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear user cart
router.delete('/', (req, res) => {
  try {
    const userId = req.query.userId || 0;
    db.prepare('DELETE FROM user_cart WHERE user_id = ?').run(userId);
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

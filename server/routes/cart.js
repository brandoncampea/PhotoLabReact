import express from 'express';
import { db } from '../database.js';
import { authRequired } from '../middleware/auth.js';
const router = express.Router();

// Protect all cart routes
router.use(authRequired);

// Get user cart
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const cart = db.prepare(
      'SELECT cart_data as cartData FROM user_cart WHERE user_id = ? LIMIT 1'
    ).get(userId);
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
    const userId = req.user.id;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const cartData = JSON.stringify(items);
    db.prepare(`
      INSERT INTO user_cart (user_id, cart_data)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        cart_data = excluded.cart_data,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, cartData);
    res.json({ success: true, message: 'Cart saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear user cart
router.delete('/', (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    db.prepare('DELETE FROM user_cart WHERE user_id = ?').run(userId);
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

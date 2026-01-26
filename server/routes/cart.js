import express from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper to extract user from JWT token (optional)
const getOptionalUser = (req) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: Number(payload.userId), email: payload.email };
  } catch {
    return null;
  }
};

// Get user cart (optional auth)
router.get('/', (req, res) => {
  try {
    const user = getOptionalUser(req);
    const userId = user?.id;
    
    // If no user, return empty cart
    if (!userId) {
      return res.json([]);
    }
    
    // Verify user exists in database
    const userExists = db.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').get(userId);
    if (!userExists) {
      return res.json([]);
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
    console.error('Cart GET error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save user cart (optional auth)
router.post('/', (req, res) => {
  try {
    const user = getOptionalUser(req);
    const userId = user?.id;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    
    // If no user, still return success (frontend will use localStorage)
    if (!userId) {
      return res.json({ success: true, message: 'Cart saved (local only)' });
    }
    
    // Verify user exists in database before trying to insert cart
    const userExists = db.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').get(userId);
    if (!userExists) {
      // User doesn't exist, just return success (frontend will use localStorage)
      return res.json({ success: true, message: 'Cart saved (user not verified, local only)' });
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
    console.error('Cart POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear user cart (optional auth)
router.delete('/', (req, res) => {
  try {
    const user = getOptionalUser(req);
    const userId = user?.id;
    
    // If no user, still return success
    if (!userId) {
      return res.json({ success: true, message: 'Cart cleared (local only)' });
    }
    
    db.prepare('DELETE FROM user_cart WHERE user_id = ?').run(userId);
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    console.error('Cart DELETE error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

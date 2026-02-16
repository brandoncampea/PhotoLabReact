import express from 'express';
import jwt from 'jsonwebtoken';
import { queryRow, query } from '../mssql.js';

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
router.get('/', async (req, res) => {
  try {
    const user = getOptionalUser(req);
    const userId = user?.id;
    
    // If no user, return empty cart
    if (!userId) {
      return res.json([]);
    }
    
    // Verify user exists in database
    const userExists = await queryRow('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (!userExists) {
      return res.json([]);
    }
    
    const cart = await queryRow(
      'SELECT cart_data as cartData FROM user_cart WHERE user_id = $1 LIMIT 1',
      [userId]
    );
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
router.post('/', async (req, res) => {
  try {
    const user = getOptionalUser(req);
    const userId = user?.id;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    
    // If no user, still return success (frontend will use localStorage)
    if (!userId) {
      return res.json({ success: true, message: 'Cart saved (local only)' });
    }
    
    // Verify user exists in database before trying to insert cart
    const userExists = await queryRow('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (!userExists) {
      // User doesn't exist, just return success (frontend will use localStorage)
      return res.json({ success: true, message: 'Cart saved (user not verified, local only)' });
    }
    
    const cartData = JSON.stringify(items);
    await query(`
      IF EXISTS (SELECT 1 FROM user_cart WHERE user_id = $1)
      BEGIN
        UPDATE user_cart
        SET cart_data = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      END
      ELSE
      BEGIN
        INSERT INTO user_cart (user_id, cart_data)
        VALUES ($1, $2)
      END
    `, [userId, cartData]);
    res.json({ success: true, message: 'Cart saved' });
  } catch (error) {
    console.error('Cart POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear user cart (optional auth)
router.delete('/', async (req, res) => {
  try {
    const user = getOptionalUser(req);
    const userId = user?.id;
    
    // If no user, still return success
    if (!userId) {
      return res.json({ success: true, message: 'Cart cleared (local only)' });
    }
    
    await query('DELETE FROM user_cart WHERE user_id = $1', [userId]);
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    console.error('Cart DELETE error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

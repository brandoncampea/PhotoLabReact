import express from 'express';
import jwt from 'jsonwebtoken';
import mssql from '../mssql.cjs';
const { queryRow, query, tableExists } = mssql;

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
    const hasCartTable = await tableExists('user_cart');
    if (!hasCartTable) {
      return res.json([]);
    }

    const user = getOptionalUser(req);
    const userId = user?.id;
    
    // If no user, return empty cart
    if (!userId) {
      return res.json([]);
    }
    
    // Verify user exists in database
    const userExists = await queryRow('SELECT TOP 1 id FROM users WHERE id = $1', [userId]);
    if (!userExists) {
      return res.json([]);
    }
    
    const cart = await queryRow(
      'SELECT TOP 1 cart_data as cartData FROM user_cart WHERE user_id = $1',
      [userId]
    );
    let items = [];
    if (cart && cart.cartData) {
      try {
        items = JSON.parse(cart.cartData);
      } catch {}
    }

    // Enrich each cart item with product_image_url and category_image_url
    for (const item of items) {
      if (item.productId) {
        // Get product image and category image
        const productRow = await queryRow(
          `SELECT p.id, p.category, p.image_url as product_image_url, c.image_url as category_image_url
           FROM products p
           LEFT JOIN categories c ON c.name = p.category
           WHERE p.id = $1`,
          [item.productId]
        );
        if (productRow) {
          item.product_image_url = productRow.product_image_url || null;
          item.category_image_url = productRow.category_image_url || null;
        } else {
          item.product_image_url = null;
          item.category_image_url = null;
        }
      } else {
        item.product_image_url = null;
        item.category_image_url = null;
      }
    }
    res.json(items);
  } catch (error) {
    console.error('Cart GET error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save user cart (optional auth)
router.post('/', async (req, res) => {
  try {
    const hasCartTable = await tableExists('user_cart');
    if (!hasCartTable) {
      return res.json({ success: true, message: 'Cart saved (table unavailable, local only)' });
    }

    const user = getOptionalUser(req);
    const userId = user?.id;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    
    // If no user, still return success (frontend will use localStorage)
    if (!userId) {
      return res.json({ success: true, message: 'Cart saved (local only)' });
    }
    
    // Verify user exists in database before trying to insert cart
    const userExists = await queryRow('SELECT TOP 1 id FROM users WHERE id = $1', [userId]);
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
    const hasCartTable = await tableExists('user_cart');
    if (!hasCartTable) {
      return res.json({ success: true, message: 'Cart cleared (table unavailable, local only)' });
    }

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


// Add item to cart (for Playwright and legacy compatibility)
router.post('/add', async (req, res) => {
  try {
    const user = getOptionalUser(req);
    const userId = user?.id;
    const { productId, quantity = 1 } = req.body;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    // Verify user exists
    const userExists = await queryRow('SELECT TOP 1 id FROM users WHERE id = $1', [userId]);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Get current cart
    const cartRow = await queryRow('SELECT TOP 1 cart_data as cartData FROM user_cart WHERE user_id = $1', [userId]);
    let cart = [];
    if (cartRow && cartRow.cartData) {
      try { cart = JSON.parse(cartRow.cartData); } catch {}
    }
    // Add or update item
    const idx = cart.findIndex(item => item.productId === productId);
    if (idx >= 0) {
      cart[idx].quantity = (cart[idx].quantity || 1) + quantity;
    } else {
      cart.push({ productId, quantity });
    }
    const cartData = JSON.stringify(cart);
    await query(`
      IF EXISTS (SELECT 1 FROM user_cart WHERE user_id = $1)
      BEGIN
        UPDATE user_cart SET cart_data = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1
      END
      ELSE
      BEGIN
        INSERT INTO user_cart (user_id, cart_data) VALUES ($1, $2)
      END
    `, [userId, cartData]);
    res.json({ success: true, cart });
  } catch (error) {
    console.error('Cart ADD error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

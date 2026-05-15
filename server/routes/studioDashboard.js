import express from 'express';
import mssql from '../mssql.cjs';
const { queryRows, queryRow } = mssql;
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// GET: Number of customers with products in cart for a studio
router.get('/customers-with-cart', adminRequired, async (req, res) => {
  try {
    const studioId = req.user.studio_id;
    if (!studioId) return res.status(400).json({ error: 'Missing studio_id' });
    // Find all users for this studio
    const users = await queryRows('SELECT id FROM users WHERE studio_id = $1', [studioId]);
    if (!users.length) return res.json({ count: 0 });
    const userIds = users.map(u => u.id);
    // Find all user_cart rows for these users with non-empty cart_data
    const inParams = userIds.map((_, i) => `$${i + 1}`).join(',');
    const cartRows = await queryRows(
      `SELECT user_id, cart_data FROM user_cart WHERE user_id IN (${inParams})`,
      userIds
    );
    // Count users with at least one product in their cart
    let count = 0;
    for (const row of cartRows) {
      try {
        const items = JSON.parse(row.cart_data);
        if (Array.isArray(items) && items.length > 0) count++;
      } catch {}
    }
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

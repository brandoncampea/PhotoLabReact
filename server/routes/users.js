import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Admin: list users (basic fields only)
router.get('/', adminRequired, async (req, res) => {
  try {
    let queryText = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.role, 
        u.is_active as isActive, 
        u.created_at as createdAt,
        u.last_login_at as lastLoginAt,
        COUNT(DISTINCT o.id) as totalOrders,
        COALESCE(SUM(o.total), 0) as totalSpent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
    `;
    
    // studio_admin can only see users in their own studio
    if (req.user.role === 'studio_admin') {
      queryText += ` WHERE u.studio_id = $1`;
    }
    
    queryText += ` GROUP BY u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at ORDER BY u.created_at DESC`;
    
    const users = req.user.role === 'studio_admin' 
      ? await queryRows(queryText, [req.user.studio_id])
      : await queryRows(queryText);
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: update a user's role / status
router.put('/:id', adminRequired, async (req, res) => {
  try {
    const { role, isActive, name } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (typeof role === 'string' && role.trim()) {
      updates.push(`role = $${idx++}`);
      params.push(role.trim());
    }
    if (typeof isActive === 'boolean') {
      updates.push(`is_active = $${idx++}`);
      params.push(isActive);
    }
    if (typeof name === 'string' && name.trim()) {
      updates.push(`name = $${idx++}`);
      params.push(name.trim());
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    params.push(req.params.id);
    const idParam = `$${idx}`;
    
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ${idParam}`, params);
    
    // Fetch aggregated data
    const aggregated = await queryRow(`
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.role, 
        u.is_active as isActive, 
        u.created_at as createdAt,
        u.last_login_at as lastLoginAt,
        COUNT(DISTINCT o.id) as totalOrders,
        COALESCE(SUM(o.total), 0) as totalSpent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.id = $1
      GROUP BY u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at
    `, [req.params.id]);
    
    res.json(aggregated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

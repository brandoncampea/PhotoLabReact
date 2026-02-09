import express from 'express';
import { db } from '../database.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Admin: list users (basic fields only)
router.get('/', adminRequired, (req, res) => {
  try {
    let query = `
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
      query += ` WHERE u.studio_id = ?`;
    }
    
    query += ` GROUP BY u.id ORDER BY u.created_at DESC`;
    
    const users = req.user.role === 'studio_admin' 
      ? db.prepare(query).all(req.user.studio_id)
      : db.prepare(query).all();
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: update a user's role / status
router.put('/:id', adminRequired, (req, res) => {
  try {
    const { role, isActive, name } = req.body;
    const updates = [];
    const params = [];

    if (typeof role === 'string' && role.trim()) {
      updates.push('role = ?');
      params.push(role.trim());
    }
    if (typeof isActive === 'boolean') {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (typeof name === 'string' && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    params.push(req.params.id);
    
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    // Fetch aggregated data
    const aggregated = db.prepare(`
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
      WHERE u.id = ?
      GROUP BY u.id
    `).get(req.params.id);
    
    res.json(aggregated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

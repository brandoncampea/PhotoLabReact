import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Admin: list users (basic fields only)

// Enhanced: include watchedPlayers for each user
router.get('/', adminRequired, async (req, res) => {
  try {
    let queryText = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.role, 
        u.studio_id as studioId,
        s.name as studioName,
        u.is_active as isActive, 
        u.created_at as createdAt,
        u.last_login_at as lastLoginAt,
        COUNT(DISTINCT o.id) as totalOrders,
        COALESCE(SUM(o.total), 0) as totalSpent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      LEFT JOIN studios s ON u.studio_id = s.id
    `;
    if (req.user.role === 'studio_admin') {
      queryText += ` WHERE u.studio_id = $1`;
    }
    queryText += ` GROUP BY u.id, u.email, u.name, u.role, u.studio_id, s.id, s.name, u.is_active, u.created_at, u.last_login_at ORDER BY u.created_at DESC`;
    let users;
    try {
      users = req.user.role === 'studio_admin' 
        ? await queryRows(queryText, [req.user.studio_id])
        : await queryRows(queryText);
    } catch (queryError) {
      return res.status(500).json({ error: 'Database query failed', details: queryError.message });
    }

    // Fetch watched players for all users in one query
    const userIds = users.map(u => u.id);
    let watchlistRows = [];
    if (userIds.length > 0) {
      // MSSQL: use @p1, @p2, ... for each userId
      const inParams = userIds.map((_, i) => `@p${i + 1}`).join(',');
      watchlistRows = await queryRows(
        `SELECT user_id, player_name FROM customer_player_watchlist WHERE user_id IN (${inParams})`,
        userIds
      );
    }
    // Map userId -> array of player names
    const watchMap = {};
    for (const row of watchlistRows) {
      if (!watchMap[row.user_id]) watchMap[row.user_id] = [];
      watchMap[row.user_id].push(row.player_name);
    }
    // Attach watchedPlayers to each user
    const usersWithWatch = users.map(u => ({
      ...u,
      watchedPlayers: watchMap[u.id] || []
    }));
    res.json(usersWithWatch);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: update a user's role / status
router.put('/:id', adminRequired, async (req, res) => {
  try {
    const { role, isActive, name } = req.body;
    
    // Only super_admin can promote users to super_admin or studio_admin
    if ((role === 'super_admin' || role === 'studio_admin') && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can assign super_admin or studio_admin roles' });
    }
    
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

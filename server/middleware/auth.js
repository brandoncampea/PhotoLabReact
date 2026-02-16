import jwt from 'jsonwebtoken';
import { queryRow } from '../mssql.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const authRequired = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = Number(payload.userId);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    let role = 'customer';
    let studio_id = null;
    try {
      const userRow = await queryRow('SELECT role, studio_id FROM users WHERE id = $1', [userId]);
      if (userRow && userRow.role) role = userRow.role;
      if (userRow && userRow.studio_id) studio_id = userRow.studio_id;
    } catch {}
    // Allow env-based override (useful in dev) even when role column exists
    let admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (admins.length === 0) {
      admins = ['admin@photolab.com'];
    }
    if (admins.includes((payload.email || '').toLowerCase())) role = 'admin';
    req.user = { id: userId, email: payload.email, role, studio_id };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const adminRequired = async (req, res, next) => {
  await authRequired(req, res, () => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'studio_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
};

// Require studio admin or super admin (for reports)
export const requireStudioOrSuperAdmin = async (req, res, next) => {
  await authRequired(req, res, () => {
    if (req.user?.role !== 'studio_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Studio or super admin access required' });
    }
    next();
  });
};

// Require super admin only (for super admin reports)
export const requireSuperAdmin = async (req, res, next) => {
  await authRequired(req, res, () => {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
};
import jwt from 'jsonwebtoken';
import mssql from '../mssql.cjs';
const { queryRow } = mssql;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const authRequired = async (req, res, next) => {
  console.log('[AUTH REQUIRED] Called for', req.method, req.originalUrl, 'headers:', req.headers);
  console.log('[AUTH REQUIRED] req.session:', req.session);
  // 1. Check for session-based authentication
  if (req.session && req.session.userId) {
    try {
      const userRow = await queryRow('SELECT id, email, role, studio_id FROM users WHERE id = $1', [req.session.userId]);
      if (!userRow) return res.status(401).json({ error: 'User not found' });
      req.user = {
        id: userRow.id,
        email: userRow.email,
        role: userRow.role,
        studio_id: userRow.studio_id
      };
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load user info' });
    }
  }

  // 2. Fallback: Check for JWT in Authorization header
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
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
    if (role === 'customer' && admins.includes((payload.email || '').toLowerCase())) {
      role = 'admin';
    }

    let acting_studio_id = null;
    const actingStudioIdRaw = req.headers['x-acting-studio-id'];
    const actingStudioId = Number(Array.isArray(actingStudioIdRaw) ? actingStudioIdRaw[0] : actingStudioIdRaw);
    if (role === 'super_admin' && Number.isInteger(actingStudioId) && actingStudioId > 0) {
      const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [actingStudioId]);
      if (studio) {
        acting_studio_id = actingStudioId;
        studio_id = actingStudioId;
      }
    }

    req.user = { id: userId, email: payload.email, role, studio_id, acting_studio_id };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const adminRequired = async (req, res, next) => {
  // In non-production, prefer real auth context when a token is present.
  // DO NOT fall back to dev user - always require explicit authentication.
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, JWT_SECRET);
      const userId = Number(payload.userId);
      if (!userId) {
        throw new Error('Invalid token payload');
      }

      let role = 'customer';
      let studio_id = null;
      const userRow = await queryRow('SELECT role, studio_id FROM users WHERE id = $1', [userId]);
      if (userRow?.role) role = userRow.role;
      if (userRow?.studio_id) studio_id = userRow.studio_id;

      let admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (admins.length === 0) {
        admins = ['admin@photolab.com'];
      }
      if (role === 'customer' && admins.includes((payload.email || '').toLowerCase())) {
        role = 'admin';
      }

      let acting_studio_id = null;
      const actingStudioIdRaw = req.headers['x-acting-studio-id'];
      const actingStudioId = Number(Array.isArray(actingStudioIdRaw) ? actingStudioIdRaw[0] : actingStudioIdRaw);
      if (role === 'super_admin' && Number.isInteger(actingStudioId) && actingStudioId > 0) {
        const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [actingStudioId]);
        if (studio) {
          acting_studio_id = actingStudioId;
          studio_id = actingStudioId;
        }
      }

      req.user = { id: userId, email: payload.email, role, studio_id, acting_studio_id };
      if (req.user?.role !== 'admin' && req.user?.role !== 'studio_admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
  
  // No token provided - always return 401
  return res.status(401).json({ error: 'Authentication required' });
};

export const superAdminRequired = async (req, res, next) => {
  await authRequired(req, res, () => {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
};

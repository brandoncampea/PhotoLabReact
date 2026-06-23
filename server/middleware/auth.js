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

// Short-lived in-process cache for user role/studio lookups and studio existence checks.
// Role and studio_id change rarely; 60s TTL avoids per-request DB hits while keeping
// the cache fresh enough that permission changes propagate quickly.
const USER_CACHE_TTL_MS = 60_000;
const STUDIO_CACHE_TTL_MS = 120_000;
const userCache = new Map(); // userId → { role, studio_id, ts }
const studioCache = new Map(); // studioId → { exists: bool, ts }

const getCachedUser = (userId) => {
  const entry = userCache.get(userId);
  if (entry && Date.now() - entry.ts < USER_CACHE_TTL_MS) return entry;
  return null;
};
const setCachedUser = (userId, role, studio_id) => {
  userCache.set(userId, { role, studio_id, ts: Date.now() });
};

const getCachedStudio = (studioId) => {
  const entry = studioCache.get(studioId);
  if (entry && Date.now() - entry.ts < STUDIO_CACHE_TTL_MS) return entry;
  return null;
};
const setCachedStudio = (studioId, exists) => {
  studioCache.set(studioId, { exists, ts: Date.now() });
};

// In-flight maps coalesce concurrent DB lookups for the same key so a burst of
// simultaneous requests (e.g. 5 parallel fetches on page load) only fires one query.
const userInflight = new Map();
const studioInflight = new Map();

const lookupUser = (userId) => {
  const cached = getCachedUser(userId);
  if (cached) return Promise.resolve({ role: cached.role, studio_id: cached.studio_id });
  if (userInflight.has(userId)) return userInflight.get(userId);
  const p = queryRow('SELECT role, studio_id FROM users WHERE id = $1', [userId])
    .then(row => {
      const result = { role: row?.role || 'customer', studio_id: row?.studio_id || null };
      setCachedUser(userId, result.role, result.studio_id);
      return result;
    })
    .finally(() => userInflight.delete(userId));
  userInflight.set(userId, p);
  return p;
};

const lookupStudio = (studioId) => {
  const cached = getCachedStudio(studioId);
  if (cached) return Promise.resolve(cached.exists);
  if (studioInflight.has(studioId)) return studioInflight.get(studioId);
  const p = queryRow('SELECT id FROM studios WHERE id = $1', [studioId])
    .then(r => { const exists = !!r; setCachedStudio(studioId, exists); return exists; })
    .finally(() => studioInflight.delete(studioId));
  studioInflight.set(studioId, p);
  return p;
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET env var is not set. Refusing to start.');
    process.exit(1);
  } else {
    console.warn('WARNING: JWT_SECRET is not set. Using insecure dev fallback.');
  }
}
const _JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-prod';

export const authRequired = async (req, res, next) => {
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
    const payload = jwt.verify(token, _JWT_SECRET);
    const userId = Number(payload.userId);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    let role = 'customer';
    let studio_id = null;
    try {
      const user = await lookupUser(userId);
      role = user.role;
      studio_id = user.studio_id;
    } catch {}
    // Allow env-based override (useful in dev) even when role column exists
    const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (admins.length > 0 && role === 'customer' && admins.includes((payload.email || '').toLowerCase())) {
      role = 'admin';
    }

    let acting_studio_id = null;
    const actingStudioIdRaw = req.headers['x-acting-studio-id'];
    const actingStudioId = Number(Array.isArray(actingStudioIdRaw) ? actingStudioIdRaw[0] : actingStudioIdRaw);
    if (role === 'super_admin' && Number.isInteger(actingStudioId) && actingStudioId > 0) {
      const studioExists = await lookupStudio(actingStudioId);
      if (studioExists) {
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
      const payload = jwt.verify(token, _JWT_SECRET);
      const userId = Number(payload.userId);
      if (!userId) {
        throw new Error('Invalid token payload');
      }

      let role = 'customer';
      let studio_id = null;
      const lookedUp = await lookupUser(userId);
      role = lookedUp.role;
      studio_id = lookedUp.studio_id;

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
        const studioExists = await lookupStudio(actingStudioId);
        if (studioExists) {
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

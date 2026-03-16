import { queryRow } from '../mssql.mjs';
import jwt from 'jsonwebtoken';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const BYTES_PER_GB = 1024 * 1024 * 1024;

const getStudioPlanLimits = async (subscriptionPlan) => {
  if (!subscriptionPlan) {
    return { maxAlbums: null, maxStorageGb: null };
  }

  const dbPlan = await queryRow(
    `SELECT TOP 1
        max_albums as maxAlbums,
        max_storage_gb as maxStorageGb
     FROM subscription_plans
     WHERE id = TRY_CAST($1 AS INT)
        OR LOWER(name) = LOWER($1)`,
    [String(subscriptionPlan)]
  );

  if (dbPlan) {
    return {
      maxAlbums: dbPlan.maxAlbums ?? null,
      maxStorageGb: dbPlan.maxStorageGb ?? null,
    };
  }

  const constantPlan = SUBSCRIPTION_PLANS[String(subscriptionPlan)];
  return {
    maxAlbums: constantPlan?.maxAlbums ?? null,
    maxStorageGb: null,
  };
};

export const getStudioQuotaSnapshot = async (studioId) => {
  const studio = await queryRow(
    `SELECT id,
            subscription_plan as subscriptionPlan,
            subscription_status as subscriptionStatus,
            is_free_subscription as isFreeSubscription
     FROM studios
     WHERE id = $1`,
    [studioId]
  );

  if (!studio) {
    throw new Error('Studio not found');
  }

  const limits = await getStudioPlanLimits(studio.subscriptionPlan);

  const usage = await queryRow(
    `SELECT
        (SELECT COUNT(*) FROM albums WHERE studio_id = $1) as albumCount,
        (SELECT ISNULL(SUM(COALESCE(p.file_size_bytes, 0)), 0)
         FROM photos p
         JOIN albums a ON a.id = p.album_id
         WHERE a.studio_id = $1) as usedStorageBytes`,
    [studioId]
  );

  return {
    studioId,
    subscriptionStatus: studio.subscriptionStatus,
    isFreeSubscription: Boolean(studio.isFreeSubscription),
    maxAlbums: limits.maxAlbums,
    maxStorageGb: limits.maxStorageGb,
    albumCount: Number(usage?.albumCount || 0),
    usedStorageBytes: Number(usage?.usedStorageBytes || 0),
  };
};

export const enforceAlbumQuotaForStudio = async (studioId) => {
  const quota = await getStudioQuotaSnapshot(studioId);
  if (quota.maxAlbums !== null && quota.albumCount >= Number(quota.maxAlbums)) {
    const error = new Error(`Album limit reached (${quota.maxAlbums}) for this studio plan.`);
    error.code = 'ALBUM_QUOTA_EXCEEDED';
    throw error;
  }
  return quota;
};

export const enforceStorageQuotaForStudio = async (studioId, additionalBytes = 0) => {
  const quota = await getStudioQuotaSnapshot(studioId);
  if (quota.maxStorageGb !== null) {
    const limitBytes = Number(quota.maxStorageGb) * BYTES_PER_GB;
    const projectedBytes = quota.usedStorageBytes + Number(additionalBytes || 0);
    if (projectedBytes > limitBytes) {
      const error = new Error(`Storage limit reached (${quota.maxStorageGb} GB) for this studio plan.`);
      error.code = 'STORAGE_QUOTA_EXCEEDED';
      throw error;
    }
  }
  return quota;
};

/**
 * Middleware to check if the user's studio has an active subscription
 * Blocks free/inactive studios from using protected features
 */
export const requireActiveSubscription = async (req, res, next) => {
  try {
    // Get user from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // Get user's studio
    const user = await queryRow('SELECT studio_id, role FROM users WHERE id = $1', [userId]);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const actingStudioIdRaw = req.headers['x-acting-studio-id'];
    const actingStudioId = Number(Array.isArray(actingStudioIdRaw) ? actingStudioIdRaw[0] : actingStudioIdRaw);
    const isActingStudio = user.role === 'super_admin' && Number.isInteger(actingStudioId) && actingStudioId > 0;

    const effectiveRole = isActingStudio ? 'studio_admin' : user.role;
    const effectiveStudioId = isActingStudio ? actingStudioId : user.studio_id;

    // Super admins bypass subscription checks when not acting as a studio
    if (effectiveRole === 'super_admin') {
      req.userId = userId;
      req.studioId = effectiveStudioId;
      return next();
    }

    // Customers don't need subscription (their studio does)
    if (effectiveRole === 'customer') {
      req.userId = userId;
      req.studioId = effectiveStudioId;
      return next();
    }

    // Check studio subscription for studio_admin and admin roles
    if (!effectiveStudioId) {
      return res.status(403).json({ 
        error: 'No studio associated with this account',
        requiresSubscription: true
      });
    }

    const studio = await queryRow(`
      SELECT subscription_status, is_free_subscription 
      FROM studios 
      WHERE id = $1
    `, [effectiveStudioId]);

    if (!studio) {
      return res.status(403).json({ error: 'Studio not found' });
    }

    // Check if subscription is active and not free
    if (studio.subscription_status !== 'active' || studio.is_free_subscription === true) {
      return res.status(403).json({ 
        error: 'Active subscription required. Please subscribe to use this feature.',
        requiresSubscription: true,
        subscriptionStatus: studio.subscription_status
      });
    }

    // All checks passed
    req.userId = userId;
    req.studioId = effectiveStudioId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: error.message });
  }
};

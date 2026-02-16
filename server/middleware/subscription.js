import { queryRow } from '../mssql.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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

    // Super admins bypass subscription checks
    if (user.role === 'super_admin') {
      req.userId = userId;
      req.studioId = user.studio_id;
      return next();
    }

    // Customers don't need subscription (their studio does)
    if (user.role === 'customer') {
      req.userId = userId;
      req.studioId = user.studio_id;
      return next();
    }

    // Check studio subscription for studio_admin and admin roles
    if (!user.studio_id) {
      return res.status(403).json({ 
        error: 'No studio associated with this account',
        requiresSubscription: true
      });
    }

    const studio = await queryRow(`
      SELECT subscription_status, is_free_subscription 
      FROM studios 
      WHERE id = $1
    `, [user.studio_id]);

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
    req.studioId = user.studio_id;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: error.message });
  }
};

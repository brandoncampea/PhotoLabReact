import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, query, tableExists } = mssql;
import { authRequired } from '../middleware/auth.js';
const router = express.Router();

const defaultProfile = {
  id: 1,
  ownerName: 'Photo Lab',
  businessName: 'PhotoLab Studio',
  email: 'admin@photolab.com',
  receiveOrderNotifications: true,
  logoUrl: '',
};

const ensureProfileConfigTable = async () => {
  const exists = await tableExists('profile_config');
  if (exists) return true;

  await query(`
    CREATE TABLE profile_config (
      id INT PRIMARY KEY,
      owner_name NVARCHAR(255) NULL,
      business_name NVARCHAR(255) NULL,
      email NVARCHAR(255) NULL,
      receive_order_notifications BIT DEFAULT 1,
      logo_url NVARCHAR(MAX) NULL,
      updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return true;
};

// Get profile config (studio-specific, super admin can specify studioId)
router.get('/', authRequired, async (req, res) => {
  try {
    await ensureProfileConfigTable();
    const user = req.user;
    let studioId;
    if (user?.role === 'super_admin') {
      studioId = req.query.studioId || null;
      // If no studioId specified, use global profile (id=1)
      if (!studioId) studioId = 1;
    } else {
      studioId = user?.studio_id;
      if (!studioId) {
        return res.status(403).json({ error: 'Studio ID required' });
      }
    }
    let profile = await queryRow(`
      SELECT id, owner_name as ownerName, business_name as businessName, 
             email, receive_order_notifications as receiveOrderNotifications, 
             logo_url as logoUrl
      FROM profile_config
      WHERE id = $1
    `, [studioId]);

    // Initialize if doesn't exist
    if (!profile) {
      await query(`
        IF NOT EXISTS (SELECT 1 FROM profile_config WHERE id = $1)
        BEGIN
          INSERT INTO profile_config (id, owner_name, business_name, email, receive_order_notifications, logo_url)
          VALUES ($1, 'John Smith', 'PhotoLab Studio', 'admin@photolab.com', 1, '')
        END
      `, [studioId]);
      profile = await queryRow(`
        SELECT id, owner_name as ownerName, business_name as businessName, 
               email, receive_order_notifications as receiveOrderNotifications, 
               logo_url as logoUrl
        FROM profile_config
        WHERE id = $1
      `, [studioId]);
    }
    res.json(profile || defaultProfile);
  } catch (error) {
    console.warn('Profile config unavailable, returning defaults:', error?.message || error);
    res.json(defaultProfile);
  }
});

// Update profile config (studio-specific, super admin can specify studioId)
router.put('/', authRequired, async (req, res) => {
  try {
    await ensureProfileConfigTable();
    const user = req.user;
    let studioId;
    if (user?.role === 'super_admin') {
      studioId = req.body.studioId || req.query.studioId || user?.acting_studio_id || 1;
    } else if (user?.role === 'admin') {
      studioId = user?.studio_id || 1;
    } else {
      studioId = user?.studio_id;
    }

    studioId = Number(studioId);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    const { ownerName, businessName, email, receiveOrderNotifications, logoUrl } = req.body;
    await query(`
      IF EXISTS (SELECT 1 FROM profile_config WHERE id = $1)
      BEGIN
        UPDATE profile_config
        SET owner_name = $2,
            business_name = $3,
            email = $4,
            receive_order_notifications = $5,
            logo_url = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      END
      ELSE
      BEGIN
        INSERT INTO profile_config (id, owner_name, business_name, email, receive_order_notifications, logo_url)
        VALUES ($1, $2, $3, $4, $5, $6)
      END
    `, [studioId, ownerName, businessName, email, !!receiveOrderNotifications, logoUrl]);
    const profile = await queryRow(`
      SELECT id, owner_name as ownerName, business_name as businessName, 
             email, receive_order_notifications as receiveOrderNotifications, 
             logo_url as logoUrl
      FROM profile_config
      WHERE id = $1
    `, [studioId]);
    res.json(profile || {
      ...defaultProfile,
      ownerName,
      businessName,
      email,
      receiveOrderNotifications: !!receiveOrderNotifications,
      logoUrl: logoUrl || '',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

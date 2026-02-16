import express from 'express';
import { queryRow, query } from '../mssql.js';
import { authRequired } from '../middleware/auth.js';
const router = express.Router();

// Get profile config
router.get('/', async (req, res) => {
  try {
    let profile = await queryRow(`
      SELECT id, owner_name as ownerName, business_name as businessName, 
             email, receive_order_notifications as receiveOrderNotifications, 
             logo_url as logoUrl
      FROM profile_config
      WHERE id = 1
    `);

    // Initialize if doesn't exist
    if (!profile) {
      await query(`
        IF NOT EXISTS (SELECT 1 FROM profile_config WHERE id = 1)
        BEGIN
          INSERT INTO profile_config (id, owner_name, business_name, email, receive_order_notifications, logo_url)
          VALUES (1, 'John Smith', 'PhotoLab Studio', 'admin@photolab.com', 1, '')
        END
      `);
      
      profile = await queryRow(`
        SELECT id, owner_name as ownerName, business_name as businessName, 
               email, receive_order_notifications as receiveOrderNotifications, 
               logo_url as logoUrl
        FROM profile_config
        WHERE id = 1
      `);
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update profile config
// Require auth to update profile config
router.put('/', authRequired, async (req, res) => {
  try {
    const { ownerName, businessName, email, receiveOrderNotifications, logoUrl } = req.body;

    await query(`
      IF EXISTS (SELECT 1 FROM profile_config WHERE id = 1)
      BEGIN
        UPDATE profile_config
        SET owner_name = $1,
            business_name = $2,
            email = $3,
            receive_order_notifications = $4,
            logo_url = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      END
      ELSE
      BEGIN
        INSERT INTO profile_config (id, owner_name, business_name, email, receive_order_notifications, logo_url)
        VALUES (1, $1, $2, $3, $4, $5)
      END
    `, [ownerName, businessName, email, !!receiveOrderNotifications, logoUrl]);

    const profile = await queryRow(`
      SELECT id, owner_name as ownerName, business_name as businessName, 
             email, receive_order_notifications as receiveOrderNotifications, 
             logo_url as logoUrl
      FROM profile_config
      WHERE id = 1
    `);

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

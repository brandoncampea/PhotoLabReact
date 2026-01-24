import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get profile config
router.get('/', (req, res) => {
  try {
    let profile = db.prepare(`
      SELECT id, owner_name as ownerName, business_name as businessName, 
             email, receive_order_notifications as receiveOrderNotifications, 
             logo_url as logoUrl
      FROM profile_config
      WHERE id = 1
    `).get();

    // Initialize if doesn't exist
    if (!profile) {
      db.prepare(`
        INSERT OR IGNORE INTO profile_config (id, owner_name, business_name, email, receive_order_notifications, logo_url)
        VALUES (1, 'John Smith', 'PhotoLab Studio', 'admin@photolab.com', 1, '')
      `).run();
      
      profile = db.prepare(`
        SELECT id, owner_name as ownerName, business_name as businessName, 
               email, receive_order_notifications as receiveOrderNotifications, 
               logo_url as logoUrl
        FROM profile_config
        WHERE id = 1
      `).get();
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update profile config
router.put('/', (req, res) => {
  try {
    const { ownerName, businessName, email, receiveOrderNotifications, logoUrl } = req.body;
    
    db.prepare(`
      INSERT INTO profile_config (id, owner_name, business_name, email, receive_order_notifications, logo_url, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET 
        owner_name = excluded.owner_name,
        business_name = excluded.business_name,
        email = excluded.email,
        receive_order_notifications = excluded.receive_order_notifications,
        logo_url = excluded.logo_url,
        updated_at = CURRENT_TIMESTAMP
    `).run(ownerName, businessName, email, receiveOrderNotifications ? 1 : 0, logoUrl);

    const profile = db.prepare(`
      SELECT id, owner_name as ownerName, business_name as businessName, 
             email, receive_order_notifications as receiveOrderNotifications, 
             logo_url as logoUrl
      FROM profile_config
      WHERE id = 1
    `).get();

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

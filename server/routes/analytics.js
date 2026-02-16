import express from 'express';
import { queryRow, query } from '../mssql.js';
const router = express.Router();

// Track event
router.post('/track', async (req, res) => {
  try {
    const { eventType, eventData } = req.body;
    await query(`
      INSERT INTO analytics (event_type, event_data)
      VALUES ($1, $2)
    `, [eventType, eventData ? JSON.stringify(eventData) : null]);
    
    res.status(201).json({ message: 'Event tracked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analytics summary
router.get('/summary', async (req, res) => {
  try {
    const totalVisitsResult = await queryRow("SELECT COUNT(*) as count FROM analytics WHERE event_type = 'site_visit'");
    const albumViewsResult = await queryRow("SELECT COUNT(*) as count FROM analytics WHERE event_type = 'album_view'");
    const photoViewsResult = await queryRow("SELECT COUNT(*) as count FROM analytics WHERE event_type = 'photo_view'");
    
    const summary = {
      totalVisits: parseInt(totalVisitsResult.count),
      albumViews: parseInt(albumViewsResult.count),
      photoViews: parseInt(photoViewsResult.count)
    };
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

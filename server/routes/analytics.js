import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Track event
router.post('/track', (req, res) => {
  try {
    const { eventType, eventData } = req.body;
    db.prepare(`
      INSERT INTO analytics (event_type, event_data)
      VALUES (?, ?)
    `).run(eventType, eventData ? JSON.stringify(eventData) : null);
    
    res.status(201).json({ message: 'Event tracked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analytics summary
router.get('/summary', (req, res) => {
  try {
    const totalVisitsResult = db.prepare("SELECT COUNT(*) as count FROM analytics WHERE event_type = 'site_visit'").get();
    const albumViewsResult = db.prepare("SELECT COUNT(*) as count FROM analytics WHERE event_type = 'album_view'").get();
    const photoViewsResult = db.prepare("SELECT COUNT(*) as count FROM analytics WHERE event_type = 'photo_view'").get();
    
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

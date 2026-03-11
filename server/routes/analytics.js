import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
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
    const totalVisitsResult = await queryRow("SELECT COUNT(*) AS count FROM analytics WHERE event_type = 'site_visit'");
    const albumViewsResult = await queryRow("SELECT COUNT(*) AS count FROM analytics WHERE event_type = 'album_view'");
    const photoViewsResult = await queryRow("SELECT COUNT(*) AS count FROM analytics WHERE event_type = 'photo_view'");

    const totalVisits = parseInt(totalVisitsResult?.count ?? 0) || 0;
    const albumViews = parseInt(albumViewsResult?.count ?? 0) || 0;
    const photoViews = parseInt(photoViewsResult?.count ?? 0) || 0;

    res.json({
      totalVisits,
      albumViews,
      photoViews,
      totalPageViews: totalVisits + albumViews + photoViews,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detailed analytics — per-album and per-photo breakdowns from DB
router.get('/details', async (req, res) => {
  try {
    const albumViewRows = await queryRows(`
      SELECT
        JSON_VALUE(event_data, '$.albumId') AS albumId,
        JSON_VALUE(event_data, '$.albumName') AS albumName,
        COUNT(*) AS views,
        MAX(created_at) AS lastViewed
      FROM analytics
      WHERE event_type = 'album_view' AND event_data IS NOT NULL
      GROUP BY JSON_VALUE(event_data, '$.albumId'), JSON_VALUE(event_data, '$.albumName')
      ORDER BY views DESC
    `);

    const photoViewRows = await queryRows(`
      SELECT
        JSON_VALUE(event_data, '$.photoId') AS photoId,
        JSON_VALUE(event_data, '$.photoFileName') AS photoFileName,
        JSON_VALUE(event_data, '$.albumId') AS albumId,
        JSON_VALUE(event_data, '$.albumName') AS albumName,
        COUNT(*) AS views,
        MAX(created_at) AS lastViewed
      FROM analytics
      WHERE event_type = 'photo_view' AND event_data IS NOT NULL
      GROUP BY
        JSON_VALUE(event_data, '$.photoId'),
        JSON_VALUE(event_data, '$.photoFileName'),
        JSON_VALUE(event_data, '$.albumId'),
        JSON_VALUE(event_data, '$.albumName')
      ORDER BY views DESC
    `);

    const recentRows = await queryRows(`
      SELECT TOP 50 id, event_type, event_data, created_at
      FROM analytics
      ORDER BY created_at DESC
    `);

    res.json({
      albumViews: albumViewRows.map(r => ({
        albumId: parseInt(r.albumId) || 0,
        albumName: r.albumName || 'Unknown',
        views: parseInt(r.views) || 0,
        lastViewed: r.lastViewed,
      })),
      photoViews: photoViewRows.map(r => ({
        photoId: parseInt(r.photoId) || 0,
        photoFileName: r.photoFileName || 'Unknown',
        albumId: parseInt(r.albumId) || 0,
        albumName: r.albumName || 'Unknown',
        views: parseInt(r.views) || 0,
        lastViewed: r.lastViewed,
      })),
      recentActivity: recentRows.map(r => {
        const data = r.event_data ? JSON.parse(r.event_data) : {};
        return { id: r.id, type: r.event_type, timestamp: r.created_at, ...data };
      }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
const router = express.Router();

const albumCoverUrl = (albumId, coverPhotoId, coverImageUrl) => {
  if (coverPhotoId) {
    return `/api/photos/${coverPhotoId}/asset?variant=full`;
  }
  if (coverImageUrl) {
    return `/api/photos/proxy?source=${encodeURIComponent(coverImageUrl)}`;
  }
  return undefined;
};

const photoAssetUrl = (photoId, variant) => `/api/photos/${photoId}/asset?variant=${variant}`;

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
    const totalVisitsResult = await queryRow(`
      SELECT COUNT(DISTINCT JSON_VALUE(event_data, '$.sessionId')) AS count
      FROM analytics
      WHERE event_type = 'site_visit'
    `);
    const totalPageViewsResult = await queryRow("SELECT COUNT(*) AS count FROM analytics WHERE event_type = 'page_view'");
    const albumViewsResult = await queryRow("SELECT COUNT(*) AS count FROM analytics WHERE event_type = 'album_view'");
    const photoViewsResult = await queryRow("SELECT COUNT(*) AS count FROM analytics WHERE event_type = 'photo_view'");

    const totalVisits = parseInt(totalVisitsResult?.count ?? 0) || 0;
    const totalPageViews = parseInt(totalPageViewsResult?.count ?? 0) || 0;
    const albumViews = parseInt(albumViewsResult?.count ?? 0) || 0;
    const photoViews = parseInt(photoViewsResult?.count ?? 0) || 0;

    res.json({
      totalVisits,
      albumViews,
      photoViews,
      totalPageViews,
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
        JSON_VALUE(an.event_data, '$.albumId') AS albumId,
        JSON_VALUE(an.event_data, '$.albumName') AS albumName,
        a.cover_photo_id as coverPhotoId,
        a.cover_image_url as coverImageUrl,
        COUNT(*) AS views,
        MAX(an.created_at) AS lastViewed
      FROM analytics an
      LEFT JOIN albums a
        ON a.id = TRY_CAST(JSON_VALUE(an.event_data, '$.albumId') AS INT)
      WHERE an.event_type = 'album_view' AND an.event_data IS NOT NULL
      GROUP BY JSON_VALUE(an.event_data, '$.albumId'), JSON_VALUE(an.event_data, '$.albumName'), a.cover_photo_id, a.cover_image_url
      ORDER BY views DESC
    `);

    const photoViewRows = await queryRows(`
      SELECT
        JSON_VALUE(an.event_data, '$.photoId') AS photoId,
        JSON_VALUE(an.event_data, '$.photoFileName') AS photoFileName,
        JSON_VALUE(an.event_data, '$.albumId') AS albumId,
        JSON_VALUE(an.event_data, '$.albumName') AS albumName,
        p.thumbnail_url as thumbnailUrl,
        p.full_image_url as fullImageUrl,
        COUNT(*) AS views,
        MAX(an.created_at) AS lastViewed
      FROM analytics an
      LEFT JOIN photos p
        ON p.id = TRY_CAST(JSON_VALUE(an.event_data, '$.photoId') AS INT)
      WHERE an.event_type = 'photo_view' AND an.event_data IS NOT NULL
      GROUP BY
        JSON_VALUE(an.event_data, '$.photoId'),
        JSON_VALUE(an.event_data, '$.photoFileName'),
        JSON_VALUE(an.event_data, '$.albumId'),
        JSON_VALUE(an.event_data, '$.albumName')
        , p.thumbnail_url
        , p.full_image_url
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
        coverImageUrl: albumCoverUrl(parseInt(r.albumId) || 0, parseInt(r.coverPhotoId) || 0, r.coverImageUrl),
      })),
      photoViews: photoViewRows.map(r => ({
        photoId: parseInt(r.photoId) || 0,
        photoFileName: r.photoFileName || 'Unknown',
        albumId: parseInt(r.albumId) || 0,
        albumName: r.albumName || 'Unknown',
        views: parseInt(r.views) || 0,
        lastViewed: r.lastViewed,
        thumbnailUrl: parseInt(r.photoId) ? photoAssetUrl(parseInt(r.photoId), 'thumbnail') : undefined,
        fullImageUrl: parseInt(r.photoId) ? photoAssetUrl(parseInt(r.photoId), 'full') : undefined,
      })),
      recentActivity: recentRows.map(r => {
        let data = {};
        if (r.event_data) {
          try {
            data = JSON.parse(r.event_data);
          } catch {
            data = {};
          }
        }
        return { id: r.id, type: r.event_type, timestamp: r.created_at, ...data };
      }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

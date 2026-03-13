import express from 'express';
import { queryRow, queryRows, query, tableExists } from '../mssql.js';
import { adminRequired } from '../middleware/auth.js';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions.js';
const router = express.Router();

const ensureAnalyticsTable = async () => {
  const exists = await tableExists('analytics');
  if (exists) return true;
  await query(`
    CREATE TABLE analytics (
      id INT IDENTITY(1,1) PRIMARY KEY,
      event_type NVARCHAR(100) NOT NULL,
      event_data NVARCHAR(MAX) NULL,
      created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return true;
};

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

const hasAdvancedAnalyticsAccess = async (req) => {
  if (req.user.role === 'super_admin' || req.user.role === 'admin') {
    return { allowed: true, reason: null, studio: null, plan: null };
  }

  if (req.user.role !== 'studio_admin' || !req.user.studio_id) {
    return { allowed: false, reason: 'Studio context is required', studio: null, plan: null };
  }

  const studio = await queryRow(
    `SELECT id, subscription_plan as subscriptionPlan, subscription_status as subscriptionStatus, is_free_subscription as isFreeSubscription
     FROM studios
     WHERE id = $1`,
    [req.user.studio_id]
  );

  const plan = studio?.subscriptionPlan ? SUBSCRIPTION_PLANS[studio.subscriptionPlan] : null;
  const allowed = !!plan && Array.isArray(plan.features) && plan.features.includes('Advanced analytics') && !studio?.isFreeSubscription;

  return {
    allowed,
    reason: allowed ? null : 'Advanced analytics require a Professional or Enterprise subscription',
    studio,
    plan,
  };
};

// Track event
router.post('/track', async (req, res) => {
  try {
    const { eventType, eventData } = req.body;
    await ensureAnalyticsTable();
    await query(`
      INSERT INTO analytics (event_type, event_data)
      VALUES ($1, $2)
    `, [eventType, eventData ? JSON.stringify(eventData) : null]);
    
    res.status(201).json({ message: 'Event tracked' });
  } catch (error) {
    console.warn('Analytics track skipped:', error?.message || error);
    res.status(202).json({ message: 'Event accepted (tracking unavailable)' });
  }
});

// Get analytics summary
router.get('/summary', async (req, res) => {
  try {
    const exists = await tableExists('analytics');
    if (!exists) {
      return res.json({
        totalVisits: 0,
        albumViews: 0,
        photoViews: 0,
        totalPageViews: 0,
      });
    }

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
    console.warn('Analytics summary unavailable:', error?.message || error);
    res.json({
      totalVisits: 0,
      albumViews: 0,
      photoViews: 0,
      totalPageViews: 0,
    });
  }
});

// Get revenue/profit breakdown for dashboard drill-down
router.get('/revenue-breakdown', adminRequired, async (req, res) => {
  try {
    const access = await hasAdvancedAnalyticsAccess(req);
    if (!access.allowed) {
      return res.status(403).json({
        error: access.reason,
        code: 'ADVANCED_ANALYTICS_REQUIRED',
        requiredPlans: ['professional', 'enterprise'],
        currentPlan: access.plan?.id || access.studio?.subscriptionPlan || null,
      });
    }

    const params = [];
    let studioFilter = '';

    if (req.user.role === 'studio_admin') {
      studioFilter = ' AND u.studio_id = $1';
      params.push(req.user.studio_id);
    }

    const baseWhere = `
      WHERE (o.status IS NULL OR LOWER(o.status) <> 'cancelled')
        ${studioFilter}
    `;

    const totals = await queryRow(
      `SELECT
         COALESCE(SUM(oi.price * oi.quantity), 0) as totalRevenue,
         COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as totalCost,
         COALESCE(SUM(oi.quantity), 0) as totalItems,
         COUNT(DISTINCT o.id) as totalOrders
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       INNER JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       ${baseWhere}`,
      params
    );

    const categoryBreakdown = await queryRows(
      `SELECT
         COALESCE(p.category, 'Uncategorized') as category,
         COALESCE(SUM(oi.price * oi.quantity), 0) as revenue,
         COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as cost,
         COALESCE(SUM(oi.quantity), 0) as quantity,
         COUNT(DISTINCT o.id) as orderCount
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       INNER JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       ${baseWhere}
       GROUP BY COALESCE(p.category, 'Uncategorized')
       ORDER BY revenue DESC`,
      params
    );

    const albumBreakdown = await queryRows(
      `SELECT
         a.id as albumId,
         COALESCE(a.title, a.name, CONCAT('Album #', a.id)) as albumName,
         COALESCE(a.category, 'Uncategorized') as albumCategory,
         COUNT(DISTINCT ph.id) as photoCount,
         COALESCE(SUM(oi.price * oi.quantity), 0) as revenue,
         COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as cost,
         COALESCE(SUM(oi.quantity), 0) as quantity,
         COUNT(DISTINCT o.id) as orderCount
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       INNER JOIN order_items oi ON oi.order_id = o.id
       INNER JOIN photos ph ON ph.id = oi.photo_id
       INNER JOIN albums a ON a.id = ph.album_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       ${baseWhere}
       GROUP BY a.id, a.title, a.name, a.category
       ORDER BY revenue DESC`,
      params
    );

    const productBreakdown = await queryRows(
      `SELECT
         p.id as productId,
         p.name as productName,
         COALESCE(p.category, 'Uncategorized') as category,
         COALESCE(SUM(oi.price * oi.quantity), 0) as revenue,
         COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as cost,
         COALESCE(SUM(oi.quantity), 0) as quantity,
         COUNT(DISTINCT o.id) as orderCount
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       INNER JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       ${baseWhere}
       GROUP BY p.id, p.name, p.category
       ORDER BY revenue DESC`,
      params
    );

    const sizeBreakdown = await queryRows(
      `SELECT
         p.id as productId,
         p.name as productName,
         ps.id as productSizeId,
         COALESCE(ps.size_name, 'Default') as sizeName,
         COALESCE(SUM(oi.price * oi.quantity), 0) as revenue,
         COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as cost,
         COALESCE(SUM(oi.quantity), 0) as quantity,
         COUNT(DISTINCT o.id) as orderCount
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       INNER JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       ${baseWhere}
       GROUP BY p.id, p.name, ps.id, ps.size_name
       ORDER BY revenue DESC`,
      params
    );

    const photoBreakdown = await queryRows(
      `SELECT
         a.id as albumId,
         COALESCE(a.title, a.name, CONCAT('Album #', a.id)) as albumName,
         ph.id as photoId,
         ph.file_name as fileName,
         COALESCE(SUM(oi.price * oi.quantity), 0) as revenue,
         COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as cost,
         COALESCE(SUM(oi.quantity), 0) as quantity,
         COUNT(DISTINCT o.id) as orderCount
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       INNER JOIN order_items oi ON oi.order_id = o.id
       INNER JOIN photos ph ON ph.id = oi.photo_id
       INNER JOIN albums a ON a.id = ph.album_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       ${baseWhere}
       GROUP BY a.id, a.title, a.name, ph.id, ph.file_name
       ORDER BY a.id ASC, revenue DESC`,
      params
    );

    res.json({
      summary: {
        totalRevenue: Number(totals?.totalRevenue) || 0,
        totalCost: Number(totals?.totalCost) || 0,
        totalProfit: (Number(totals?.totalRevenue) || 0) - (Number(totals?.totalCost) || 0),
        totalItems: Number(totals?.totalItems) || 0,
        totalOrders: Number(totals?.totalOrders) || 0,
      },
      byCategory: categoryBreakdown.map((row) => ({
        category: row.category || 'Uncategorized',
        revenue: Number(row.revenue) || 0,
        cost: Number(row.cost) || 0,
        profit: (Number(row.revenue) || 0) - (Number(row.cost) || 0),
        quantity: Number(row.quantity) || 0,
        orderCount: Number(row.orderCount) || 0,
      })),
      byAlbum: albumBreakdown.map((row) => ({
        albumId: Number(row.albumId) || 0,
        albumName: row.albumName || 'Unknown Album',
        albumCategory: row.albumCategory || 'Uncategorized',
        photoCount: Number(row.photoCount) || 0,
        revenue: Number(row.revenue) || 0,
        cost: Number(row.cost) || 0,
        profit: (Number(row.revenue) || 0) - (Number(row.cost) || 0),
        quantity: Number(row.quantity) || 0,
        orderCount: Number(row.orderCount) || 0,
      })),
      byProduct: productBreakdown.map((row) => ({
        productId: Number(row.productId) || 0,
        productName: row.productName || 'Unknown Product',
        category: row.category || 'Uncategorized',
        revenue: Number(row.revenue) || 0,
        cost: Number(row.cost) || 0,
        profit: (Number(row.revenue) || 0) - (Number(row.cost) || 0),
        quantity: Number(row.quantity) || 0,
        orderCount: Number(row.orderCount) || 0,
      })),
      bySize: sizeBreakdown.map((row) => ({
        productId: Number(row.productId) || 0,
        productName: row.productName || 'Unknown Product',
        productSizeId: Number(row.productSizeId) || 0,
        sizeName: row.sizeName || 'Default',
        revenue: Number(row.revenue) || 0,
        cost: Number(row.cost) || 0,
        profit: (Number(row.revenue) || 0) - (Number(row.cost) || 0),
        quantity: Number(row.quantity) || 0,
        orderCount: Number(row.orderCount) || 0,
      })),
      byPhoto: photoBreakdown.map((row) => ({
        albumId: Number(row.albumId) || 0,
        albumName: row.albumName || 'Unknown Album',
        photoId: Number(row.photoId) || 0,
        fileName: row.fileName || `Photo #${row.photoId}`,
        thumbnailUrl: Number(row.photoId) ? photoAssetUrl(Number(row.photoId), 'thumbnail') : undefined,
        revenue: Number(row.revenue) || 0,
        cost: Number(row.cost) || 0,
        profit: (Number(row.revenue) || 0) - (Number(row.cost) || 0),
        quantity: Number(row.quantity) || 0,
        orderCount: Number(row.orderCount) || 0,
      })),
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

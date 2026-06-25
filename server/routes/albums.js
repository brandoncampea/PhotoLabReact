// Ensure published/hidden columns exist on albums table
const ensureAlbumPublishedHiddenColumns = async () => {
  await query(`
    IF COL_LENGTH('albums', 'published') IS NULL
      ALTER TABLE albums ADD published BIT NOT NULL CONSTRAINT DF_albums_published DEFAULT 1;
  `);
  await query(`
    IF COL_LENGTH('albums', 'hidden') IS NULL
      ALTER TABLE albums ADD hidden BIT NOT NULL CONSTRAINT DF_albums_hidden DEFAULT 0;
  `);
  // Set all existing albums as published if null (should only run once)
  await query(`
    UPDATE albums SET published = 1 WHERE published IS NULL;
  `);
  await query(`
    UPDATE albums SET hidden = 0 WHERE hidden IS NULL;
  `);
};
import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { requireActiveSubscription, enforceAlbumQuotaForStudio, isStudioSubscriptionActive } from '../middleware/subscription.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { deleteBlobByUrl } from '../services/azureStorage.js';
const router = express.Router();

const ensureAlbumBatchShippingColumn = async () => {
  await query(`
    IF COL_LENGTH('albums', 'batch_shipping_active') IS NULL
      ALTER TABLE albums ADD batch_shipping_active BIT NOT NULL CONSTRAINT DF_albums_batch_shipping_active DEFAULT 0;
  `);
};

const ensureAlbumPurchaseToggleColumn = async () => {
  await query(`
    IF COL_LENGTH('albums', 'album_purchase_enabled') IS NULL
      ALTER TABLE albums ADD album_purchase_enabled BIT NOT NULL CONSTRAINT DF_albums_album_purchase_enabled DEFAULT 1;
  `);
};

const ensureAlbumSchoolTagSchema = async () => {
  await query(`
    IF COL_LENGTH('albums', 'school_tags') IS NULL
      ALTER TABLE albums ADD school_tags NVARCHAR(2000) NULL;
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_school_roster')
    BEGIN
      CREATE TABLE studio_school_roster (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        school_name NVARCHAR(255) NOT NULL,
        school_type NVARCHAR(100) NULL,
        source_album_id INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      );
    END
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_studio_school_roster_studio_name'
        AND object_id = OBJECT_ID('studio_school_roster')
    )
    BEGIN
      CREATE INDEX IX_studio_school_roster_studio_name
      ON studio_school_roster (studio_id, school_name);
    END
  `);
};

const ensureAlbumSchema = async () => {
  await ensureAlbumBatchShippingColumn();
  await ensureAlbumPurchaseToggleColumn();
  await ensureAlbumSchoolTagSchema();
  await ensureAlbumPublishedHiddenColumns();
};

const parseSchoolTags = (value) => {
  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )).slice(0, 30);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return Array.from(new Set(
    value
      .split(/[\n,;|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )).slice(0, 30);
};

const toSchoolTagsCsv = (tags = []) => {
  const parsed = parseSchoolTags(tags);
  return parsed.length ? parsed.join(', ') : null;
};

const extractSchoolTags = (album = {}) => parseSchoolTags(album.schoolTags ?? album.school_tags);

const syncStudioSchoolRoster = async (studioId, schoolTags = [], sourceAlbumId = null) => {
  if (!studioId) return;

  const normalized = parseSchoolTags(schoolTags);
  if (!normalized.length) return;

  for (const schoolName of normalized) {
      const existing = await queryRow(
        `SELECT TOP 1 ssr.id
         FROM studio_school_roster ssr
         WHERE ssr.studio_id = $1
           AND LOWER(ssr.school_name) = LOWER($2)`,
        [studioId, schoolName]
      );

    if (existing?.id) {
      await query(
        `UPDATE studio_school_roster
         SET updated_at = GETDATE(),
             source_album_id = COALESCE(source_album_id, $1)
         WHERE id = $2`,
        [sourceAlbumId, existing.id]
      );
      continue;
    }

    await query(
      `INSERT INTO studio_school_roster (studio_id, school_name, school_type, source_album_id)
       VALUES ($1, $2, NULL, $3)`,
      [studioId, schoolName, sourceAlbumId]
    );
  }
};

// Public: Get albums by studioSlug (for customer view)
router.get('/public', async (req, res) => {
  try {
    const { studioSlug, player } = req.query;
    if (!studioSlug) {
      return res.status(400).json({ error: 'studioSlug is required' });
    }
    // Find studio by public_slug, include subscription fields for access check
    const studio = await queryRow(
      `SELECT s.id, s.subscription_status, s.is_free_subscription, s.billing_cycle, s.subscription_end
       FROM studios s WHERE s.public_slug = $1`,
      [studioSlug]
    );
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }
    if (!isStudioSubscriptionActive(studio)) {
      return res.status(403).json({ error: 'This studio is not currently active' });
    }
    let albums = [];
    if (player && String(player).trim().length > 0) {
      // Improved: Search for albums that have at least one photo tagged with the player (case-insensitive, whole name match)
      // Normalize both stored and searched names by trimming, lowering, and splitting on comma
      albums = await queryRows(`
        SELECT DISTINCT
          a.id,
          COALESCE(a.name, a.title) as name,
          a.description,
          a.cover_image_url as coverImageUrl,
          a.cover_photo_id as coverPhotoId,
          a.photo_count as photoCount,
          a.category,
          a.school_tags as schoolTags,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          COALESCE(a.batch_shipping_active, 0) as batchShippingActive,
          COALESCE(a.album_purchase_enabled, 1) as albumPurchaseEnabled,
          COALESCE(sc.is_active, 0) as studioBatchShippingActive,
          sc.batch_deadline as batchDeadline,
          a.created_at as createdDate
        FROM albums a
        LEFT JOIN shipping_config sc ON sc.id = a.studio_id
        INNER JOIN photos p ON p.album_id = a.id
        WHERE a.studio_id = $1 AND a.published = 1 AND a.hidden = 0
          AND (
            ',' + LOWER(REPLACE(REPLACE(REPLACE(p.player_names, ', ', ','), ';', ','), ',,', ',')) + ',' LIKE '%,' + LOWER(LTRIM(RTRIM($2))) + ',%'
          )
        ORDER BY a.created_at DESC
      `, [studio.id, player.trim().toLowerCase()]);
    } else {
      // Only return albums that are published, not hidden, and not deleted
      albums = await queryRows(`
        SELECT 
          a.id,
          COALESCE(a.name, a.title) as name,
          a.description,
          a.cover_image_url as coverImageUrl,
          a.cover_photo_id as coverPhotoId,
          a.photo_count as photoCount,
          a.category,
          a.school_tags as schoolTags,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          COALESCE(a.batch_shipping_active, 0) as batchShippingActive,
          COALESCE(a.album_purchase_enabled, 1) as albumPurchaseEnabled,
          COALESCE(sc.is_active, 0) as studioBatchShippingActive,
          sc.batch_deadline as batchDeadline,
          a.created_at as createdDate
        FROM albums a
        LEFT JOIN shipping_config sc ON sc.id = a.studio_id
        WHERE a.studio_id = $1 AND a.published = 1 AND a.hidden = 0
        ORDER BY a.created_at DESC
      `, [studio.id]);
    }
    const albumsWithPreviews = await addAlbumPreviewImages(albums);
    res.json(albumsWithPreviews.map(signAlbumForResponse));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const signAlbumForResponse = (album) => ({
  ...album,
  batchShippingActive: Boolean(album?.batchShippingActive),
  albumPurchaseEnabled: album?.albumPurchaseEnabled === undefined || album?.albumPurchaseEnabled === null ? true : Boolean(album?.albumPurchaseEnabled),
  studioBatchShippingActive: Boolean(album?.studioBatchShippingActive),
  schoolTags: extractSchoolTags(album),
  coverImageUrl: album?.coverPhotoId
    ? String(album.coverPhotoId)
    : album?.coverImageUrl || '',
});

const addAlbumPreviewImages = async (albums) => {
  if (!albums.length) {
    return albums;
  }

  const albumIds = albums.map((album) => album.id).filter(Boolean);
  if (!albumIds.length) {
    return albums;
  }

  const placeholders = albumIds.map((_, index) => `$${index + 1}`).join(', ');
  const previewRows = await queryRows(`
    WITH ranked_photos AS (
      SELECT
        p.id,
        p.album_id as albumId,
        ROW_NUMBER() OVER (PARTITION BY p.album_id ORDER BY p.created_at DESC) as rowNumber
      FROM photos p
      WHERE p.album_id IN (${placeholders})
    )
    SELECT rp.id, rp.albumId
    FROM ranked_photos rp
    WHERE rp.rowNumber <= 5
    ORDER BY rp.albumId, rp.rowNumber
  `, albumIds);

  const previewMap = new Map();
  previewRows.forEach((row) => {
    const current = previewMap.get(row.albumId) || [];
    current.push(`/api/photos/${row.id}/asset?variant=thumbnail`);
    previewMap.set(row.albumId, current);
  });

  return albums.map((album) => ({
    ...album,
    previewImageUrls: previewMap.get(album.id) || [],
  }));
};

// Get all albums (auth required)
router.get('/', authRequired, async (req, res) => {
  try {
    const user = req.user;
    let albums;
    const studioId = user?.studio_id;
    if (studioId) {
      albums = await queryRows(`
        SELECT
          a.id,
          COALESCE(a.name, a.title) as name,
          a.description,
          a.cover_image_url as coverImageUrl,
          a.cover_photo_id as coverPhotoId,
          COALESCE(pc.photoCount, 0) as photoCount,
          a.category,
          a.school_tags as schoolTags,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          COALESCE(a.batch_shipping_active, 0) as batchShippingActive,
          COALESCE(a.album_purchase_enabled, 1) as albumPurchaseEnabled,
          a.published,
          a.hidden,
          a.created_at as createdDate,
          a.studio_id as "studioId",
          s.public_slug as "studioPublicSlug"
        FROM albums a
        LEFT JOIN studios s ON s.id = a.studio_id
        LEFT JOIN (SELECT album_id, COUNT(*) as photoCount FROM photos GROUP BY album_id) pc ON pc.album_id = a.id
        WHERE a.studio_id = $1
        ORDER BY a.created_at DESC
      `, [studioId]);
    } else if (user?.role === 'super_admin') {
      albums = await queryRows(`
        SELECT
          a.id,
          COALESCE(a.name, a.title) as name,
          a.description,
          a.cover_image_url as coverImageUrl,
          a.cover_photo_id as coverPhotoId,
          COALESCE(pc.photoCount, 0) as photoCount,
          a.category,
          a.school_tags as schoolTags,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          COALESCE(a.batch_shipping_active, 0) as batchShippingActive,
          COALESCE(a.album_purchase_enabled, 1) as albumPurchaseEnabled,
          a.published,
          a.hidden,
          a.created_at as createdDate,
          a.studio_id as "studioId",
          s.public_slug as "studioPublicSlug"
        FROM albums a
        LEFT JOIN studios s ON s.id = a.studio_id
        LEFT JOIN (SELECT album_id, COUNT(*) as photoCount FROM photos GROUP BY album_id) pc ON pc.album_id = a.id
        ORDER BY a.created_at DESC
      `);
    } else {
      console.log('ALBUMS ROUTE: No studioId and not super_admin, returning empty array');
      return res.json([]);
    }

    const albumIds = albums.map(a => a.id);
    let statsMap = new Map();
    let viewsMap = new Map();

    const fetchStats = async () => {
      if (!albumIds.length) return;
      const placeholders = albumIds.map((_, i) => `$${i + 1}`).join(',');
      const statsRows = await queryRows(`
        SELECT ph.album_id as albumId,
               COUNT(DISTINCT o.id) as orderCount,
               SUM(
                 CASE
                   WHEN oi.studio_net_payout_amount IS NOT NULL
                     THEN oi.studio_net_payout_amount
                   WHEN oi.studio_revenue_amount IS NOT NULL
                     THEN oi.studio_revenue_amount - COALESCE(oi.stripe_fee_allocated_amount, 0)
                   ELSE (oi.price - COALESCE(ps.cost, prod.cost, 0)) * oi.quantity
                        - COALESCE(oi.stripe_fee_allocated_amount, 0)
                 END
               ) as netRevenue
        FROM order_items oi
        INNER JOIN photos ph ON ph.id = oi.photo_id
        INNER JOIN albums p ON p.id = ph.album_id
        INNER JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products prod ON prod.id = oi.product_id
        LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
        WHERE p.id IN (${placeholders})
          AND LOWER(o.status) NOT IN ('cancelled', 'refunded')
        GROUP BY ph.album_id
      `, albumIds);
      statsMap = new Map(statsRows.map(row => [row.albumId, row]));
    };

    const fetchAnalytics = async () => {
      if (!albumIds.length) return;
      const placeholders = albumIds.map((_, i) => `$${i + 1}`).join(',');
      try {
        const viewRows = await queryRows(`
          SELECT
            albumId,
            SUM(CASE WHEN event_type = 'album_view' THEN 1 ELSE 0 END) as viewOpenCount,
            SUM(CASE WHEN event_type = 'album_card_click' THEN 1 ELSE 0 END) as viewClickCount,
            COUNT(*) as viewCount
          FROM analytics
          WHERE event_type IN ('album_view', 'album_card_click')
            AND albumId IN (${placeholders})
          GROUP BY albumId
        `, albumIds);
        viewsMap = new Map(viewRows.map(row => [Number(row.albumId), {
          viewCount: Number(row.viewCount) || 0,
          viewOpenCount: Number(row.viewOpenCount) || 0,
          viewClickCount: Number(row.viewClickCount) || 0,
        }]));
      } catch (analyticsError) {
        console.warn('[GET /albums] analytics unavailable:', analyticsError?.message || analyticsError);
      }
    };

    // Run stats, analytics, and preview queries in parallel
    const [albumsWithPreviews] = await Promise.all([
      addAlbumPreviewImages(albums),
      fetchStats(),
      fetchAnalytics(),
    ]);
    const albumsWithStats = albumsWithPreviews.map(album => {
      const stats = statsMap.get(album.id) || {};
      const views = viewsMap.get(Number(album.id)) || {};
      return {
        ...signAlbumForResponse(album),
        productCount: Number(stats.orderCount) || 0,
        netRevenue: Number(stats.netRevenue) || 0,
        viewCount: Number(views.viewCount) || 0,
        viewOpenCount: Number(views.viewOpenCount) || 0,
        viewClickCount: Number(views.viewClickCount) || 0,
        studioPublicSlug: album.studioPublicSlug || null,
      };
    });
    res.json(albumsWithStats);
  } catch (error) {
    console.error('[GET /albums] Internal Server Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/school-roster', authRequired, async (req, res) => {
  try {
    const studioId = req.user?.studio_id;
    if (!studioId) {
      return res.json([]);
    }

    const rows = await queryRows(
      `SELECT school_name as schoolName,
              school_type as schoolType,
              source_album_id as sourceAlbumId,
              updated_at as updatedAt
       FROM studio_school_roster
       WHERE studio_id = $1
       ORDER BY school_name ASC`,
      [studioId]
    );

    res.json((rows || []).map((row) => ({
      schoolName: row.schoolName,
      schoolType: row.schoolType || null,
      sourceAlbumId: row.sourceAlbumId || null,
      updatedAt: row.updatedAt,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get album by ID
router.get('/:id', async (req, res) => {
  try {
    const album = await queryRow(`
      SELECT 
        a.id,
        COALESCE(a.name, a.title) as name,
        a.description,
        a.cover_image_url as coverImageUrl,
        a.cover_photo_id as coverPhotoId,
        a.photo_count as photoCount,
        a.category,
        a.school_tags as schoolTags,
        a.price_list_id as priceListId,
        a.is_password_protected as isPasswordProtected,
        a.password,
        a.password_hint as passwordHint,
        COALESCE(a.batch_shipping_active, 0) as batchShippingActive,
        COALESCE(a.album_purchase_enabled, 1) as albumPurchaseEnabled,
        COALESCE(sc.is_active, 0) as studioBatchShippingActive,
        sc.batch_deadline as batchDeadline,
        a.created_at as createdDate,
        a.studio_id as "studioId"
      FROM albums a
      LEFT JOIN shipping_config sc ON sc.id = a.studio_id
      WHERE a.id = $1
    `, [req.params.id]);
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }
    if (album.studioId) {
      const studioSub = await queryRow(
        `SELECT subscription_status, is_free_subscription, billing_cycle, subscription_end FROM studios WHERE id = $1`,
        [album.studioId]
      );
      if (studioSub && !isStudioSubscriptionActive(studioSub)) {
        return res.status(403).json({ error: 'This studio is not currently active' });
      }
    }
    const [albumWithPreviews] = await addAlbumPreviewImages([album]);
    res.json(signAlbumForResponse(albumWithPreviews));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create album
// Create new album (requires active subscription)
router.post('/', requireActiveSubscription, async (req, res) => {
  try {
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint, batchShippingActive, schoolTags, albumPurchaseEnabled, published, hidden } = req.body;
    const albumName = title || name || '';
    const normalizedSchoolTags = parseSchoolTags(schoolTags);
    const normalizedAlbumPurchaseEnabled = albumPurchaseEnabled === undefined ? true : !!albumPurchaseEnabled;
    
    if (!albumName) {
      return res.status(400).json({ error: 'Album name is required' });
    }

    if (req.studioId) {
      await enforceAlbumQuotaForStudio(req.studioId);
    }
    
    const result = await queryRow(`
      INSERT INTO albums (name, title, description, cover_image_url, cover_photo_id, category, school_tags, price_list_id, is_password_protected, password, password_hint, studio_id, batch_shipping_active, album_purchase_enabled, published, hidden)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `, [
      albumName,
      albumName,
      description || null,
      coverImageUrl || null,
      coverPhotoId || null,
      category || null,
      toSchoolTagsCsv(normalizedSchoolTags),
      priceListId || null,
      !!isPasswordProtected,
      isPasswordProtected ? password : null,
      isPasswordProtected ? passwordHint : null,
      req.studioId || null,
      !!batchShippingActive,
      normalizedAlbumPurchaseEnabled,
      false, // published: always false for new albums
      hidden === true ? true : false // hidden: allow explicit set, default false
    ]);

    await syncStudioSchoolRoster(req.studioId || null, normalizedSchoolTags, result.id);
    
    const album = await queryRow(`
      SELECT 
        id,
        COALESCE(name, title) as name,
        description,
        cover_image_url as coverImageUrl,
        cover_photo_id as coverPhotoId,
        photo_count as photoCount,
        category,
        school_tags as schoolTags,
        price_list_id as priceListId,
        is_password_protected as isPasswordProtected,
        password,
        password_hint as passwordHint,
        COALESCE(batch_shipping_active, 0) as batchShippingActive,
        COALESCE(album_purchase_enabled, 1) as albumPurchaseEnabled,
        published,
        hidden,
        created_at as createdDate
      FROM albums WHERE id = $1
    `, [result.id]);
    res.status(201).json(signAlbumForResponse(album));
  } catch (error) {
    if (error.code === 'ALBUM_QUOTA_EXCEEDED') {
      return res.status(403).json({ error: error.message, quotaExceeded: true });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update album
router.put('/:id', async (req, res) => {
  try {
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint, batchShippingActive, schoolTags, albumPurchaseEnabled, published, hidden, photoCount } = req.body;

    // Log incoming payload
    console.log('[PUT /albums/:id] Incoming payload:', req.body);

    // Get the current album to preserve existing values
    const currentAlbum = await queryRow('SELECT * FROM albums WHERE id = $1', [req.params.id]);
    if (!currentAlbum) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Use provided values or keep existing ones
    const albumName = title || name || currentAlbum.name || currentAlbum.title || '';
    const newDescription = description !== undefined ? description : currentAlbum.description;
    let newCoverUrl = coverImageUrl !== undefined ? coverImageUrl : currentAlbum.cover_image_url;
    const newCoverPhotoId = coverPhotoId !== undefined ? coverPhotoId : currentAlbum.cover_photo_id;
    if (newCoverPhotoId) {
      const selectedPhoto = await queryRow('SELECT full_image_url as fullImageUrl FROM photos WHERE id = $1', [newCoverPhotoId]);
      if (selectedPhoto?.fullImageUrl) {
        newCoverUrl = selectedPhoto.fullImageUrl;
      }
    }

    const newCategory = category !== undefined ? category : currentAlbum.category;
    const newSchoolTags = schoolTags !== undefined ? parseSchoolTags(schoolTags) : parseSchoolTags(currentAlbum.school_tags);
    const newPriceListId = priceListId !== undefined ? priceListId : currentAlbum.price_list_id;
    const newIsProtected = isPasswordProtected !== undefined ? isPasswordProtected : currentAlbum.is_password_protected;
    const newPassword = newIsProtected ? (password !== undefined ? password : currentAlbum.password) : null;
    const newPasswordHint = newIsProtected ? (passwordHint !== undefined ? passwordHint : currentAlbum.password_hint) : null;
    const newBatchShippingActive = batchShippingActive !== undefined ? !!batchShippingActive : !!currentAlbum.batch_shipping_active;
    const newAlbumPurchaseEnabled = albumPurchaseEnabled !== undefined ? !!albumPurchaseEnabled : (currentAlbum.album_purchase_enabled === undefined || currentAlbum.album_purchase_enabled === null ? true : !!currentAlbum.album_purchase_enabled);
    const newPublished = published !== undefined ? !!published : (currentAlbum.published === undefined || currentAlbum.published === null ? true : !!currentAlbum.published);
    const newHidden = hidden !== undefined ? !!hidden : (currentAlbum.hidden === undefined || currentAlbum.hidden === null ? false : !!currentAlbum.hidden);

    // Log computed values
    console.log('[PUT /albums/:id] Computed values:', {
      albumName,
      newDescription,
      newCoverUrl,
      newCoverPhotoId,
      newCategory,
      newSchoolTags,
      newPriceListId,
      newIsProtected,
      newPassword,
      newPasswordHint,
      newBatchShippingActive,
      newAlbumPurchaseEnabled,
      newPublished,
      newHidden
    });

    // Allow updating photo_count if provided
    if (typeof photoCount === 'number') {
      await query(
        `UPDATE albums 
        SET name = $1, title = $2, description = $3, cover_image_url = $4, cover_photo_id = $5, category = $6, school_tags = $7, price_list_id = $8, 
            is_password_protected = $9, password = $10, password_hint = $11, batch_shipping_active = $12, album_purchase_enabled = $13, published = $14, hidden = $15, photo_count = $16
          WHERE id = $17`,
        [
          albumName,
          albumName,
          newDescription,
          newCoverUrl,
          newCoverPhotoId,
          newCategory,
          toSchoolTagsCsv(newSchoolTags),
          newPriceListId,
          !!newIsProtected,
          newPassword,
          newPasswordHint,
          newBatchShippingActive,
          newAlbumPurchaseEnabled,
          newPublished,
          newHidden,
          photoCount,
          req.params.id,
        ]
      );
    } else {
      await query(
        `UPDATE albums 
        SET name = $1, title = $2, description = $3, cover_image_url = $4, cover_photo_id = $5, category = $6, school_tags = $7, price_list_id = $8, 
            is_password_protected = $9, password = $10, password_hint = $11, batch_shipping_active = $12, album_purchase_enabled = $13, published = $14, hidden = $15
          WHERE id = $16`,
        [
          albumName,
          albumName,
          newDescription,
          newCoverUrl,
          newCoverPhotoId,
          newCategory,
          toSchoolTagsCsv(newSchoolTags),
          newPriceListId,
          !!newIsProtected,
          newPassword,
          newPasswordHint,
          newBatchShippingActive,
          newAlbumPurchaseEnabled,
          newPublished,
          newHidden,
          req.params.id,
        ]
      );
    }

    // Log after DB update
    console.log('[PUT /albums/:id] Updated DB for album', req.params.id, 'published:', newPublished, 'hidden:', newHidden);

    await syncStudioSchoolRoster(currentAlbum.studio_id || null, newSchoolTags, Number(req.params.id));

    const album = await queryRow(`
      SELECT 
        id,
        COALESCE(name, title) as name,
        description,
        cover_image_url as coverImageUrl,
        cover_photo_id as coverPhotoId,
        photo_count as photoCount,
        category,
        school_tags as schoolTags,
        price_list_id as priceListId,
        is_password_protected as isPasswordProtected,
        password,
        password_hint as passwordHint,
        COALESCE(batch_shipping_active, 0) as batchShippingActive,
        COALESCE(album_purchase_enabled, 1) as albumPurchaseEnabled,
        published,
        hidden,
        created_at as createdDate
      FROM albums WHERE id = $1
    `, [req.params.id]);
    // Log returned album
    console.log('[PUT /albums/:id] Returning album:', album);
    res.json(signAlbumForResponse(album));
  } catch (error) {
    console.error('[PUT /albums/:id] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete album
router.delete('/:id', async (req, res) => {
  try {
    const albumId = Number(req.params.id);

    // Fetch photo asset URLs first so we can clean up Azure blobs
    const photoAssets = await queryRows(
      `SELECT full_image_url as fullImageUrl, thumbnail_url as thumbnailUrl
       FROM photos
       WHERE album_id = $1`,
      [albumId]
    );

    // Delete Azure blobs (best effort) before removing DB rows
    const blobUrls = new Set();
    for (const asset of photoAssets) {
      if (asset?.fullImageUrl) blobUrls.add(asset.fullImageUrl);
      if (asset?.thumbnailUrl) blobUrls.add(asset.thumbnailUrl);
    }

    await Promise.allSettled(
      Array.from(blobUrls).map(async (url) => {
        if (typeof url === 'string' && url.startsWith('http')) {
          await deleteBlobByUrl(url);
        }
      })
    );

    // Delete order_items referencing photos in this album
    await query(`DELETE FROM order_items WHERE photo_id IN (SELECT p.id FROM photos p WHERE p.album_id = $1)`, [albumId]);
    // Delete photos in this album
    await query(`DELETE FROM photos WHERE album_id = $1`, [albumId]);
    // Delete SmugMug import records for this album
    await query(`DELETE FROM studio_smugmug_imports WHERE local_album_id = $1`, [albumId]);
    // Delete the album itself
    await query('DELETE FROM albums WHERE id = $1', [albumId]);
    res.json({ message: 'Album deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Per-album pricing overrides ─────────────────────────────────────────────

const ensureAlbumPriceOverridesTable = async () => {
  // called eagerly at module load below
  await query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'album_price_overrides')
    BEGIN
      CREATE TABLE album_price_overrides (
        id INT IDENTITY(1,1) PRIMARY KEY,
        album_id INT NOT NULL,
        product_size_id INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_album_size_override UNIQUE (album_id, product_size_id)
      );
      CREATE INDEX IX_album_price_overrides_album_id ON album_price_overrides(album_id);
    END
  `);
};

// GET /albums/:id/price-overrides
router.get('/:id/price-overrides', authRequired, async (req, res) => {
  try {
    await ensureAlbumPriceOverridesTable();
    const albumId = Number(req.params.id);
    const overrides = await queryRows(
      `SELECT apo.product_size_id as productSizeId, apo.price,
              ps.size_name as sizeName, p.name as productName, p.id as productId
       FROM album_price_overrides apo
       JOIN product_sizes ps ON ps.id = apo.product_size_id
       JOIN products p ON p.id = ps.product_id
       WHERE apo.album_id = $1`,
      [albumId]
    );
    res.json({ overrides: overrides || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /albums/:id/price-overrides — body: { overrides: [{ productSizeId, price }] }
router.put('/:id/price-overrides', authRequired, async (req, res) => {
  try {
    await ensureAlbumPriceOverridesTable();
    const albumId = Number(req.params.id);
    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : [];

    // Delete all existing overrides for this album, then insert new ones
    await query(`DELETE FROM album_price_overrides WHERE album_id = $1`, [albumId]);

    for (const o of overrides) {
      const sizeId = Number(o.productSizeId);
      const price = parseFloat(o.price);
      if (!sizeId || isNaN(price) || price < 0) continue;
      await query(
        `INSERT INTO album_price_overrides (album_id, product_size_id, price)
         VALUES ($1, $2, $3)`,
        [albumId, sizeId, price]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run table creation at startup so products.js / orders.js can query them immediately
ensureAlbumPriceOverridesTable().catch(err => console.error('[albums] ensureAlbumPriceOverridesTable:', err.message));

// ─── Referral / share link tracking ─────────────────────────────────────────

const ensureReferralTables = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'album_share_codes')
    BEGIN
      CREATE TABLE album_share_codes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        album_id INT NOT NULL,
        studio_id INT NULL,
        code NVARCHAR(16) NOT NULL UNIQUE,
        label NVARCHAR(255) NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IX_album_share_codes_album ON album_share_codes(album_id);
    END
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'album_referral_events')
    BEGIN
      CREATE TABLE album_referral_events (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(16) NOT NULL,
        event_type NVARCHAR(20) NOT NULL, -- 'visit' or 'order'
        order_id INT NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IX_album_referral_events_code ON album_referral_events(code);
    END
  `);
};

ensureReferralTables().catch(err => console.error('[albums] ensureReferralTables:', err.message));

// GET /albums/:id/share-codes — list codes with visit/order counts
router.get('/:id/share-codes', authRequired, async (req, res) => {
  try {
    await ensureReferralTables();
    const albumId = Number(req.params.id);
    const codes = await queryRows(
      `SELECT sc.id, sc.code, sc.label, sc.created_at as createdAt,
              SUM(CASE WHEN re.event_type = 'visit' THEN 1 ELSE 0 END) as visits,
              SUM(CASE WHEN re.event_type = 'order' THEN 1 ELSE 0 END) as orders
       FROM album_share_codes sc
       LEFT JOIN album_referral_events re ON re.code = sc.code
       WHERE sc.album_id = $1
       GROUP BY sc.id, sc.code, sc.label, sc.created_at
       ORDER BY sc.created_at DESC`,
      [albumId]
    );
    res.json({ codes: codes || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /albums/:id/share-codes — generate a new code
router.post('/:id/share-codes', authRequired, async (req, res) => {
  try {
    await ensureReferralTables();
    const albumId = Number(req.params.id);
    const label = String(req.body.label || '').trim() || null;
    const studioId = req.user?.studio_id || null;
    // Generate a short unique alphanumeric code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    await query(
      `INSERT INTO album_share_codes (album_id, studio_id, code, label) VALUES ($1, $2, $3, $4)`,
      [albumId, studioId, code, label]
    );
    res.json({ code, label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /albums/:id/track-visit — called from frontend when album loads with ?ref=
router.post('/:id/track-visit', async (req, res) => {
  try {
    await ensureReferralTables();
    const code = String(req.body.code || '').trim();
    if (!code) return res.json({ ok: false });
    const exists = await queryRow(`SELECT id FROM album_share_codes WHERE code = $1`, [code]);
    if (!exists) return res.json({ ok: false });
    await query(
      `INSERT INTO album_referral_events (code, event_type) VALUES ($1, 'visit')`,
      [code]
    );
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// ─── Photo favorites ──────────────────────────────────────────────────────────

// GET /albums/favorites/all?token= — cross-album favorites for a session
router.get('/favorites/all', async (req, res) => {
  try {
    await ensurePhotoFavoritesTable();
    const token = String(req.query.token || '').trim();
    if (!token) return res.json({ photos: [] });
    const rows = await queryRows(
      `SELECT pf.photo_id as photoId, pf.album_id as albumId,
              ph.file_name as fileName, ph.player_names as playerNames, ph.player_numbers as playerNumbers,
              ph.width, ph.height,
              al.name as albumName, al.studio_id as studioId
       FROM photo_favorites pf
       LEFT JOIN photos ph ON ph.id = pf.photo_id
       LEFT JOIN albums al ON al.id = pf.album_id
       WHERE pf.session_token = $1
       ORDER BY pf.created_at DESC`,
      [token]
    );
    res.json({ photos: rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ensurePhotoFavoritesTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_favorites')
    BEGIN
      CREATE TABLE photo_favorites (
        id INT IDENTITY(1,1) PRIMARY KEY,
        session_token NVARCHAR(64) NOT NULL,
        email NVARCHAR(255) NULL,
        album_id INT NOT NULL,
        photo_id INT NOT NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_favorite UNIQUE (session_token, album_id, photo_id)
      );
      CREATE INDEX IX_photo_favorites_token ON photo_favorites(session_token);
      CREATE INDEX IX_photo_favorites_email ON photo_favorites(email);
    END
  `);
};

// GET /albums/:id/favorites?token= — load favorites for a session
router.get('/:id/favorites', async (req, res) => {
  try {
    await ensurePhotoFavoritesTable();
    const albumId = Number(req.params.id);
    const token = String(req.query.token || '').trim();
    if (!token) return res.json({ favorites: [] });
    const rows = await queryRows(
      `SELECT photo_id as photoId FROM photo_favorites WHERE session_token = $1 AND album_id = $2`,
      [token, albumId]
    );
    res.json({ favorites: (rows || []).map(r => r.photoId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /albums/:id/favorites — toggle a favorite
router.post('/:id/favorites', async (req, res) => {
  try {
    await ensurePhotoFavoritesTable();
    const albumId = Number(req.params.id);
    const photoId = Number(req.body.photoId);
    const token = String(req.body.token || '').trim();
    if (!token || !photoId) return res.status(400).json({ error: 'token and photoId required' });

    const existing = await queryRow(
      `SELECT id FROM photo_favorites WHERE session_token = $1 AND album_id = $2 AND photo_id = $3`,
      [token, albumId, photoId]
    );
    if (existing) {
      await query(
        `DELETE FROM photo_favorites WHERE session_token = $1 AND album_id = $2 AND photo_id = $3`,
        [token, albumId, photoId]
      );
      return res.json({ favorited: false });
    }
    await query(
      `INSERT INTO photo_favorites (session_token, album_id, photo_id) VALUES ($1, $2, $3)`,
      [token, albumId, photoId]
    );
    res.json({ favorited: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /albums/:id/favorites/save-email — attach email to session + send magic link
router.post('/:id/favorites/save-email', async (req, res) => {
  try {
    await ensurePhotoFavoritesTable();
    const albumId = Number(req.params.id);
    const email = String(req.body.email || '').trim().toLowerCase();
    const token = String(req.body.token || '').trim();
    if (!token || !email) return res.status(400).json({ error: 'token and email required' });

    // Attach email to all favorites in this session (across all albums)
    await query(
      `UPDATE photo_favorites SET email = $1 WHERE session_token = $2`,
      [email, token]
    );

    const appBase = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
    const link = `${appBase}/favorites?favToken=${encodeURIComponent(token)}`;

    // Send magic link email if SMTP is configured
    try {
      const { default: receiptSvc } = await import('../services/orderReceiptService.js');
      if (receiptSvc.isConfigured()) {
        await receiptSvc.sendRaw({
          to: email,
          subject: 'Your saved favorites',
          html: `<div style="font-family:Arial,sans-serif;background:#0f131a;color:#eaf1fb;max-width:560px;margin:0 auto;padding:24px;border-radius:12px;">
            <div style="font-size:22px;font-weight:700;margin-bottom:12px;">Your saved favorites</div>
            <p style="color:#b8c2d1;">Use the link below to come back to your saved photos at any time.</p>
            <a href="${link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7b61ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">View My Favorites</a>
            <p style="margin-top:20px;font-size:12px;color:#6b7280;">This link is unique to your session — bookmark it to return to your favorites.</p>
          </div>`,
          text: `Your saved favorites — use this link to come back: ${link}`,
        });
      }
    } catch { /* email failure is non-fatal */ }

    res.json({ ok: true, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /albums/:id/favorite-stats — which photos are favorited most (studio admin)
router.get('/:id/favorite-stats', authRequired, async (req, res) => {
  try {
    await ensurePhotoFavoritesTable();
    const albumId = Number(req.params.id);
    const stats = await queryRows(
      `SELECT pf.photo_id as photoId, COUNT(*) as favoriteCount, ph.file_name as fileName
       FROM photo_favorites pf
       LEFT JOIN photos ph ON ph.id = pf.photo_id
       WHERE pf.album_id = $1
       GROUP BY pf.photo_id, ph.file_name
       ORDER BY favoriteCount DESC`,
      [albumId]
    );
    res.json({ stats: stats || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Album-level player tag suggestions ────────────────────────────────────────

const ensureAlbumPlayerSuggestionsTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'album_player_tag_suggestions')
    BEGIN
      CREATE TABLE album_player_tag_suggestions (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        album_id            INT NOT NULL,
        studio_id           INT NOT NULL,
        submitted_by_user_id INT NULL,
        player_name         NVARCHAR(255) NOT NULL,
        player_number       NVARCHAR(50) NULL,
        notes               NVARCHAR(500) NULL,
        submitted_by_name   NVARCHAR(255) NULL,
        submitted_by_email  NVARCHAR(255) NULL,
        status              NVARCHAR(20) NOT NULL DEFAULT 'pending',
        submitted_at        DATETIME2 DEFAULT GETDATE(),
        reviewed_at         DATETIME2 NULL,
        reviewed_by_user_id INT NULL,
        review_note         NVARCHAR(500) NULL,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
        FOREIGN KEY (studio_id) REFERENCES studios(id)
      )
    END
  `);
};

// Customer submits a player tag suggestion for an album (requires login)
router.post('/:albumId/player-suggestions', authRequired, async (req, res) => {
  try {
    await ensureAlbumPlayerSuggestionsTable();
    const albumId = Number(req.params.albumId);
    const playerName = String(req.body?.playerName || '').trim();
    const playerNumber = String(req.body?.playerNumber || '').trim();
    const notes = String(req.body?.notes || '').trim();

    if (!playerName || playerName.length < 2 || playerName.length > 200) {
      return res.status(400).json({ error: 'Please enter a valid player name (2–200 chars)' });
    }

    const album = await queryRow(
      `SELECT id, studio_id as studioId FROM albums WHERE id = $1`,
      [albumId]
    );
    if (!album) return res.status(404).json({ error: 'Album not found' });

    // Prevent duplicates from the same user
    const dup = await queryRow(
      `SELECT TOP 1 id FROM album_player_tag_suggestions
       WHERE album_id = $1 AND submitted_by_user_id = $2 AND LOWER(player_name) = LOWER($3) AND status = 'pending'`,
      [albumId, req.user.id, playerName]
    );
    if (dup) {
      return res.json({ success: true, message: 'You already have a pending tag for this player in this album.' });
    }

    await query(
      `INSERT INTO album_player_tag_suggestions
         (album_id, studio_id, submitted_by_user_id, player_name, player_number, notes, submitted_by_name, submitted_by_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        albumId,
        Number(album.studioId),
        req.user.id,
        playerName,
        playerNumber || null,
        notes || null,
        String(req.user.name || req.user.email || '').trim() || null,
        String(req.user.email || '').trim() || null,
      ]
    );
    return res.json({ success: true, message: 'Thanks! The studio will review your tag and make sure this player is found in future photos.' });
  } catch (err) {
    console.error('[ALBUM-TAG] submit error:', err);
    return res.status(500).json({ error: 'Failed to submit tag suggestion' });
  }
});

// Admin: get pending album player suggestions for a specific album
router.get('/:albumId/player-suggestions', adminRequired, async (req, res) => {
  try {
    await ensureAlbumPlayerSuggestionsTable();
    const albumId = Number(req.params.albumId);
    const status = String(req.query.status || 'pending');
    const rows = await queryRows(
      `SELECT id, player_name as playerName, player_number as playerNumber, notes,
              submitted_by_name as submittedByName, submitted_by_email as submittedByEmail,
              status, submitted_at as submittedAt, reviewed_at as reviewedAt, review_note as reviewNote
       FROM album_player_tag_suggestions
       WHERE album_id = $1 AND status = $2
       ORDER BY submitted_at DESC`,
      [albumId, status]
    );
    return res.json({ suggestions: rows || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin: get pending counts per album for the studio
router.get('/player-suggestions/pending-counts', adminRequired, async (req, res) => {
  try {
    await ensureAlbumPlayerSuggestionsTable();
    const studioId = Number(req.user.studioId || req.query.studioId || 0);
    if (!studioId) return res.json({ counts: {} });
    const rows = await queryRows(
      `SELECT album_id as albumId, COUNT(*) as cnt
       FROM album_player_tag_suggestions
       WHERE studio_id = $1 AND status = 'pending'
       GROUP BY album_id`,
      [studioId]
    );
    const counts = {};
    for (const r of (rows || [])) counts[String(r.albumId)] = Number(r.cnt || 0);
    return res.json({ counts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin: approve or reject an album player suggestion
router.post('/player-suggestions/:id/review', adminRequired, async (req, res) => {
  try {
    await ensureAlbumPlayerSuggestionsTable();
    const id = Number(req.params.id);
    const decision = String(req.body?.decision || '');
    const reviewNote = String(req.body?.note || '').trim();

    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }

    const row = await queryRow(
      `SELECT id, studio_id as studioId FROM album_player_tag_suggestions WHERE id = $1`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Suggestion not found' });

    const studioId = Number(req.user.studioId || 0);
    if (req.user.role === 'studio_admin' && Number(row.studioId) !== studioId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await query(
      `UPDATE album_player_tag_suggestions
       SET status = $1, reviewed_at = GETDATE(), reviewed_by_user_id = $2, review_note = $3
       WHERE id = $4`,
      [decision === 'approve' ? 'approved' : 'rejected', req.user.id, reviewNote || null, id]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

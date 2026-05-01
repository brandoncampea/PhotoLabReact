import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { requireActiveSubscription } from '../middleware/subscription.js';
import { enforceAlbumQuotaForStudio } from '../middleware/subscription.js';
import { authRequired } from '../middleware/auth.js';
import { deleteBlobByUrl } from '../services/azureStorage.js';
const router = express.Router();

const ensureAlbumBatchShippingColumn = async () => {
  await query(`
    IF COL_LENGTH('albums', 'batch_shipping_active') IS NULL
      ALTER TABLE albums ADD batch_shipping_active BIT NOT NULL CONSTRAINT DF_albums_batch_shipping_active DEFAULT 0;
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
  await ensureAlbumSchoolTagSchema();
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
      `SELECT TOP 1 id
       FROM studio_school_roster
       WHERE studio_id = $1
         AND LOWER(school_name) = LOWER($2)`,
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
    await ensureAlbumSchema();
    const { studioSlug } = req.query;
    if (!studioSlug) {
      return res.status(400).json({ error: 'studioSlug is required' });
    }
    // Find studio by public_slug
    const studio = await queryRow('SELECT id FROM studios WHERE public_slug = $1', [studioSlug]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }
    // Only return albums that are not deleted and are public (add more filters if needed)
    const albums = await queryRows(`
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
        COALESCE(sc.is_active, 0) as studioBatchShippingActive,
        sc.batch_deadline as batchDeadline,
        a.created_at as createdDate
      FROM albums a
      LEFT JOIN shipping_config sc ON sc.id = a.studio_id
      WHERE a.studio_id = $1
      ORDER BY a.created_at DESC
    `, [studio.id]);
    const albumsWithPreviews = await addAlbumPreviewImages(albums);
    res.json(albumsWithPreviews.map(signAlbumForResponse));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const signAlbumForResponse = (album) => ({
  ...album,
  batchShippingActive: Boolean(album?.batchShippingActive),
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
        id,
        album_id as albumId,
        ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY created_at DESC) as rowNumber
      FROM photos
      WHERE album_id IN (${placeholders})
    )
    SELECT id, albumId
    FROM ranked_photos
    WHERE rowNumber <= 5
    ORDER BY albumId, rowNumber
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
    await ensureAlbumSchema();
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
          a.photo_count as photoCount,
          a.category,
          a.school_tags as schoolTags,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          COALESCE(a.batch_shipping_active, 0) as batchShippingActive,
          a.created_at as createdDate,
          a.studio_id as "studioId",
          s.public_slug as "studioPublicSlug"
        FROM albums a
        LEFT JOIN studios s ON s.id = a.studio_id
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
          a.photo_count as photoCount,
          a.category,
          a.school_tags as schoolTags,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          COALESCE(a.batch_shipping_active, 0) as batchShippingActive,
          a.created_at as createdDate,
          a.studio_id as "studioId",
          s.public_slug as "studioPublicSlug"
        FROM albums a
        LEFT JOIN studios s ON s.id = a.studio_id
        ORDER BY a.created_at DESC
      `);
    } else {
      console.log('ALBUMS ROUTE: No studioId and not super_admin, returning empty array');
      return res.json([]);
    }

    // Fetch product count and net revenue for each album
    const albumIds = albums.map(a => a.id);
    let statsMap = new Map();
    let viewsMap = new Map();
    if (albumIds.length > 0) {
      const placeholders = albumIds.map((_, i) => `$${i + 1}`).join(',');
      const statsRows = await queryRows(`
        SELECT ph.album_id as albumId,
               SUM(oi.quantity) as productCount,
               SUM((oi.price - COALESCE(ps.cost, prod.cost, 0)) * oi.quantity) as netRevenue
        FROM order_items oi
        INNER JOIN photos ph ON ph.id = oi.photo_id
        INNER JOIN albums p ON p.id = ph.album_id
        LEFT JOIN products prod ON prod.id = oi.product_id
        LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
        WHERE p.id IN (${placeholders})
        GROUP BY ph.album_id
      `, albumIds);
      statsMap = new Map(statsRows.map(row => [row.albumId, row]));

      // Fetch total album views from analytics (if available)
      try {
        const viewRows = await queryRows(`
          SELECT
            TRY_CAST(JSON_VALUE(event_data, '$.albumId') AS INT) as albumId,
            SUM(CASE WHEN event_type = 'album_view' THEN 1 ELSE 0 END) as viewOpenCount,
            SUM(CASE WHEN event_type = 'album_card_click' THEN 1 ELSE 0 END) as viewClickCount,
            COUNT(*) as viewCount
          FROM analytics
          WHERE event_type IN ('album_view', 'album_card_click')
            AND TRY_CAST(JSON_VALUE(event_data, '$.albumId') AS INT) IN (${placeholders})
          GROUP BY TRY_CAST(JSON_VALUE(event_data, '$.albumId') AS INT)
        `, albumIds);
        viewsMap = new Map(viewRows.map(row => [Number(row.albumId), {
          viewCount: Number(row.viewCount) || 0,
          viewOpenCount: Number(row.viewOpenCount) || 0,
          viewClickCount: Number(row.viewClickCount) || 0,
        }]));
      } catch (analyticsError) {
        // Analytics table may not exist in all environments.
        console.warn('[GET /albums] analytics unavailable:', analyticsError?.message || analyticsError);
      }
    }

    const albumsWithPreviews = await addAlbumPreviewImages(albums);
    const albumsWithStats = albumsWithPreviews.map(album => {
      const stats = statsMap.get(album.id) || {};
      const views = viewsMap.get(Number(album.id)) || {};
      return {
        ...signAlbumForResponse(album),
        productCount: Number(stats.productCount) || 0,
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
    await ensureAlbumSchema();
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
    await ensureAlbumSchema();
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
    await ensureAlbumSchema();
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint, batchShippingActive, schoolTags } = req.body;
    const albumName = title || name || '';
    const normalizedSchoolTags = parseSchoolTags(schoolTags);
    
    if (!albumName) {
      return res.status(400).json({ error: 'Album name is required' });
    }

    if (req.studioId) {
      await enforceAlbumQuotaForStudio(req.studioId);
    }
    
    const result = await queryRow(`
      INSERT INTO albums (name, title, description, cover_image_url, cover_photo_id, category, school_tags, price_list_id, is_password_protected, password, password_hint, studio_id, batch_shipping_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
    await ensureAlbumSchema();
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint, batchShippingActive, schoolTags } = req.body;
    
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
    
    await query(`
      UPDATE albums 
      SET name = $1, title = $2, description = $3, cover_image_url = $4, cover_photo_id = $5, category = $6, school_tags = $7, price_list_id = $8, 
          is_password_protected = $9, password = $10, password_hint = $11, batch_shipping_active = $12
        WHERE id = $13
    `, [
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
      req.params.id,
    ]);

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
        created_at as createdDate
      FROM albums WHERE id = $1
    `, [req.params.id]);
    res.json(signAlbumForResponse(album));
  } catch (error) {
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
    await query(`DELETE FROM order_items WHERE photo_id IN (SELECT id FROM photos WHERE album_id = $1)`, [albumId]);
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

export default router;

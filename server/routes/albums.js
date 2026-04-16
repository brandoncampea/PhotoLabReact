import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { requireActiveSubscription } from '../middleware/subscription.js';
import { enforceAlbumQuotaForStudio } from '../middleware/subscription.js';
import { authRequired } from '../middleware/auth.js';
import { deleteBlobByUrl } from '../services/azureStorage.js';
const router = express.Router();

// Public: Get albums by studioSlug (for customer view)
router.get('/public', async (req, res) => {
  try {
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
        a.price_list_id as priceListId,
        a.is_password_protected as isPasswordProtected,
        a.password,
        a.password_hint as passwordHint,
        COALESCE(sc.is_active, 0) as batchShippingActive,
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
    console.log('ALBUMS ROUTE: headers:', req.headers);
    const user = req.user;
    console.log('ALBUMS ROUTE: user:', user);
    let albums;
    const studioId = user?.studio_id;
    if (studioId) {
      // If studioId is present (even for super_admin), filter by studio
      console.log('ALBUMS ROUTE: Filtering by studioId:', studioId);
      albums = await queryRows(`
        SELECT 
          a.id,
          COALESCE(a.name, a.title) as name,
          a.description,
          a.cover_image_url as coverImageUrl,
          a.cover_photo_id as coverPhotoId,
          a.photo_count as photoCount,
          a.category,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          a.created_at as createdDate,
          a.studio_id as "studioId"
        FROM albums a
        WHERE a.studio_id = $1
        ORDER BY a.created_at DESC
      `, [studioId]);
    } else if (user?.role === 'super_admin') {
      // Only show all albums if super_admin and no studioId
      console.log('ALBUMS ROUTE: super_admin, no studioId, returning all albums');
      albums = await queryRows(`
        SELECT 
          a.id,
          COALESCE(a.name, a.title) as name,
          a.description,
          a.cover_image_url as coverImageUrl,
          a.cover_photo_id as coverPhotoId,
          a.photo_count as photoCount,
          a.category,
          a.price_list_id as priceListId,
          a.is_password_protected as isPasswordProtected,
          a.password,
          a.password_hint as passwordHint,
          a.created_at as createdDate,
          a.studio_id as "studioId"
        FROM albums a
        ORDER BY a.created_at DESC
      `);
    } else {
      // No studioId and not super_admin
      console.log('ALBUMS ROUTE: No studioId and not super_admin, returning empty array');
      return res.json([]);
    }
    const albumsWithPreviews = await addAlbumPreviewImages(albums);
    res.json(albumsWithPreviews.map(signAlbumForResponse));
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
        a.price_list_id as priceListId,
        a.is_password_protected as isPasswordProtected,
        a.password,
        a.password_hint as passwordHint,
        COALESCE(sc.is_active, 0) as batchShippingActive,
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
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint } = req.body;
    const albumName = title || name || '';
    
    if (!albumName) {
      return res.status(400).json({ error: 'Album name is required' });
    }

    if (req.studioId) {
      await enforceAlbumQuotaForStudio(req.studioId);
    }
    
    const result = await queryRow(`
      INSERT INTO albums (name, title, description, cover_image_url, cover_photo_id, category, price_list_id, is_password_protected, password, password_hint, studio_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      albumName,
      albumName,
      description || null,
      coverImageUrl || null,
      coverPhotoId || null,
      category || null,
      priceListId || null,
      !!isPasswordProtected,
      isPasswordProtected ? password : null,
      isPasswordProtected ? passwordHint : null,
      req.studioId || null,
    ]);
    
    const album = await queryRow(`
      SELECT 
        id,
        COALESCE(name, title) as name,
        description,
        cover_image_url as coverImageUrl,
        cover_photo_id as coverPhotoId,
        photo_count as photoCount,
        category,
        price_list_id as priceListId,
        is_password_protected as isPasswordProtected,
        password,
        password_hint as passwordHint,
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
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint } = req.body;
    
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
    const newPriceListId = priceListId !== undefined ? priceListId : currentAlbum.price_list_id;
    const newIsProtected = isPasswordProtected !== undefined ? isPasswordProtected : currentAlbum.is_password_protected;
    const newPassword = newIsProtected ? (password !== undefined ? password : currentAlbum.password) : null;
    const newPasswordHint = newIsProtected ? (passwordHint !== undefined ? passwordHint : currentAlbum.password_hint) : null;
    
    await query(`
      UPDATE albums 
      SET name = $1, title = $2, description = $3, cover_image_url = $4, cover_photo_id = $5, category = $6, price_list_id = $7, 
          is_password_protected = $8, password = $9, password_hint = $10
      WHERE id = $11
    `, [
      albumName,
      albumName,
      newDescription,
      newCoverUrl,
      newCoverPhotoId,
      newCategory,
      newPriceListId,
      !!newIsProtected,
      newPassword,
      newPasswordHint,
      req.params.id,
    ]);
    
    const album = await queryRow(`
      SELECT 
        id,
        COALESCE(name, title) as name,
        description,
        cover_image_url as coverImageUrl,
        cover_photo_id as coverPhotoId,
        photo_count as photoCount,
        category,
        price_list_id as priceListId,
        is_password_protected as isPasswordProtected,
        password,
        password_hint as passwordHint,
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

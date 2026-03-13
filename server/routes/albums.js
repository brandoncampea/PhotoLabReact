import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { enforceAlbumQuotaForStudio } from '../middleware/subscription.js';
const router = express.Router();

const signAlbumForResponse = (album) => ({
  ...album,
  coverImageUrl: album?.coverPhotoId
    ? `/api/photos/${album.coverPhotoId}/asset?variant=full`
    : album?.coverImageUrl
      ? `/api/photos/proxy?source=${encodeURIComponent(album.coverImageUrl)}`
      : album?.coverImageUrl,
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
    current.push(`/api/photos/${row.id}/asset?variant=full`);
    previewMap.set(row.albumId, current);
  });

  return albums.map((album) => ({
    ...album,
    previewImageUrls: previewMap.get(album.id) || [],
  }));
};

// Get all albums
router.get('/', async (req, res) => {
  try {
    const studioSlug = String(req.query.studioSlug || '').trim().toLowerCase();
    const hasStudioSlugColumn = studioSlug ? await queryRow(
      `SELECT TOP 1 1 as existsFlag
       FROM sys.columns c
       INNER JOIN sys.tables t ON t.object_id = c.object_id
       WHERE t.name = 'studios' AND c.name = 'public_slug'`
    ) : { existsFlag: 1 };

    if (studioSlug && !hasStudioSlugColumn) {
      return res.json([]);
    }

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
        a.created_at as createdDate
      FROM albums a
      LEFT JOIN studios s ON s.id = a.studio_id
      WHERE ($1 = '' OR LOWER(COALESCE(s.public_slug, '')) = $1)
      ORDER BY a.created_at DESC
    `, [studioSlug]);
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
    await query('DELETE FROM albums WHERE id = $1', [req.params.id]);
    res.json({ message: 'Album deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

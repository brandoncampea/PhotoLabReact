import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
const router = express.Router();

// Get all albums
router.get('/', async (req, res) => {
  try {
    const albums = await queryRows(`
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
      FROM albums 
      ORDER BY created_at DESC
    `);
    res.json(albums);
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
    res.json(album);
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
    
    const result = await queryRow(`
      INSERT INTO albums (name, title, description, cover_image_url, cover_photo_id, category, price_list_id, is_password_protected, password, password_hint)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
    res.status(201).json(album);
  } catch (error) {
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
    const newCoverUrl = coverImageUrl !== undefined ? coverImageUrl : currentAlbum.cover_image_url;
    const newCoverPhotoId = coverPhotoId !== undefined ? coverPhotoId : currentAlbum.cover_photo_id;
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
    res.json(album);
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

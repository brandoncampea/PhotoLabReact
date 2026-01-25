import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get all albums
router.get('/', (req, res) => {
  try {
    const albums = db.prepare(`
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
    `).all();
    res.json(albums);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get album by ID
router.get('/:id', (req, res) => {
  try {
    const album = db.prepare(`
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
      FROM albums WHERE id = ?
    `).get(req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }
    res.json(album);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create album
router.post('/', (req, res) => {
  try {
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint } = req.body;
    const albumName = title || name || '';
    
    if (!albumName) {
      return res.status(400).json({ error: 'Album name is required' });
    }
    
    const result = db.prepare(`
      INSERT INTO albums (name, title, description, cover_image_url, cover_photo_id, category, price_list_id, is_password_protected, password, password_hint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      albumName, 
      albumName,
      description || null, 
      coverImageUrl || null,
      coverPhotoId || null,
      category || null,
      priceListId || null,
      isPasswordProtected ? 1 : 0,
      isPasswordProtected ? password : null,
      isPasswordProtected ? passwordHint : null
    );
    
    const album = db.prepare(`
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
      FROM albums WHERE id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(album);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update album
router.put('/:id', (req, res) => {
  try {
    const { title, name, description, coverImageUrl, coverPhotoId, category, priceListId, isPasswordProtected, password, passwordHint } = req.body;
    
    // Get the current album to preserve existing values
    const currentAlbum = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
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
    
    db.prepare(`
      UPDATE albums 
      SET name = ?, title = ?, description = ?, cover_image_url = ?, cover_photo_id = ?, category = ?, price_list_id = ?, 
          is_password_protected = ?, password = ?, password_hint = ?
      WHERE id = ?
    `).run(
      albumName,
      albumName,
      newDescription,
      newCoverUrl,
      newCoverPhotoId,
      newCategory,
      newPriceListId,
      newIsProtected ? 1 : 0,
      newPassword,
      newPasswordHint,
      req.params.id
    );
    
    const album = db.prepare(`
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
      FROM albums WHERE id = ?
    `).get(req.params.id);
    res.json(album);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete album
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
    res.json({ message: 'Album deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

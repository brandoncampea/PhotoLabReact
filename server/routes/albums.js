import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get all albums
router.get('/', (req, res) => {
  try {
    const albums = db.prepare(`
      SELECT 
        id, name, description, cover_image_url as coverImageUrl, 
        photo_count as photoCount, category, price_list_id as priceListId,
        is_password_protected as isPasswordProtected, password, password_hint as passwordHint,
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
        id, name, description, cover_image_url as coverImageUrl, 
        photo_count as photoCount, category, price_list_id as priceListId,
        is_password_protected as isPasswordProtected, password, password_hint as passwordHint,
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
    const { name, description, coverImageUrl, category, priceListId, isPasswordProtected, password, passwordHint } = req.body;
    const result = db.prepare(`
      INSERT INTO albums (name, description, cover_image_url, category, price_list_id, is_password_protected, password, password_hint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, 
      description || null, 
      coverImageUrl || null, 
      category || null,
      priceListId || null,
      isPasswordProtected ? 1 : 0,
      isPasswordProtected ? password : null,
      isPasswordProtected ? passwordHint : null
    );
    
    const album = db.prepare(`
      SELECT 
        id, name, description, cover_image_url as coverImageUrl, 
        photo_count as photoCount, category, price_list_id as priceListId,
        is_password_protected as isPasswordProtected, password, password_hint as passwordHint,
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
    const { name, description, coverImageUrl, category, priceListId, isPasswordProtected, password, passwordHint } = req.body;
    db.prepare(`
      UPDATE albums 
      SET name = ?, description = ?, cover_image_url = ?, category = ?, price_list_id = ?, 
          is_password_protected = ?, password = ?, password_hint = ?
      WHERE id = ?
    `).run(
      name,
      description || null,
      coverImageUrl || null,
      category || null,
      priceListId || null,
      isPasswordProtected ? 1 : 0,
      isPasswordProtected ? password : null,
      isPasswordProtected ? passwordHint : null,
      req.params.id
    );
    
    const album = db.prepare(`
      SELECT 
        id, name, description, cover_image_url as coverImageUrl, 
        photo_count as photoCount, category, price_list_id as priceListId,
        is_password_protected as isPasswordProtected, password, password_hint as passwordHint,
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

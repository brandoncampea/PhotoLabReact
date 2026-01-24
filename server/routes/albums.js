import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get all albums
router.get('/', (req, res) => {
  try {
    const albums = db.prepare('SELECT * FROM albums ORDER BY created_at DESC').all();
    res.json(albums);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get album by ID
router.get('/:id', (req, res) => {
  try {
    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
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
    const { title, description, category, cover_image } = req.body;
    const result = db.prepare(`
      INSERT INTO albums (title, description, category, cover_image)
      VALUES (?, ?, ?, ?)
    `).run(title, description, category, cover_image || null);
    
    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(album);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update album
router.put('/:id', (req, res) => {
  try {
    const { title, description, category, cover_image, is_shared } = req.body;
    db.prepare(`
      UPDATE albums 
      SET title = ?, description = ?, category = ?, cover_image = ?, is_shared = ?
      WHERE id = ?
    `).run(title, description, category, cover_image, is_shared ? 1 : 0, req.params.id);
    
    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
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

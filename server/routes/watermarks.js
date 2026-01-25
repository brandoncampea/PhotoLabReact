import express from 'express';
import { db } from '../database.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all watermarks
router.get('/', (req, res) => {
  try {
    const watermarks = db.prepare(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      ORDER BY name ASC
    `).all();
    res.json(watermarks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get default watermark
router.get('/default', (req, res) => {
  try {
    const watermark = db.prepare(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE is_default = 1
      LIMIT 1
    `).get();
    
    if (!watermark) {
      return res.status(404).json({ error: 'No default watermark configured' });
    }
    res.json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get watermark by ID
router.get('/:id', (req, res) => {
  try {
    const watermark = db.prepare(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = ?
    `).get(req.params.id);
    
    if (!watermark) {
      return res.status(404).json({ error: 'Watermark not found' });
    }
    res.json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create watermark
router.post('/', adminRequired, (req, res) => {
  try {
    const { name, imageUrl, position, opacity, isDefault, tiled } = req.body;
    
    if (isDefault) {
      db.prepare('UPDATE watermarks SET is_default = 0').run();
    }

    const result = db.prepare(`
      INSERT INTO watermarks (name, image_url, position, opacity, is_default, tiled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, imageUrl, position || 'bottom-right', opacity ?? 0.5, isDefault ? 1 : 0, tiled ? 1 : 0);

    const watermark = db.prepare(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update watermark
router.put('/:id', adminRequired, (req, res) => {
  try {
    const { name, imageUrl, position, opacity, isDefault, tiled } = req.body;
    
    if (isDefault) {
      db.prepare('UPDATE watermarks SET is_default = 0').run();
    }

    db.prepare(`
      UPDATE watermarks
      SET name = ?, image_url = ?, position = ?, opacity = ?, is_default = ?, tiled = ?
      WHERE id = ?
    `).run(name, imageUrl, position, opacity, isDefault ? 1 : 0, tiled ? 1 : 0, req.params.id);

    const watermark = db.prepare(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = ?
    `).get(req.params.id);

    res.json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete watermark
router.delete('/:id', adminRequired, (req, res) => {
  try {
    db.prepare('DELETE FROM watermarks WHERE id = ?').run(req.params.id);
    res.json({ message: 'Watermark deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

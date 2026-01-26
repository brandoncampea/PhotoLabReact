import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database.js';
const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for watermark uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'watermark-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

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
router.post('/', upload.single('image'), (req, res) => {
  try {
    console.log('POST /watermarks - body:', req.body, 'file:', req.file?.filename);
    
    const { name, position, opacity, isDefault, tiled } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image is required' });
    }
    
    if (isDefault === 'true' || isDefault === true) {
      db.prepare('UPDATE watermarks SET is_default = 0').run();
    }

    const result = db.prepare(`
      INSERT INTO watermarks (name, image_url, position, opacity, is_default, tiled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name, 
      imageUrl, 
      position || 'bottom-right', 
      opacity ? parseFloat(opacity) : 0.5, 
      (isDefault === 'true' || isDefault === true) ? 1 : 0, 
      (tiled === 'true' || tiled === true) ? 1 : 0
    );

    const watermark = db.prepare(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(watermark);
  } catch (error) {
    console.error('Watermark POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update watermark
router.put('/:id', upload.single('image'), (req, res) => {
  try {
    console.log('PUT /watermarks/:id - body:', req.body, 'file:', req.file?.filename);
    
    const { name, position, opacity, isDefault, tiled } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    if (isDefault === 'true' || isDefault === true) {
      db.prepare('UPDATE watermarks SET is_default = 0').run();
    }

    db.prepare(`
      UPDATE watermarks
      SET name = ?, image_url = ?, position = ?, opacity = ?, is_default = ?, tiled = ?
      WHERE id = ?
    `).run(
      name, 
      imageUrl, 
      position, 
      opacity ? parseFloat(opacity) : 0.5, 
      (isDefault === 'true' || isDefault === true) ? 1 : 0, 
      (tiled === 'true' || tiled === true) ? 1 : 0, 
      req.params.id
    );

    const watermark = db.prepare(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = ?
    `).get(req.params.id);

    res.json(watermark);
  } catch (error) {
    console.error('Watermark PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete watermark
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM watermarks WHERE id = ?').run(req.params.id);
    res.json({ message: 'Watermark deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

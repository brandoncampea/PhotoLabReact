import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryRow, queryRows, query } from '../mssql.mjs';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';
const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for watermark uploads
const upload = multer({
  storage: multer.memoryStorage(),
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
router.get('/', async (req, res) => {
  try {
    const watermarks = await queryRows(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      ORDER BY name ASC
    `);
    res.json(watermarks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get default watermark
router.get('/default', async (req, res) => {
  try {
    const watermark = await queryRow(`
      SELECT TOP 1 id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE is_default = 1
    `);
    
    if (!watermark) {
      return res.status(404).json({ error: 'No default watermark configured' });
    }
    res.json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get watermark by ID
router.get('/:id', async (req, res) => {
  try {
    const watermark = await queryRow(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = $1
    `, [req.params.id]);
    
    if (!watermark) {
      return res.status(404).json({ error: 'Watermark not found' });
    }
    res.json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create watermark
router.post('/', upload.single('image'), async (req, res) => {
  try {
    console.log('POST /watermarks - body:', req.body, 'file:', req.file?.originalname);
    const { name, position, opacity, isDefault, tiled } = req.body;
    let imageUrl = null;
    if (req.file) {
      // Upload to Azure Blob Storage
      const ext = path.extname(req.file.originalname) || '.png';
      const blobName = `watermarks/watermark-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      imageUrl = await uploadImageBufferToAzure(req.file.buffer, blobName, req.file.mimetype);
    }
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image is required' });
    }
    if (isDefault === 'true' || isDefault === true) {
      await query('UPDATE watermarks SET is_default = 0');
    }
    const result = await queryRow(`
      INSERT INTO watermarks (name, image_url, position, opacity, is_default, tiled)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      name,
      imageUrl,
      position || 'bottom-right',
      opacity ? parseFloat(opacity) : 0.5,
      (isDefault === 'true' || isDefault === true),
      (tiled === 'true' || tiled === true)
    ]);
    const watermark = await queryRow(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = $1
    `, [result.id]);
    res.status(201).json(watermark);
  } catch (error) {
    console.error('Watermark POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update watermark
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    console.log('PUT /watermarks/:id - body:', req.body, 'file:', req.file?.originalname);
    const { name, position, opacity, isDefault, tiled } = req.body;
    let imageUrl = req.body.imageUrl;
    if (req.file) {
      // Upload to Azure Blob Storage
      const ext = path.extname(req.file.originalname) || '.png';
      const blobName = `watermarks/watermark-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      imageUrl = await uploadImageBufferToAzure(req.file.buffer, blobName, req.file.mimetype);
    }
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }
    if (isDefault === 'true' || isDefault === true) {
      await query('UPDATE watermarks SET is_default = 0');
    }
    await query(`
      UPDATE watermarks
      SET name = $1, image_url = $2, position = $3, opacity = $4, is_default = $5, tiled = $6
      WHERE id = $7
    `, [
      name,
      imageUrl,
      position,
      opacity ? parseFloat(opacity) : 0.5,
      (isDefault === 'true' || isDefault === true),
      (tiled === 'true' || tiled === true),
      req.params.id
    ]);
    const watermark = await queryRow(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate
      FROM watermarks
      WHERE id = $1
    `, [req.params.id]);
    res.json(watermark);
  } catch (error) {
    console.error('Watermark PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete watermark
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM watermarks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Watermark deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

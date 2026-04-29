import express from 'express';
const router = express.Router();
import fetch from 'node-fetch';
import { downloadBlob } from '../services/azureStorage.js';

// Proxy watermark image (local or remote/Azure) to client
router.get('/proxy', async (req, res) => {
  const source = req.query.source;
  console.log('[WATERMARK PROXY] source param:', source);
  if (!source) return res.status(400).json({ error: 'Missing source parameter' });
  try {
    if (String(source).startsWith('http')) {
      // Remote/Azure URL
      const upstream = await fetch(source);
      if (!upstream.ok) return res.status(404).json({ error: 'Failed to fetch remote watermark' });
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
      upstream.body.pipe(res);
      return;
    }
    // Azure/local blob path
    const blob = await downloadBlob(source, 'stream');
    console.log('[WATERMARK PROXY] downloadBlob result:', blob && typeof blob === 'object' ? Object.keys(blob) : blob);
    const stream = blob?.blobDownloadStream || blob?.readableStreamBody;
    if (!stream) return res.status(404).json({ error: 'Blob not found', debug: { source } });
    res.setHeader('Content-Type', blob.contentType || 'image/png');
    stream.pipe(res);
  } catch (error) {
    console.error('Watermark proxy error:', error);
    res.status(500).json({ error: error.message, debug: { source } });
  }
});
import { authRequired } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { uploadImageBufferToAzure } from '../services/azureStorage.js';

const WATERMARK_URL_CACHE_TTL_MS = 5 * 60 * 1000;
const watermarkUrlAvailabilityCache = new Map();

const isUrlAvailable = async (url) => {
  if (!url) return false;
  const now = Date.now();
  const cached = watermarkUrlAvailabilityCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.available;
  }

  let available = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    available = response.ok;
  } catch {
    available = false;
  }

  watermarkUrlAvailabilityCache.set(url, {
    available,
    expiresAt: now + WATERMARK_URL_CACHE_TTL_MS,
  });
  return available;
};

const normalizeWatermarkImageUrl = async (watermark) => {
  if (!watermark) return watermark;
  const imageUrl = String(watermark.imageUrl || '');
  if (!imageUrl) return watermark;

  // Always return Azure Blob Storage URL if possible
  if (imageUrl.startsWith('/uploads/')) {
    const filename = imageUrl.split('/').pop();
    const account = process.env.AZURE_STORAGE_ACCOUNT;
    const container = process.env.AZURE_CONTAINER_NAME;
    if (account && container && filename) {
      const azureWatermarkUrl = `https://${account}.blob.core.windows.net/${container}/watermarks/${filename}`;
      return {
        ...watermark,
        imageUrl: azureWatermarkUrl,
      };
    }
  }
  // If already an Azure or http(s) URL, return as is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/api/')) {
    return watermark;
  }
  return watermark;
};



// Public endpoint: get the default watermark for a given studio (no auth)
router.get('/public-default', async (req, res) => {
  try {
    const studioId = req.query.studioId;
    if (!studioId) return res.status(400).json({ error: 'studioId is required' });
    let watermark;

    try {
      watermark = await queryRow(`
        SELECT TOP 1 id, name, image_url as imageUrl, position, opacity,
          is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
        FROM watermarks
        WHERE is_default = 1 AND studio_id = $1
      `, [studioId]);
    } catch (err) {
      // Backward-compat for older databases that do not have watermarks.studio_id
      const message = String(err?.message || '');
      if (!/Invalid column name 'studio_id'/i.test(message)) {
        throw err;
      }

      watermark = await queryRow(`
        SELECT TOP 1 id, name, image_url as imageUrl, position, opacity,
          is_default as isDefault, tiled, created_at as createdDate
        FROM watermarks
        WHERE is_default = 1
      `);
    }

    if (!watermark) return res.status(404).json({ error: 'No default watermark found for this studio' });
    res.json(await normalizeWatermarkImageUrl(watermark));
  } catch (error) {
    console.error('GET /api/watermarks error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auth required for all except public endpoints
router.use(authRequired);

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

// Get all watermarks (studio-specific, super admin sees all)
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    let watermarks;
    if (user?.role === 'super_admin') {
      watermarks = await queryRows(`
        SELECT id, name, image_url as imageUrl, position, opacity, 
               is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
        FROM watermarks
        ORDER BY name ASC
      `);
    } else {
      const studioId = user?.studio_id;
      if (!studioId) {
        return res.status(403).json({ error: 'Studio ID required' });
      }
      watermarks = await queryRows(`
        SELECT id, name, image_url as imageUrl, position, opacity, 
               is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
        FROM watermarks
        WHERE studio_id = $1
        ORDER BY name ASC
      `, [studioId]);
    }
    res.json(watermarks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get default watermark (studio-specific, super admin sees all)
router.get('/default', async (req, res) => {
  try {
    const user = req.user;
    let watermark;
    if (user?.role === 'super_admin') {
      watermark = await queryRow(`
        SELECT TOP 1 id, name, image_url as imageUrl, position, opacity, 
               is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
        FROM watermarks
        WHERE is_default = 1
      `);
    } else {
      const studioId = user?.studio_id;
      if (!studioId) {
        return res.status(403).json({ error: 'Studio ID required' });
      }
      watermark = await queryRow(`
        SELECT TOP 1 id, name, image_url as imageUrl, position, opacity, 
               is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
        FROM watermarks
        WHERE is_default = 1 AND studio_id = $1
      `, [studioId]);
    }
    if (!watermark) {
      return res.status(404).json({ error: 'No default watermark configured' });
    }
    res.json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get watermark by ID (studio-specific, super admin sees all)
router.get('/:id', async (req, res) => {
  try {
    const user = req.user;
    let watermark;
    if (user?.role === 'super_admin') {
      watermark = await queryRow(`
        SELECT id, name, image_url as imageUrl, position, opacity, 
               is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
        FROM watermarks
        WHERE id = $1
      `, [req.params.id]);
    } else {
      const studioId = user?.studio_id;
      if (!studioId) {
        return res.status(403).json({ error: 'Studio ID required' });
      }
      watermark = await queryRow(`
        SELECT id, name, image_url as imageUrl, position, opacity, 
               is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
        FROM watermarks
        WHERE id = $1 AND studio_id = $2
      `, [req.params.id, studioId]);
    }
    if (!watermark) {
      return res.status(404).json({ error: 'Watermark not found' });
    }
    res.json(watermark);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create watermark (studio-specific)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const user = req.user;
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
    let studioId = user?.role === 'super_admin' ? (req.body.studioId || null) : user?.studio_id;
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    if (isDefault === 'true' || isDefault === true) {
      await query('UPDATE watermarks SET is_default = 0 WHERE studio_id = $1', [studioId]);
    }
    const result = await queryRow(`
      INSERT INTO watermarks (name, image_url, position, opacity, is_default, tiled, studio_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      name,
      imageUrl,
      position || 'bottom-right',
      opacity ? parseFloat(opacity) : 0.5,
      (isDefault === 'true' || isDefault === true),
      (tiled === 'true' || tiled === true),
      studioId
    ]);
    const watermark = await queryRow(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
      FROM watermarks
      WHERE id = $1
    `, [result.id]);
    res.status(201).json(watermark);
  } catch (error) {
    console.error('Watermark POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update watermark (studio-specific)
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const user = req.user;
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
    let studioId = user?.role === 'super_admin' ? (req.body.studioId || null) : user?.studio_id;
    let watermark = await queryRow('SELECT * FROM watermarks WHERE id = $1', [req.params.id]);
    if (!watermark) return res.status(404).json({ error: 'Watermark not found' });
    if (studioId && watermark.studio_id !== studioId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Always update studio_id to ensure it is set
    await query('UPDATE watermarks SET studio_id = $1 WHERE id = $2', [studioId, req.params.id]);
    if (isDefault === 'true' || isDefault === true) {
      await query('UPDATE watermarks SET is_default = 0 WHERE studio_id = $1', [watermark.studio_id]);
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
    watermark = await queryRow(`
      SELECT id, name, image_url as imageUrl, position, opacity, 
             is_default as isDefault, tiled, created_at as createdDate, studio_id as studioId
      FROM watermarks
      WHERE id = $1
    `, [req.params.id]);
    res.json(watermark);
  } catch (error) {
    console.error('Watermark PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete watermark (studio-specific)
router.delete('/:id', async (req, res) => {
  try {
    const user = req.user;
    let studioId = user?.role === 'super_admin' ? null : user?.studio_id;
    let watermark = await queryRow('SELECT * FROM watermarks WHERE id = $1', [req.params.id]);
    if (!watermark) return res.status(404).json({ error: 'Watermark not found' });
    if (studioId && watermark.studio_id !== studioId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await query('DELETE FROM watermarks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Watermark deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

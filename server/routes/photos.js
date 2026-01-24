import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../database.js';
const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// Get photos by album
router.get('/album/:albumId', (req, res) => {
  try {
    const photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY created_at DESC').all(req.params.albumId);
    res.json(photos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload photos
router.post('/upload', upload.array('photos', 50), (req, res) => {
  try {
    const { albumId, descriptions } = req.body;
    const parsedDescriptions = descriptions ? JSON.parse(descriptions) : [];
    
    const photos = req.files.map((file, index) => {
      const photoUrl = `/uploads/${file.filename}`;
      const result = db.prepare(`
        INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description)
        VALUES (?, ?, ?, ?, ?)
      `).run(albumId, file.originalname, photoUrl, photoUrl, parsedDescriptions[index] || '');
      
      return {
        id: result.lastInsertRowid,
        album_id: parseInt(albumId),
        file_name: file.originalname,
        thumbnail_url: photoUrl,
        full_image_url: photoUrl,
        description: parsedDescriptions[index] || ''
      };
    });

    // Update album photo count
    db.prepare(`
      UPDATE albums 
      SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = ?)
      WHERE id = ?
    `).run(albumId, albumId);

    res.status(201).json(photos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update photo
router.put('/:id', (req, res) => {
  try {
    const { description, metadata } = req.body;
    db.prepare(`
      UPDATE photos 
      SET description = ?, metadata = ?
      WHERE id = ?
    `).run(description, metadata ? JSON.stringify(metadata) : null, req.params.id);
    
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    res.json(photo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete photo
router.delete('/:id', (req, res) => {
  try {
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Delete file from uploads directory
    const filePath = path.join(uploadsDir, path.basename(photo.full_image_url));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);

    // Update album photo count
    db.prepare(`
      UPDATE albums 
      SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = ?)
      WHERE id = ?
    `).run(photo.album_id, photo.album_id);

    res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search photos
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    const photos = db.prepare(`
      SELECT p.*, a.title as album_title 
      FROM photos p
      JOIN albums a ON p.album_id = a.id
      WHERE p.file_name LIKE ? OR p.description LIKE ? OR p.metadata LIKE ?
      ORDER BY p.created_at DESC
      LIMIT 100
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);
    res.json(photos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

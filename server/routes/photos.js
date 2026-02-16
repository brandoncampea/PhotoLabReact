import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { queryRow, queryRows, query } from '../mssql.js';
import csv from 'csv-parser';
import sharp from 'sharp';
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
router.get('/album/:albumId', async (req, res) => {
  try {
    const { playerName } = req.query;
    let query = `
      SELECT 
        id, album_id as albumId, file_name as fileName, 
        thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl,
        description, metadata, player_names as playerNames, 
        width, height, created_at as createdDate
      FROM photos 
      WHERE album_id = $1
    `;
    
    const params = [req.params.albumId];
    
    // Filter by player name if provided
    if (playerName) {
      query += ` AND player_names ILIKE $2`;
      params.push(`%${playerName}%`);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const photos = await queryRows(query, params);
    res.json(photos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload photos
router.post('/upload', upload.array('photos', 50), async (req, res) => {
  try {
    const { albumId, descriptions } = req.body;
    const parsedDescriptions = descriptions ? JSON.parse(descriptions) : [];
    
    const photos = [];
    for (let index = 0; index < req.files.length; index++) {
      const file = req.files[index];
      const photoUrl = `/uploads/${file.filename}`;
      
      // Extract image dimensions
      let width = null;
      let height = null;
      try {
        const metadata = await sharp(file.path).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (err) {
        console.error('Failed to extract image dimensions:', err);
      }
      
      const result = await queryRow(`
        INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, width, height)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [albumId, file.originalname, photoUrl, photoUrl, parsedDescriptions[index] || '', width, height]);
      
      photos.push({
        id: result.id,
        albumId: parseInt(albumId),
        fileName: file.originalname,
        thumbnailUrl: photoUrl,
        fullImageUrl: photoUrl,
        description: parsedDescriptions[index] || '',
        width: width,
        height: height
      });
    }

    // Update album photo count
    await query(`
      UPDATE albums 
      SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
      WHERE id = $1
    `, [albumId]);

    res.status(201).json(photos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update photo
router.put('/:id', async (req, res) => {
  try {
    const { description, metadata } = req.body;
    await query(`
      UPDATE photos 
      SET description = $1, metadata = $2
      WHERE id = $3
    `, [description, metadata ? JSON.stringify(metadata) : null, req.params.id]);
    
    const photo = await queryRow(`
      SELECT 
        id, album_id as albumId, file_name as fileName, 
        thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl,
        description, metadata, player_names as playerNames, created_at as createdDate
      FROM photos 
      WHERE id = $1
    `, [req.params.id]);
    res.json(photo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete photo
router.delete('/:id', async (req, res) => {
  try {
    const photo = await queryRow('SELECT * FROM photos WHERE id = $1', [req.params.id]);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Delete file from uploads directory
    const filePath = path.join(uploadsDir, path.basename(photo.full_image_url));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await query('DELETE FROM photos WHERE id = $1', [req.params.id]);

    // Update album photo count
    await query(`
      UPDATE albums 
      SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
      WHERE id = $1
    `, [photo.album_id]);

    res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search photos
router.get('/search', async (req, res) => {
  try {
    const { q, field } = req.query;
    const searchPattern = `%${q}%`;
    
    let query = `
      SELECT p.id, p.album_id as albumId, p.file_name as fileName, 
             p.thumbnail_url as thumbnailUrl, p.full_image_url as fullImageUrl,
             p.description, p.metadata, p.player_names as playerNames, p.created_at as createdDate,
             a.name as albumName
      FROM photos p
      JOIN albums a ON p.album_id = a.id
      WHERE`;
    
    // If specific field is requested, search only that field
    if (field && ['filename', 'camera', 'iso', 'aperture', 'shutterSpeed', 'focalLength', 'player', 'description'].includes(field)) {
      switch(field) {
        case 'filename':
          query += ` p.file_name ILIKE $1`;
          break;
        case 'camera':
          query += ` (p.metadata ILIKE $1 OR p.metadata ILIKE $2)`;
          break;
        case 'player':
          query += ` p.player_names ILIKE $1`;
          break;
        case 'description':
          query += ` p.description ILIKE $1`;
          break;
        default:
          query += ` p.metadata ILIKE $1`;
      }
      const result = field === 'camera' 
        ? await queryRows(query, [searchPattern, searchPattern])
        : await queryRows(query, [searchPattern]);
      res.json(result);
    } else {
      // Search all fields (default)
      query += ` p.file_name ILIKE $1 
         OR p.description ILIKE $2 
         OR p.metadata ILIKE $3
         OR p.player_names ILIKE $4
      ORDER BY p.created_at DESC
      LIMIT 100`;
      
      const photos = await queryRows(query, [searchPattern, searchPattern, searchPattern, searchPattern]);
      res.json(photos);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search photos by metadata (advanced)
router.get('/search/metadata', async (req, res) => {
  try {
    const { q, type } = req.query;
    const searchPattern = `%${q}%`;
    
    // Parse metadata JSON and search specific fields
    const photos = await queryRows(`
      SELECT p.id, p.album_id as albumId, p.file_name as fileName, 
             p.thumbnail_url as thumbnailUrl, p.full_image_url as fullImageUrl,
             p.description, p.metadata, p.player_names as playerNames, p.created_at as createdDate,
             a.name as albumName
      FROM photos p
      JOIN albums a ON p.album_id = a.id
      WHERE 1=1
    `);
    
    // Client-side filtering of parsed JSON metadata
    const filtered = photos.filter(photo => {
      if (!photo.metadata) return false;
      
      try {
        const metadata = JSON.parse(photo.metadata);
        
        // Search based on type
        switch(type) {
          case 'camera':
            return (metadata.cameraMake || '').toLowerCase().includes(q.toLowerCase()) ||
                   (metadata.cameraModel || '').toLowerCase().includes(q.toLowerCase());
          case 'iso':
            return (metadata.iso || '').toLowerCase().includes(q.toLowerCase());
          case 'aperture':
            return (metadata.aperture || '').toLowerCase().includes(q.toLowerCase());
          case 'shutterSpeed':
            return (metadata.shutterSpeed || '').toLowerCase().includes(q.toLowerCase());
          case 'focalLength':
            return (metadata.focalLength || '').toLowerCase().includes(q.toLowerCase());
          case 'date':
            return (metadata.dateTaken || '').toLowerCase().includes(q.toLowerCase());
          default:
            // Search all metadata fields
            return Object.values(metadata).some(val => 
              val && val.toString().toLowerCase().includes(q.toLowerCase())
            );
        }
      } catch (e) {
        return false;
      }
    }).slice(0, 100);
    
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload player names CSV
router.post('/album/:albumId/upload-players', upload.single('csv'), (req, res) => {
  try {
    const albumId = req.params.albumId;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const filePath = req.file.path;
    const playerMapping = {}; // Map of file names to player names
    let rowCount = 0;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // CSV should have columns: file_name (or fileName), player_name (or playerName)
        const fileName = row.file_name || row.fileName || row.filename || row['File Name'];
        const playerName = row.player_name || row.playerName || row['Player Name'];
        
        if (fileName && playerName) {
          playerMapping[fileName.trim()] = playerName.trim();
          rowCount++;
        }
      })
      .on('end', () => {
        // Update photos with player names
        let updatedCount = 0;
        const photos = await queryRows('SELECT id, file_name FROM photos WHERE album_id = $1', [albumId]);
        
        for (const photo of photos) {
          const matchingPlayerName = playerMapping[photo.file_name];
          if (matchingPlayerName) {
            await query('UPDATE photos SET player_names = $1 WHERE id = $2', [matchingPlayerName, photo.id]);
            updatedCount++;
          }
        }

        // Clean up uploaded CSV file
        fs.unlinkSync(filePath);

        res.json({
          message: 'Player names uploaded successfully',
          rowsParsed: rowCount,
          photosUpdated: updatedCount,
          totalPhotos: photos.length
        });
      })
      .on('error', (err) => {
        fs.unlinkSync(filePath);
        res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product recommendations based on photo dimensions
router.get('/:id/recommendations', async (req, res) => {
  try {
    const photoId = req.params.id;
    
    // Get photo dimensions
    const photo = await queryRow(`
      SELECT id, width, height, file_name as fileName
      FROM photos 
      WHERE id = $1
    `, [photoId]);
    
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    if (!photo.width || !photo.height) {
      return res.json({
        photo: photo,
        recommendations: [],
        message: 'Photo dimensions not available'
      });
    }
    
    // Calculate aspect ratio
    const aspectRatio = photo.width / photo.height;
    const isLandscape = aspectRatio > 1;
    const isPortrait = aspectRatio < 1;
    const isSquare = Math.abs(aspectRatio - 1) < 0.1;
    
    // Get all products
    const products = await queryRows('SELECT * FROM products ORDER BY category, name');
    
    // Recommendation algorithm
    const recommendations = products.map(product => {
      let score = 0;
      let reasons = [];
      
      // Parse product options to find dimensions
      let productOptions = null;
      try {
        productOptions = product.options ? JSON.parse(product.options) : null;
      } catch (e) {
        // ignore
      }
      
      // Check if product has size information
      if (productOptions && productOptions.sizes) {
        let closestMatch = null;
        let closestDiff = Infinity;
        
        productOptions.sizes.forEach(size => {
          if (size.width && size.height) {
            const sizeRatio = size.width / size.height;
            const ratioDiff = Math.abs(sizeRatio - aspectRatio);
            
            // Find the closest match (within 50% tolerance)
            if (ratioDiff < closestDiff && ratioDiff < 0.5) {
              closestMatch = size;
              closestDiff = ratioDiff;
            }
          }
        });
        
        if (closestMatch) {
          // Score based on how close the match is (0-50 points)
          // Perfect match (diff=0) = 50pts, at tolerance (diff=0.5) = 0pts
          const matchScore = Math.max(0, 50 * (1 - closestDiff / 0.5));
          score += Math.round(matchScore);
          reasons.push(`${closestMatch.width}x${closestMatch.height} is close to your photo ratio`);
        }
      }
      
      // Category-based recommendations
      if (product.category === 'Print') {
        if (isLandscape && product.name.toLowerCase().includes('landscape')) {
          score += 30;
          reasons.push('Perfect for landscape orientation');
        }
        if (isPortrait && product.name.toLowerCase().includes('portrait')) {
          score += 30;
          reasons.push('Perfect for portrait orientation');
        }
        if (isSquare && product.name.toLowerCase().includes('square')) {
          score += 30;
          reasons.push('Perfect for square format');
        }
      }
      
      // Common aspect ratios
      if (Math.abs(aspectRatio - 1.5) < 0.1) {
        // 3:2 ratio (standard DSLR)
        if (product.name.match(/4x6|6x4|8x12|12x8|12x18|18x12/)) {
          score += 40;
          reasons.push('Matches standard 3:2 camera ratio');
        }
      } else if (Math.abs(aspectRatio - 1.33) < 0.1) {
        // 4:3 ratio
        if (product.name.match(/4x3|8x6|6x8|12x9|16x12/)) {
          score += 40;
          reasons.push('Matches 4:3 aspect ratio');
        }
      } else if (Math.abs(aspectRatio - 1.0) < 0.1) {
        // 1:1 ratio (square)
        if (product.name.match(/5x5|8x8|10x10|12x12/)) {
          score += 40;
          reasons.push('Perfect square format');
        }
      }
      
      // Resolution-based recommendations
      const megapixels = (photo.width * photo.height) / 1000000;
      if (megapixels > 12) {
        if (product.name.match(/16x20|20x30|24x36/)) {
          score += 20;
          reasons.push('High resolution supports large prints');
        }
      } else if (megapixels < 3) {
        if (product.name.match(/4x6|5x7|wallet/i)) {
          score += 20;
          reasons.push('Resolution best suited for smaller prints');
        }
      }
      
      // Digital download always applicable
      if (product.category.toLowerCase().includes('digital')) {
        score += 10;
        reasons.push('Always available for digital use');
      }
      
      return {
        ...product,
        options: productOptions,
        recommendationScore: score,
        reasons: reasons,
        matchQuality: score > 60 ? 'excellent' : score > 30 ? 'good' : 'fair'
      };
    });
    
    // Sort by score and return top recommendations
    const sortedRecommendations = recommendations
      .filter(r => r.recommendationScore > 0)
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 10);
    
    res.json({
      photo: {
        id: photo.id,
        fileName: photo.fileName,
        width: photo.width,
        height: photo.height,
        aspectRatio: aspectRatio.toFixed(2),
        orientation: isSquare ? 'square' : isLandscape ? 'landscape' : 'portrait',
        megapixels: ((photo.width * photo.height) / 1000000).toFixed(1)
      },
      recommendations: sortedRecommendations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

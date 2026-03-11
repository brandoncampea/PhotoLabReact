import express from 'express';
import multer from 'multer';
import path from 'path';
import { queryRow, queryRows, query } from '../mssql.js';
import csv from 'csv-parser';
import sharp from 'sharp';
import { uploadImageBufferToAzure, deleteBlobByUrl, downloadBlob } from '../services/azureStorage.js';
const router = express.Router();

const getPhotoAssetUrl = (photoId, variant = 'full') => `/api/photos/${photoId}/asset?variant=${variant}`;
const getProxySourceUrl = (source) => `/api/photos/proxy?source=${encodeURIComponent(source)}`;

const signPhotoForResponse = (photo) => ({
  ...photo,
  thumbnailUrl: photo?.id ? getPhotoAssetUrl(photo.id, 'thumbnail') : photo?.thumbnailUrl,
  fullImageUrl: photo?.id ? getPhotoAssetUrl(photo.id, 'full') : photo?.fullImageUrl,
});

async function pipeAssetToResponse(source, res) {
  const download = await downloadBlob(source);
  if (download?.contentType) {
    res.setHeader('Content-Type', download.contentType);
  }
  if (download?.contentLength) {
    res.setHeader('Content-Length', String(download.contentLength));
  }
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (download?.readableStreamBody) {
    download.readableStreamBody.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).end(error.message);
      } else {
        res.end();
      }
    });
    download.readableStreamBody.pipe(res);
    return;
  }

  if (typeof source === 'string' && source.startsWith('http')) {
    const upstream = await fetch(source);
    if (!upstream.ok) {
      res.status(upstream.status).end('Failed to fetch asset');
      return;
    }
    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.send(Buffer.from(arrayBuffer));
    return;
  }

  res.status(404).json({ error: 'Asset not found' });
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);
    const allowedMimePrefixes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const extname = path.extname(file.originalname).toLowerCase();
    const mimetype = (file.mimetype || '').toLowerCase();

    const extAllowed = allowedExts.has(extname);
    const mimeAllowed = allowedMimePrefixes.some((t) => mimetype.startsWith(t));

    if (extAllowed || mimeAllowed) {
      return cb(null, true);
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'photos'));
  }
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB CSV limit
  fileFilter: (req, file, cb) => {
    const extname = path.extname(file.originalname).toLowerCase();
    const isCsvMime = file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel';
    if (extname === '.csv' || isCsvMime) {
      return cb(null, true);
    }
    cb(new Error('Only CSV files are allowed'));
  }
});

function makeBlobName(albumId, originalName) {
  const extension = path.extname(originalName).toLowerCase();
  const safeBaseName = path.basename(originalName, extension).replace(/[^a-zA-Z0-9-_]/g, '-');
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `albums/${albumId}/${safeBaseName || 'photo'}-${uniqueSuffix}${extension}`;
}

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
      query += ` AND player_names LIKE $2`;
      params.push(`%${playerName}%`);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const photos = await queryRows(query, params);
    res.json(photos.map(signPhotoForResponse));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/proxy', async (req, res) => {
  try {
    const source = String(req.query.source || '');
    if (!source) {
      return res.status(400).json({ error: 'source is required' });
    }

    await pipeAssetToResponse(source, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

router.get('/:id/asset', async (req, res) => {
  try {
    const variant = req.query.variant === 'thumbnail' ? 'thumbnail' : 'full';
    const photo = await queryRow(
      `SELECT id,
              thumbnail_url as thumbnailUrl,
              full_image_url as fullImageUrl
       FROM photos
       WHERE id = $1`,
      [req.params.id]
    );

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const source = variant === 'thumbnail' ? photo.thumbnailUrl : photo.fullImageUrl;
    await pipeAssetToResponse(source, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Upload photos
router.post('/upload', (req, res, next) => {
  photoUpload.array('photos', 50)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Each file must be 10MB or smaller' });
        }
        return res.status(400).json({ error: 'Invalid upload payload. Please upload supported image files.' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos provided' });
    }

    const { albumId, descriptions, metadata } = req.body;
    let parsedDescriptions = [];
    let parsedMetadata = [];

    try {
      parsedDescriptions = descriptions ? JSON.parse(descriptions) : [];
    } catch {
      parsedDescriptions = [];
    }

    try {
      parsedMetadata = metadata ? JSON.parse(metadata) : [];
    } catch {
      parsedMetadata = [];
    }
    
    const photos = [];
    for (let index = 0; index < req.files.length; index++) {
      const file = req.files[index];
      const blobName = makeBlobName(albumId, file.originalname);
      const photoUrl = await uploadImageBufferToAzure(file.buffer, blobName, file.mimetype);
      
      // Extract image dimensions
      let width = null;
      let height = null;
      try {
        const metadata = await sharp(file.buffer).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (err) {
        console.error('Failed to extract image dimensions:', err);
      }
      
      const result = await queryRow(`
        INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, width, height)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        albumId,
        file.originalname,
        photoUrl,
        photoUrl,
        parsedDescriptions[index] || '',
        parsedMetadata[index] ? JSON.stringify(parsedMetadata[index]) : null,
        width,
        height,
      ]);
      
      photos.push({
        id: result.id,
        albumId: parseInt(albumId),
        fileName: file.originalname,
        thumbnailUrl: photoUrl,
        fullImageUrl: photoUrl,
        description: parsedDescriptions[index] || '',
        metadata: parsedMetadata[index] || null,
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

    // Auto-select cover photo if none is currently selected
    const album = await queryRow(
      `SELECT cover_photo_id as coverPhotoId, cover_image_url as coverImageUrl FROM albums WHERE id = $1`,
      [albumId]
    );

    if ((!album?.coverPhotoId || !album?.coverImageUrl) && photos.length > 0) {
      const fallback = photos[0];
      await query(
        `UPDATE albums
         SET cover_photo_id = $1,
             cover_image_url = $2
         WHERE id = $3`,
        [fallback.id, fallback.fullImageUrl, albumId]
      );
    }

    res.status(201).json(photos.map(signPhotoForResponse));
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
    res.json(signPhotoForResponse(photo));
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

    if (photo.full_image_url?.startsWith('http')) {
      await deleteBlobByUrl(photo.full_image_url);
    }

    await query('DELETE FROM photos WHERE id = $1', [req.params.id]);

    // Update album photo count
    await query(`
      UPDATE albums 
      SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
      WHERE id = $1
    `, [photo.album_id]);

    // If album cover is missing (or deleted), pick the most recent remaining photo as fallback
    const album = await queryRow(
      `SELECT id, cover_photo_id as coverPhotoId, cover_image_url as coverImageUrl
       FROM albums
       WHERE id = $1`,
      [photo.album_id]
    );

    const coverWasDeleted = Number(album?.coverPhotoId) === Number(req.params.id);
    if (album && (coverWasDeleted || !album.coverPhotoId || !album.coverImageUrl)) {
      const fallback = await queryRow(
        `SELECT id, full_image_url as fullImageUrl
         FROM photos
         WHERE album_id = $1
         ORDER BY created_at DESC`,
        [photo.album_id]
      );

      await query(
        `UPDATE albums
         SET cover_photo_id = $1,
             cover_image_url = $2
         WHERE id = $3`,
        [fallback?.id || null, fallback?.fullImageUrl || null, photo.album_id]
      );
    }

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
          query += ` p.file_name LIKE $1`;
          break;
        case 'camera':
          query += ` (p.metadata LIKE $1 OR p.metadata LIKE $2)`;
          break;
        case 'player':
          query += ` p.player_names LIKE $1`;
          break;
        case 'description':
          query += ` p.description LIKE $1`;
          break;
        default:
          query += ` p.metadata LIKE $1`;
      }
      const result = field === 'camera' 
        ? await queryRows(query, [searchPattern, searchPattern])
        : await queryRows(query, [searchPattern]);
      res.json(result.map(signPhotoForResponse));
    } else {
      // Search all fields (default)
      query += ` p.file_name LIKE $1 
        OR p.description LIKE $2 
        OR p.metadata LIKE $3
        OR p.player_names LIKE $4
      ORDER BY p.created_at DESC
      OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY`;
      
      const photos = await queryRows(query, [searchPattern, searchPattern, searchPattern, searchPattern]);
      res.json(photos.map(signPhotoForResponse));
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
    
    res.json(filtered.map(signPhotoForResponse));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload player names CSV
router.post('/album/:albumId/upload-players', csvUpload.single('csv'), (req, res) => {
  try {
    const albumId = req.params.albumId;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const playerMapping = {}; // Map of file names to player names
    let rowCount = 0;

    const parser = csv();
    parser
      .on('data', (row) => {
        // CSV should have columns: file_name (or fileName), player_name (or playerName)
        const fileName = row.file_name || row.fileName || row.filename || row['File Name'];
        const playerName = row.player_name || row.playerName || row['Player Name'];
        
        if (fileName && playerName) {
          playerMapping[fileName.trim()] = playerName.trim();
          rowCount++;
        }
      })
      .on('end', async () => {
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

        res.json({
          message: 'Player names uploaded successfully',
          rowsParsed: rowCount,
          photosUpdated: updatedCount,
          totalPhotos: photos.length
        });
      })
      .on('error', (err) => {
        res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
      });

    parser.end(req.file.buffer);
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

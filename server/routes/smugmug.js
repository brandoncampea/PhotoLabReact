import express from 'express';
import crypto from 'crypto';
import { queryRow, queryRows, query, columnExists } from '../mssql.js';
import { authRequired } from '../middleware/auth.js';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';

const router = express.Router();
const smugMugImportJobs = new Map();
const getSmugMugStorageMode = () => (process.env.AZURE_STORAGE_CONNECTION_STRING ? 'azure' : 'smugmug-source');

const createImportJob = ({ jobId, studioId, albums }) => {
  const normalizedJobId = String(jobId || crypto.randomUUID());
  const now = new Date().toISOString();
  const job = {
    jobId: normalizedJobId,
    studioId,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    currentAlbumKey: null,
    currentAlbumName: '',
    storageMode: getSmugMugStorageMode(),
    totals: {
      albumsTotal: Array.isArray(albums) ? albums.length : 0,
      albumsCompleted: 0,
      photosTotal: 0,
      photosProcessed: 0,
      photosImported: 0,
      photosSkipped: 0,
      photosFailed: 0,
    },
    albums: Array.isArray(albums)
      ? albums.map((album) => ({
          albumKey: String(album?.albumKey || ''),
          name: String(album?.name || '').trim() || 'SmugMug Album',
          status: 'pending',
          photosTotal: 0,
          photosProcessed: 0,
          photosImported: 0,
          photosSkipped: 0,
          photosFailed: 0,
        }))
      : [],
    recentPhotos: [],
    imported: [],
    error: null,
  };
  smugMugImportJobs.set(normalizedJobId, job);
  // Prefer largest available image
  const candidates = [
    image?.OriginalUrl,
    image?.X5LargeUrl,
    image?.X4LargeUrl,
    image?.X3LargeUrl,
    image?.X2LargeUrl,
    image?.XLargeUrl,
    image?.LargeUrl,
    image?.MediumUrl,
    image?.SmallUrl,
    image?.ThumbnailUrl,
    image?.Url,
  ];
  for (const url of candidates) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return url;
    }
  }
  return null;
const pushPhotoProgress = (job, payload) => {
  if (!job) return;
  job.recentPhotos.unshift({
    timestamp: new Date().toISOString(),
    ...payload,
  });
  if (job.recentPhotos.length > 200) {
    job.recentPhotos.length = 200;
  }
  touchImportJob(job);
};

const finishImportJob = (job, updates = {}) => {
  if (!job) return;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
};

const getStudioIdFromRequest = (req) => {
  if (req.user?.role === 'studio_admin') {
    return Number(req.user.studio_id) || null;
  }
  if (req.user?.role === 'super_admin') {
    return Number(req.user.acting_studio_id || req.user.studio_id) || null;
  }
  return null;
};

const ensureSmugMugConfigTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_smugmug_config')
    BEGIN
      CREATE TABLE studio_smugmug_config (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL UNIQUE FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
        nickname NVARCHAR(255) NULL,
        api_key NVARCHAR(255) NULL,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    END
  `);
};

const ensureSmugMugImportTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_smugmug_imports')
    BEGIN
      CREATE TABLE studio_smugmug_imports (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
        smugmug_album_key NVARCHAR(255) NOT NULL,
        local_album_id INT NULL FOREIGN KEY REFERENCES albums(id),
        imported_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_studio_smugmug_album UNIQUE (studio_id, smugmug_album_key)
      )
    END
  `);
};

const requestSmugMugJson = async (path, apiKey) => {
  const url = new URL(`https://api.smugmug.com${path}`);
  if (apiKey) {
    url.searchParams.set('APIKey', apiKey);
  }

  const headers = {
    Accept: 'application/json',
    'Accept-Version': 'v2',
  };

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SmugMug request failed (${response.status}): ${text.slice(0, 250)}`);
  }
  return response.json();
};

const fetchAllSmugMugObjects = async (initialPath, apiKey, locatorNames = []) => {
  const collected = [];
  let nextPath = initialPath;
  let page = 0;

  while (nextPath && page < 100) {
    page += 1;
    const payload = await requestSmugMugJson(nextPath, apiKey);
    const response = payload?.Response || {};

    for (const locatorName of locatorNames) {
      const rows = response?.[locatorName];
      if (Array.isArray(rows) && rows.length) {
        collected.push(...rows);
      }
    }

    nextPath = response?.Pages?.NextPage || null;
  }

  return collected;
};

const normalizeAlbums = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((album) => ({
      albumKey: album?.AlbumKey || album?.Key || '',
      name: album?.Name || album?.Title || 'Untitled Album',
      description: album?.Description || '',
      imageCount: Number(album?.ImageCount || 0),
      webUri: album?.WebUri || '',
    }))
    .filter((a) => a.albumKey);
};

const pickBestImageUrl = (image) => {
  const direct = [
    image?.OriginalUrl,
    image?.LargestVideoUrl,
    image?.X5LargeUrl,
    image?.X4LargeUrl,
    image?.X3LargeUrl,
    image?.X2LargeUrl,
    image?.XLargeUrl,
    image?.LargeUrl,
    image?.MediumUrl,
    image?.SmallUrl,
    image?.ThumbnailUrl,
    image?.Url,
  ].find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));

  if (direct) return direct;
  return null;
};

const listAlbumImages = async (albumKey, apiKey) => {
  const rows = await fetchAllSmugMugObjects(
    `/api/v2/album/${encodeURIComponent(albumKey)}!images?count=100`,
    apiKey,
    ['AlbumImage', 'Image']
  );

  const out = [];
  for (const image of rows) {
    let sourceUrl = null;
    let urlType = 'fallback';
    // Always try to fetch OriginalUrl
    if (typeof image?.ArchivedUri === 'string' && image.ArchivedUri.startsWith('/api/v2/')) {
      try {
        const imagePayload = await requestSmugMugJson(image.ArchivedUri, apiKey);
        const nested = imagePayload?.Response?.Image || imagePayload?.Response || {};
        if (nested.OriginalUrl) {
          sourceUrl = nested.OriginalUrl;
          urlType = 'OriginalUrl';
        } else {
          sourceUrl = pickBestImageUrl(nested);
        }
      } catch {
        // ignore per-image failures
      }
    }
    // Fallback if no ArchivedUri or OriginalUrl
    if (!sourceUrl) {
      if (image.OriginalUrl) {
        sourceUrl = image.OriginalUrl;
        urlType = 'OriginalUrl';
      } else {
        sourceUrl = pickBestImageUrl(image);
      }
    }
    if (!sourceUrl) continue;
    // Log which URL is used for import
    console.log(`[SmugMug Import] Album ${albumKey} - Image ${image?.FileName || image?.Name}: Using ${urlType} (${sourceUrl})`);
    out.push({
      id: image?.ImageKey || image?.Key || crypto.randomUUID(),
      fileName: image?.FileName || image?.Name || `smugmug-${Date.now()}.jpg`,
      description: image?.Caption || image?.Title || '',
      sourceUrl,
    });
  }
  return out;
};

const makeBlobName = (albumId, originalName) => {
  const safe = String(originalName || 'smugmug-image').replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = Date.now();
  const random = crypto.randomBytes(6).toString('hex');
  return `albums/${albumId}/${stamp}-${random}-${safe}`;
};

const uploadImportedImage = async (albumId, image, imageBuffer) => {
  const contentType = 'image/jpeg';
  const blobName = makeBlobName(albumId, image.fileName);

  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return {
      url: image.sourceUrl,
      storage: 'smugmug-source',
    };
  }

  const uploadedUrl = await uploadImageBufferToAzure(imageBuffer, blobName, contentType);
  return {
    url: uploadedUrl,
    storage: 'azure',
  };
};

router.get('/config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();
    const config = await queryRow(
      `SELECT studio_id as studioId, nickname, api_key as apiKey
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );

    res.json({
      ...(config || { studioId, nickname: '', apiKey: '' }),
      storageMode: getSmugMugStorageMode(),
    });
  } catch (error) {
    console.error('SmugMug config get error:', error);
    res.status(500).json({ error: 'Failed to fetch SmugMug config' });
  }
});

router.put('/config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    const nickname = String(req.body?.nickname || '').trim();
    const apiKey = String(req.body?.apiKey || '').trim();

    await ensureSmugMugConfigTable();

    await query(
      `IF EXISTS (SELECT 1 FROM studio_smugmug_config WHERE studio_id = $1)
       BEGIN
         UPDATE studio_smugmug_config
         SET nickname = $2,
             api_key = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE studio_id = $1
       END
       ELSE
       BEGIN
         INSERT INTO studio_smugmug_config (studio_id, nickname, api_key)
         VALUES ($1, $2, $3)
       END`,
      [studioId, nickname || null, apiKey || null]
    );

    res.json({ studioId, nickname, apiKey, storageMode: getSmugMugStorageMode() });
  } catch (error) {
    console.error('SmugMug config save error:', error);
    res.status(500).json({ error: 'Failed to save SmugMug config' });
  }
});

router.get('/albums', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();

    const config = await queryRow(
      `SELECT nickname, api_key as apiKey
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );

    const nickname = String(req.query.nickname || config?.nickname || '').trim();
    const apiKey = String(req.query.apiKey || config?.apiKey || process.env.SMUGMUG_API_KEY || '').trim();

    if (!nickname) {
      return res.status(400).json({ error: 'SmugMug nickname is required' });
    }

    const albumRows = await fetchAllSmugMugObjects(
      `/api/v2/user/${encodeURIComponent(nickname)}!albums?count=100`,
      apiKey,
      ['Album', 'Albums']
    );
    const albums = normalizeAlbums(albumRows);

    const importedRows = await queryRows(
      `SELECT
         smugmug_album_key as albumKey,
         local_album_id as localAlbumId,
         imported_at as importedAt
       FROM studio_smugmug_imports
       WHERE studio_id = $1`,
      [studioId]
    );

    const importedMap = new Map(
      importedRows.map((row) => [String(row.albumKey || ''), {
        localAlbumId: row.localAlbumId ? Number(row.localAlbumId) : null,
        importedAt: row.importedAt || null,
      }])
    );

    res.json({
      nickname,
      albums: albums.map((album) => {
        const imported = importedMap.get(String(album.albumKey || ''));
        return {
          ...album,
          imported: !!imported,
          localAlbumId: imported?.localAlbumId || null,
          importedAt: imported?.importedAt || null,
        };
      }),
    });
  } catch (error) {
    console.error('SmugMug albums list error:', error);
    res.status(500).json({ error: 'Failed to load SmugMug albums' });
  }
});

router.get('/import-progress/:jobId', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    const jobId = String(req.params.jobId || '').trim();
    if (!jobId) {
      return res.status(400).json({ error: 'Import job id is required' });
    }

    const job = smugMugImportJobs.get(jobId);
    if (!job || Number(job.studioId) !== Number(studioId)) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('SmugMug import progress error:', error);
    res.status(500).json({ error: 'Failed to load SmugMug import progress' });
  }
});

router.post('/import', authRequired, async (req, res) => {
      // Helper: Check if album is already imported
      async function isAlbumImported(studioId, albumKey) {
        const row = await queryRow(
          `SELECT TOP 1 * FROM ImportedAlbums WHERE studioId = @studioId AND albumKey = @albumKey AND status = 'completed'`,
          { studioId, albumKey }
        );
        return !!row;
      }

      // Helper: Mark album as imported
      async function markAlbumImported(studioId, albumKey, jobId) {
        await query(
          `INSERT INTO ImportedAlbums (studioId, albumKey, importedAt, jobId, status) VALUES (@studioId, @albumKey, GETDATE(), @jobId, 'completed')`,
          { studioId, albumKey, jobId }
        );
      }
  try {
    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = getStudioIdFromRequest(req);
    if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

    await ensureSmugMugConfigTable();
    await ensureSmugMugImportTable();

    const config = await queryRow(
      `SELECT nickname, api_key as apiKey
       FROM studio_smugmug_config
       WHERE studio_id = $1`,
      [studioId]
    );

    const nickname = String(req.body?.nickname || config?.nickname || '').trim();
    const apiKey = String(config?.apiKey || process.env.SMUGMUG_API_KEY || '').trim();
    const selectedAlbums = Array.isArray(req.body?.albums) ? req.body.albums : [];
    const requestedJobId = String(req.body?.jobId || '').trim();

    if (!nickname) {
      return res.status(400).json({ error: 'SmugMug nickname is required' });
    }

    if (!selectedAlbums.length) {
      return res.status(400).json({ error: 'Select at least one album to import' });
    }

    const importJob = createImportJob({
      jobId: requestedJobId,
      studioId,
      albums: selectedAlbums,
    });

    const imported = [];

    for (const selected of selectedAlbums) {
            // Check if already imported
            if (await isAlbumImported(studioId, albumKey)) {
              pushPhotoProgress(importJob, {
                albumKey,
                status: 'skipped',
                message: 'Album already imported',
              });
              continue;
            }
        // Mark as imported
        await markAlbumImported(studioId, albumKey, importJob.jobId);
      const albumKey = String(selected?.albumKey || '').trim();
      const albumName = String(selected?.name || '').trim() || 'SmugMug Album';
      const albumDescription = String(selected?.description || '').trim() || null;
      if (!albumKey) continue;

      const albumProgress = getAlbumProgress(importJob, albumKey);
      if (albumProgress) {
        albumProgress.status = 'preparing';
      }
      importJob.currentAlbumKey = albumKey;
      importJob.currentAlbumName = albumName;
      touchImportJob(importJob);

      const existingImport = await queryRow(
        `SELECT local_album_id as localAlbumId
         FROM studio_smugmug_imports
         WHERE studio_id = $1 AND smugmug_album_key = $2`,
        [studioId, albumKey]
      );

      let album = null;
      if (existingImport?.localAlbumId) {
        album = await queryRow(
          `SELECT id
           FROM albums
           WHERE id = $1 AND studio_id = $2`,
          [existingImport.localAlbumId, studioId]
        );
      }

      if (!album) {
        album = await queryRow(
          `SELECT id
           FROM albums
           WHERE studio_id = $1 AND COALESCE(name, title) = $2`,
          [studioId, albumName]
        );
      }

      if (!album) {
        const created = await queryRow(
          `INSERT INTO albums (name, title, description, studio_id, category)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [albumName, albumName, albumDescription, studioId, 'SmugMug']
        );
        album = { id: created.id };
      }

      const albumId = Number(album.id);
      const images = await listAlbumImages(albumKey, apiKey);

      if (albumProgress) {
        albumProgress.status = 'importing';
        albumProgress.photosTotal = images.length;
      }
      importJob.totals.photosTotal += images.length;
      touchImportJob(importJob);

      let importedPhotoCount = 0;
      for (const image of images) {
        const exists = await queryRow(
          'SELECT TOP 1 id FROM photos WHERE album_id = $1 AND file_name = $2',
          [albumId, image.fileName]
        );
        if (exists) {
          importJob.totals.photosProcessed += 1;
          importJob.totals.photosSkipped += 1;
          if (albumProgress) {
            albumProgress.photosProcessed += 1;
            albumProgress.photosSkipped += 1;
          }
          pushPhotoProgress(importJob, {
            albumKey,
            albumName,
            fileName: image.fileName,
            status: 'skipped',
            detail: 'Already imported',
          });
          continue;
        }

        let imageBuffer;
        try {
          const response = await fetch(image.sourceUrl);
          if (!response.ok) {
            importJob.totals.photosProcessed += 1;
            importJob.totals.photosFailed += 1;
            if (albumProgress) {
              albumProgress.photosProcessed += 1;
              albumProgress.photosFailed += 1;
            }
            pushPhotoProgress(importJob, {
              albumKey,
              albumName,
              fileName: image.fileName,
              status: 'failed',
              detail: `Download failed (${response.status})`,
            });
            continue;
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);

          // Log imageBuffer size and image dimensions
          let width = null, height = null;
          try {
            const sharp = await import('sharp');
            const metadata = await sharp.default(imageBuffer).metadata();
            width = metadata.width;
            height = metadata.height;
          } catch (metaErr) {
            console.warn('Failed to get image dimensions:', metaErr);
          }
          console.log(`SmugMug import: fileName=${image.fileName}, bufferSize=${imageBuffer.length}, width=${width}, height=${height}`);
        } catch (error) {
          importJob.totals.photosProcessed += 1;
          importJob.totals.photosFailed += 1;
          if (albumProgress) {
            albumProgress.photosProcessed += 1;
            albumProgress.photosFailed += 1;
          }
          pushPhotoProgress(importJob, {
            albumKey,
            albumName,
            fileName: image.fileName,
            status: 'failed',
            detail: error instanceof Error ? error.message : 'Download failed',
          });
          continue;
        }

        const uploadedImage = await uploadImportedImage(albumId, image, imageBuffer);

        await query(
          `INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, metadata, file_size_bytes, width, height)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            albumId,
            image.fileName,
            uploadedImage.url,
            uploadedImage.url,
            image.description || '',
            JSON.stringify({
              source: 'smugmug',
              smugmugImageId: image.id,
              importedAt: new Date().toISOString(),
              storage: uploadedImage.storage,
              originalSourceUrl: image.sourceUrl,
            }),
            imageBuffer.length,
            width,
            height,
          ]
        );

        importJob.totals.photosProcessed += 1;
        importJob.totals.photosImported += 1;
        if (albumProgress) {
          albumProgress.photosProcessed += 1;
          albumProgress.photosImported += 1;
        }
        pushPhotoProgress(importJob, {
          albumKey,
          albumName,
          fileName: image.fileName,
          status: 'imported',
          detail: uploadedImage.storage === 'azure' ? 'Imported successfully' : 'Imported using SmugMug source URL',
        });
        importedPhotoCount += 1;
      }

      await query(
        `UPDATE albums
         SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1)
         WHERE id = $1`,
        [albumId]
      );

      await query(
        `IF EXISTS (SELECT 1 FROM studio_smugmug_imports WHERE studio_id = $1 AND smugmug_album_key = $2)
         BEGIN
           UPDATE studio_smugmug_imports
           SET local_album_id = $3,
               imported_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE studio_id = $1 AND smugmug_album_key = $2
         END
         ELSE
         BEGIN
           INSERT INTO studio_smugmug_imports (studio_id, smugmug_album_key, local_album_id)
           VALUES ($1, $2, $3)
         END`,
        [studioId, albumKey, albumId]
      );

      imported.push({
        albumId,
        albumKey,
        name: albumName,
        importedPhotoCount,
      });

      importJob.totals.albumsCompleted += 1;
      if (albumProgress) {
        albumProgress.status = 'completed';
      }
      importJob.imported = imported;
      touchImportJob(importJob);
    }

    finishImportJob(importJob, {
      status: 'completed',
      currentAlbumKey: null,
      currentAlbumName: '',
      imported,
    });

    res.json({
      message: 'SmugMug import complete',
      jobId: importJob.jobId,
      storageMode: importJob.storageMode,
      imported,
    });
  } catch (error) {
    console.error('SmugMug import error:', error);
    const requestedJobId = String(req.body?.jobId || '').trim();
    if (requestedJobId) {
      finishImportJob(smugMugImportJobs.get(requestedJobId), {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to import SmugMug albums',
      });
    }
    res.status(500).json({ error: 'Failed to import SmugMug albums' });
  }
});

export default router;

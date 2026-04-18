let query, queryRows;
import('../mssql.cjs').then((mssql) => {
  query = mssql.query || mssql.default?.query;
  queryRows = mssql.queryRows || mssql.default?.queryRows;
});
import { downloadBlob, getSignedReadUrl } from '../services/azureStorage.js';

export const signPhotoForResponse = (photo) => {
  let parsedMetadata = photo?.metadata;
  if (typeof parsedMetadata === 'string') {
    try {
      parsedMetadata = JSON.parse(parsedMetadata);
    } catch {
      parsedMetadata = null;
    }
  }
  // Flatten metadata fields into the top-level response for easy frontend access
  const metadataFields = parsedMetadata && typeof parsedMetadata === 'object' ? parsedMetadata : {};
  return {
    ...photo,
    ...metadataFields, // flatten all EXIF fields
    metadata: metadataFields,
    thumbnailUrl: photo?.thumbnailUrl,
    fullImageUrl: photo?.fullImageUrl,
  };
};

// Wrap the asset piping logic in a function and export it
export async function pipeAssetToResponse(source, res) {
  // Debug logging for asset fetch
  console.log('[PHOTO ASSET] Requested source:', source);
  try {
    // Always generate a fresh SAS URL for Azure blobs
    let downloadSource = source;
    if (typeof source === 'string' && !downloadSource.startsWith('/uploads/') && !downloadSource.startsWith('/api/') && !downloadSource.startsWith('http://localhost')) {
      // Only for Azure blobs (not local uploads or API proxies)
      downloadSource = getSignedReadUrl(source);
      console.log('[PHOTO ASSET] Generated SAS URL:', downloadSource, 'from blob path:', source);
    }
    console.log('[PHOTO ASSET] Calling downloadBlob with:', downloadSource);
    const download = await downloadBlob(downloadSource, 'stream');
    console.log('[PHOTO ASSET] downloadBlob result:', !!download, download?.contentType, download?.contentLength);
    if (!download) {
      console.error('[PHOTO ASSET] Asset not found for:', downloadSource);
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    if (download?.contentType) {
      res.setHeader('Content-Type', download.contentType);
    }
    if (download?.contentLength) {
      res.setHeader('Content-Length', String(download.contentLength));
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (download?.readableStreamBody) {
      download.readableStreamBody.on('error', (error) => {
        console.error('Blob stream error:', error);
        if (!res.headersSent) {
          res.status(500).end(error.message);
        } else {
          res.end();
        }
      });
      download.readableStreamBody.pipe(res);
      return;
    }
    console.error('[PHOTO ASSET] Asset not found after download for:', downloadSource);
    res.status(404).json({ error: 'Asset not found' });
    return;
  } catch (err) {
    console.error('[PHOTO ASSET] Error fetching asset:', err);
    if (typeof source === 'string' && source.startsWith('http')) {
      try {
        const upstream = await fetch(source);
        if (!upstream.ok) {
          res.status(upstream.status).end('Failed to fetch asset');
          return;
        }
        const arrayBuffer = await upstream.arrayBuffer();
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
        res.send(Buffer.from(arrayBuffer));
        return;
      } catch (fetchErr) {
        console.error('[PHOTO ASSET] Fetch asset error:', fetchErr);
        res.status(404).json({ error: 'Asset not found' });
        return;
      }
    }
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
// Removed extra closing brace
}

export const ensurePlayerRecognitionSchema = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_player_roster')
    BEGIN
      CREATE TABLE studio_player_roster (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        player_name NVARCHAR(255) NOT NULL,
        player_number NVARCHAR(64) NULL,
        roster_name NVARCHAR(255) NULL,
        source_album_id INT NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    END
  `);
  await query(`
    IF COL_LENGTH('studio_player_roster', 'roster_name') IS NULL
      ALTER TABLE studio_player_roster ADD roster_name NVARCHAR(255) NULL;
    IF COL_LENGTH('studio_player_roster', 'source_album_id') IS NULL
      ALTER TABLE studio_player_roster ADD source_album_id INT NULL;
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_player_face_signatures')
    BEGIN
      CREATE TABLE studio_player_face_signatures (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        player_name NVARCHAR(255) NOT NULL,
        player_number NVARCHAR(64) NULL,
        signature_hash NVARCHAR(128) NOT NULL,
        source_photo_id INT NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    END
  `);
};

export const ensurePhotoUploadColumns = async () => {
  await query(`
    IF COL_LENGTH('photos', 'width') IS NULL
      ALTER TABLE photos ADD width INT NULL;
    IF COL_LENGTH('photos', 'height') IS NULL
      ALTER TABLE photos ADD height INT NULL;
    IF COL_LENGTH('photos', 'file_size_bytes') IS NULL
      ALTER TABLE photos ADD file_size_bytes BIGINT NULL;
    IF COL_LENGTH('photos', 'player_names') IS NULL
      ALTER TABLE photos ADD player_names NVARCHAR(MAX) NULL;
    IF COL_LENGTH('photos', 'player_numbers') IS NULL
      ALTER TABLE photos ADD player_numbers NVARCHAR(255) NULL;
    IF COL_LENGTH('photos', 'detected_numbers') IS NULL
      ALTER TABLE photos ADD detected_numbers NVARCHAR(MAX) NULL;
    IF COL_LENGTH('photos', 'detected_numbers_updated_at') IS NULL
      ALTER TABLE photos ADD detected_numbers_updated_at DATETIME2 NULL;
  `);
};

export const fetchStudioRoster = async (studioId) => {
  if (!studioId) return [];
  return queryRows(
    `SELECT id,
            player_name as playerName,
            player_number as playerNumber,
            roster_name as rosterName,
            source_album_id as sourceAlbumId
     FROM studio_player_roster
     WHERE studio_id = $1`,
    [studioId]
  );
};

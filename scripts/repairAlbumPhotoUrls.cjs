// Node.js script to repair photo URLs for a specific album
// Converts full Azure blob URLs or expired SAS URLs to blob names (e.g., albums/68/filename.jpg)
// Usage: node scripts/repairAlbumPhotoUrls.cjs <albumId>

const mssql = require('../server/mssql.cjs');

async function main() {
  const albumId = process.argv[2];
  if (!albumId) {
    console.error('Usage: node scripts/repairAlbumPhotoUrls.cjs <albumId>');
    process.exit(1);
  }

  const photos = await mssql.queryRows(
    'SELECT id, file_name, thumbnail_url, full_image_url FROM photos WHERE album_id = $1',
    [albumId]
  );

  for (const photo of photos) {
    let updated = false;
    let newThumbnail = photo.thumbnail_url;
    let newFull = photo.full_image_url;

    // If the field is a full URL, convert to blob name
    if (typeof newThumbnail === 'string' && newThumbnail.startsWith('http')) {
      const parts = newThumbnail.split('/');
      const idx = parts.findIndex(p => p === 'albums');
      if (idx >= 0) {
        newThumbnail = parts.slice(idx).join('/');
        updated = true;
      }
    }
    if (typeof newFull === 'string' && newFull.startsWith('http')) {
      const parts = newFull.split('/');
      const idx = parts.findIndex(p => p === 'albums');
      if (idx >= 0) {
        newFull = parts.slice(idx).join('/');
        updated = true;
      }
    }

    if (updated) {
      await mssql.query(
        'UPDATE photos SET thumbnail_url = $1, full_image_url = $2 WHERE id = $3',
        [newThumbnail, newFull, photo.id]
      );
      console.log(`Updated photo ${photo.id}:`, newThumbnail, newFull);
    } else {
      console.log(`No change for photo ${photo.id}`);
    }
  }

  console.log('Repair complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

// Usage: node scripts/stripSasFromPhotoUrls.cjs <albumId>
// This script removes any query string (SAS token) from thumbnail_url and full_image_url for all photos in the given album.

const db = require('../server/mssql.cjs');

function stripSas(url) {
  if (!url) return url;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

async function main() {
  const albumId = process.argv[2];
  if (!albumId) {
    console.error('Usage: node stripSasFromPhotoUrls.cjs <albumId>');
    process.exit(1);
  }
  const photos = await db.queryRows('SELECT id, thumbnail_url, full_image_url FROM photos WHERE album_id = $1', [albumId]);
  for (const photo of photos) {
    const cleanThumb = stripSas(photo.thumbnail_url);
    const cleanFull = stripSas(photo.full_image_url);
    if (cleanThumb !== photo.thumbnail_url || cleanFull !== photo.full_image_url) {
      await db.query('UPDATE photos SET thumbnail_url = $1, full_image_url = $2 WHERE id = $3', [cleanThumb, cleanFull, photo.id]);
      console.log(`Fixed photo ${photo.id}:`, cleanThumb, cleanFull);
    } else {
      console.log(`No change for photo ${photo.id}`);
    }
  }
  console.log('Repair complete.');
  process.exit(0);
}

main();

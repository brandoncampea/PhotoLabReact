// Set thumbnail_url = full_image_url for all photos
import mssql from '../mssql.cjs';

async function main() {
  const photos = await mssql.queryRows('SELECT id, full_image_url FROM photos');
  let updated = 0, failed = 0;
  for (const photo of photos) {
    try {
      await mssql.query('UPDATE photos SET thumbnail_url = $1 WHERE id = $2', [photo.full_image_url, photo.id]);
      updated++;
      console.log(`[${photo.id}] thumbnail_url set to full_image_url`);
    } catch (err) {
      failed++;
      console.error(`[${photo.id}] Failed to update thumbnail_url:`, err);
    }
  }
  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
  process.exit(0);
}

main();

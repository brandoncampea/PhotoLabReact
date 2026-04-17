// Find photos with missing or invalid thumbnail_url
import mssql from '../mssql.cjs';

async function main() {
  // Find photos where thumbnail_url is null, empty, or matches full_image_url
  const photos = await mssql.queryRows(`
    SELECT id, file_name, thumbnail_url, full_image_url
    FROM photos
    WHERE thumbnail_url IS NULL
      OR thumbnail_url = ''
      OR thumbnail_url = full_image_url
  `);
  if (photos.length === 0) {
    console.log('All photos have valid thumbnail_url values.');
  } else {
    console.log(`Found ${photos.length} photos with missing or invalid thumbnail_url:`);
    for (const photo of photos) {
      console.log(`[${photo.id}] file_name: ${photo.file_name}, thumbnail_url: ${photo.thumbnail_url}, full_image_url: ${photo.full_image_url}`);
    }
  }
  process.exit(0);
}

main();

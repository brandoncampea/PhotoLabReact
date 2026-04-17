// Regenerate thumbnails only for photos where thumbnail_url === full_image_url
import mssql from '../mssql.cjs';
import { downloadBlob, uploadImageBufferToAzure } from '../services/azureStorage.js';

const sharp = (await import('sharp')).default;

async function main() {
  // Only select photos where thumbnail_url === full_image_url
  const photos = await mssql.queryRows('SELECT id, file_name, full_image_url FROM photos WHERE thumbnail_url = full_image_url');
  let updated = 0, failed = 0;
  for (const photo of photos) {
    try {
      const buffer = await downloadBlob(photo.full_image_url);
      if (!buffer || buffer.length === 0) throw new Error('Empty buffer');
      const thumbBuffer = await sharp(buffer)
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      const thumbBlobName = `${photo.id}/thumb_fix_${Date.now()}_${photo.file_name.replace(/\.[^.]+$/, '.jpg')}`;
      const thumbBlobPath = await uploadImageBufferToAzure(thumbBuffer, thumbBlobName, 'image/jpeg');
      await mssql.query('UPDATE photos SET thumbnail_url = $1 WHERE id = $2', [thumbBlobPath, photo.id]);
      updated++;
      console.log(`[${photo.id}] Thumbnail fixed: ${thumbBlobPath}`);
    } catch (err) {
      failed++;
      console.error(`[${photo.id}] Failed to fix thumbnail:`, err);
    }
  }
  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
  process.exit(0);
}

main();

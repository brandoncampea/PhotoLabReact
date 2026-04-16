// Script to retroactively fix missing photo dimensions using Sharp
import mssql from '../mssql.cjs';
import sharp from 'sharp';

const { queryRows, query } = mssql;

async function main() {
  const photos = await queryRows(`SELECT id, full_image_url as url, width, height FROM photos WHERE width IS NULL OR height IS NULL`);
  console.log(`Found ${photos.length} photos with missing dimensions.`);
  for (const photo of photos) {
    try {
      // Download image buffer (assumes local or Azure blob URL)
      let buffer;
      if (photo.url.startsWith('http')) {
        const res = await fetch(photo.url);
        if (!res.ok) throw new Error(`Failed to fetch ${photo.url}`);
        buffer = Buffer.from(await res.arrayBuffer());
      } else {
        // Local file path
        const fs = await import('fs/promises');
        buffer = await fs.readFile(photo.url);
      }
      const meta = await sharp(buffer).metadata();
      const width = meta.width || null;
      const height = meta.height || null;
      if (width && height) {
        await query(`UPDATE photos SET width = $1, height = $2 WHERE id = $3`, [width, height, photo.id]);
        console.log(`Updated photo ${photo.id}: ${width}x${height}`);
      } else {
        console.warn(`Could not determine dimensions for photo ${photo.id}`);
      }
    } catch (err) {
      console.error(`Error processing photo ${photo.id}:`, err);
    }
  }
  console.log('Done.');
}

main();

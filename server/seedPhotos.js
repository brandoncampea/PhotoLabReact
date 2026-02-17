import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { queryRow, query } from './mssql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');

const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
};

const sourceDir = getArg('--dir') || getArg('-d');
const albumName = getArg('--album') || getArg('-a') || (sourceDir ? path.basename(sourceDir) : undefined);

if (!sourceDir) {
  console.error('Usage: node server/seedPhotos.js --dir <folder> [--album "Album Name"]');
  process.exit(1);
}

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const main = async () => {
  fs.mkdirSync(uploadsDir, { recursive: true });

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error('Source directory does not exist or is not a directory:', sourceDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return fs.statSync(path.join(sourceDir, file)).isFile() && allowedExtensions.has(ext);
    });

  if (!files.length) {
    console.log('No image files found in', sourceDir);
    process.exit(0);
  }

  let albumId;
  const existingAlbum = await queryRow(
    'SELECT id, cover_image_url FROM albums WHERE name = $1',
    [albumName]
  );
  if (existingAlbum) {
    albumId = existingAlbum.id;
  } else {
    const result = await queryRow(
      'INSERT INTO albums (name, description) VALUES ($1, $2) RETURNING id',
      [albumName, 'Seeded photos']
    );
    albumId = result.id;
  }

  let added = 0;
  let skipped = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const srcPath = path.join(sourceDir, file);

    const already = await queryRow(
      'SELECT id FROM photos WHERE album_id = $1 AND file_name = $2',
      [albumId, file]
    );
    if (already) {
      skipped += 1;
      continue;
    }

    let width = null;
    let height = null;
    try {
      const meta = await sharp(srcPath).metadata();
      width = meta.width || null;
      height = meta.height || null;
    } catch (err) {
      console.warn('Could not read dimensions for', file, err.message);
    }

    const destName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const destPath = path.join(uploadsDir, destName);
    fs.copyFileSync(srcPath, destPath);

    await query(
      `INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [albumId, file, `/uploads/${destName}`, `/uploads/${destName}`, '', width, height]
    );

    added += 1;
  }

  await query(
    `UPDATE albums SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1) WHERE id = $2`,
    [albumId, albumId]
  );

  const coverRow = await queryRow('SELECT cover_image_url FROM albums WHERE id = $1', [albumId]);
  if (!coverRow?.cover_image_url) {
    const firstPhoto = await queryRow(
      'SELECT TOP 1 full_image_url FROM photos WHERE album_id = $1 ORDER BY id',
      [albumId]
    );
    if (firstPhoto?.full_image_url) {
      await query('UPDATE albums SET cover_image_url = $1 WHERE id = $2', [firstPhoto.full_image_url, albumId]);
    }
  }

  console.log(`Seed complete. Album: ${albumName} (id: ${albumId}). Added: ${added}. Skipped existing: ${skipped}.`);
  process.exit(0);
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

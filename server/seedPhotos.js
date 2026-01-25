import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { db, initDb } from './database.js';

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
  initDb();
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
  const existingAlbum = db.prepare('SELECT id, cover_image_url FROM albums WHERE name = ?').get(albumName);
  if (existingAlbum) {
    albumId = existingAlbum.id;
  } else {
    const result = db
      .prepare('INSERT INTO albums (name, description) VALUES (?, ?)')
      .run(albumName, 'Seeded photos');
    albumId = result.lastInsertRowid;
  }

  let added = 0;
  let skipped = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const srcPath = path.join(sourceDir, file);

    const already = db.prepare('SELECT id FROM photos WHERE album_id = ? AND file_name = ?').get(albumId, file);
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

    db.prepare(
      `INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(albumId, file, `/uploads/${destName}`, `/uploads/${destName}`, '', width, height);

    added += 1;
  }

  db.prepare(
    `UPDATE albums SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = ?) WHERE id = ?`
  ).run(albumId, albumId);

  const coverRow = db.prepare('SELECT cover_image_url FROM albums WHERE id = ?').get(albumId);
  if (!coverRow?.cover_image_url) {
    const firstPhoto = db
      .prepare('SELECT full_image_url FROM photos WHERE album_id = ? ORDER BY id LIMIT 1')
      .get(albumId);
    if (firstPhoto?.full_image_url) {
      db.prepare('UPDATE albums SET cover_image_url = ? WHERE id = ?').run(firstPhoto.full_image_url, albumId);
    }
  }

  console.log(`Seed complete. Album: ${albumName} (id: ${albumId}). Added: ${added}. Skipped existing: ${skipped}.`);
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

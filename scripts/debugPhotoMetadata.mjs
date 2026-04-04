import db from '../server/mssql.cjs';
import sharp from 'sharp';
import { downloadBlob } from '../server/services/azureStorage.js';

const photoId = Number(process.argv[2] || 0);
if (!photoId) {
  console.error('Usage: node scripts/debugPhotoMetadata.mjs <photoId>');
  process.exit(1);
}

const row = await db.queryRow('SELECT id, full_image_url as fullImageUrl, metadata FROM photos WHERE id = $1', [photoId]);
if (!row) {
  console.error('Photo not found');
  process.exit(1);
}

let buffer;
if (String(row.fullImageUrl || '').startsWith('http')) {
  const r = await fetch(row.fullImageUrl);
  buffer = Buffer.from(await r.arrayBuffer());
} else {
  const blob = await downloadBlob(row.fullImageUrl);
  const chunks = [];
  await new Promise((resolve, reject) => {
    blob.readableStreamBody.on('data', (c) => chunks.push(c));
    blob.readableStreamBody.on('end', resolve);
    blob.readableStreamBody.on('error', reject);
  });
  buffer = Buffer.concat(chunks);
}

const md = await sharp(buffer).metadata();
const xmpText = md.xmp ? Buffer.from(md.xmp).toString('utf8') : '';
const iptcText = md.iptc ? Buffer.from(md.iptc).toString('utf8') : '';

console.log(JSON.stringify({
  dbMetadata: row.metadata,
  hasExif: !!md.exif,
  hasXmp: !!md.xmp,
  hasIptc: !!md.iptc,
  hasIcc: !!md.icc,
  space: md.space,
  width: md.width,
  height: md.height,
  xmpHasTennis: /Tennis/i.test(xmpText),
  xmpHasD3: /D3/i.test(xmpText),
  iptcHasTennis: /Tennis/i.test(iptcText),
  iptcHasD3: /D3/i.test(iptcText),
  xmpSubject: (xmpText.match(/<dc:subject>[\s\S]*?<\/dc:subject>/i) || [''])[0],
}, null, 2));

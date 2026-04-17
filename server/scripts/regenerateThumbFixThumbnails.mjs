

// =============================
//  MANUAL AZURE CONFIG SECTION
// =============================
// Fill in your Azure storage credentials below:
process.env.AZURE_STORAGE_ACCOUNT = '';
process.env.AZURE_STORAGE_KEY = '';
process.env.AZURE_STORAGE_CONTAINER = '';
// OR, if you use a connection string:
// process.env.AZURE_STORAGE_CONNECTION_STRING = '';
// =============================

// =============================
//  MANUAL MSSQL CONFIG SECTION
// =============================
// Fill in your MSSQL database credentials below:

import sharp from 'sharp';
import { downloadBlob, uploadImageBufferToAzure } from '../services/azureStorage.js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';


async function main() {
  // Path to the CSV file
  const csvPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'results (2).csv');
  let csvContent;
  try {
    csvContent = fs.readFileSync(csvPath, 'utf8');
  } catch (err) {
    console.error('Failed to read CSV file:', err);
    return;
  }

  let records;
  try {
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });
  } catch (err) {
    console.error('Failed to parse CSV:', err);
    return;
  }

  if (!records.length) {
    console.log('No records found in CSV.');
    return;
  }

  for (const photo of records) {
    const thumbnailPath = photo.thumbnail_url;
    const fullImagePath = photo.full_image_url;
    if (!thumbnailPath || !fullImagePath) continue;
    // Only process if the filename (after last slash) contains a space
    const filename = fullImagePath.split('/').pop();
    if (!filename || !filename.includes(' ')) continue;
    try {
      console.log(`Processing thumbnail: ${thumbnailPath} from full image: ${fullImagePath}`);
      // Download full-size image (encode path)
      const fullImage = await downloadBlob(encodeURI(fullImagePath));
      if (!fullImage?.readableStreamBody) {
        console.error(`Failed to download full image for ${fullImagePath}`);
        continue;
      }
      // Buffer the stream
      const chunks = [];
      for await (const chunk of fullImage.readableStreamBody) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);
      // Generate thumbnail (400x400 max, JPEG)
      const thumbnailBuffer = await sharp(fileBuffer)
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      // Upload thumbnail to Azure (encode path)
      await uploadImageBufferToAzure(thumbnailBuffer, encodeURI(thumbnailPath), 'image/jpeg');
      console.log(`Thumbnail uploaded for ${thumbnailPath}`);
    } catch (err) {
      console.error(`Error processing thumbnail ${thumbnailPath}:`, err);
    }
  }
  console.log('Thumbnail regeneration complete.');
}

main();

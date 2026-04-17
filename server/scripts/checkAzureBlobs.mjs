// This script checks for the existence of blobs in Azure Blob Storage for a list of thumbnail URLs.
// Usage: node checkAzureBlobs.mjs urls.txt

import { BlobServiceClient } from '@azure/storage-blob';
import fs from 'fs';
import path from 'path';

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_CONTAINER_NAME || 'photos';

if (!AZURE_STORAGE_CONNECTION_STRING) {
  console.error('Missing AZURE_STORAGE_CONNECTION_STRING in environment.');
  process.exit(1);
}

if (process.argv.length < 3) {
  console.error('Usage: node checkAzureBlobs.mjs <urls.txt>');
  process.exit(1);
}

const inputFile = process.argv[2];
const lines = fs.readFileSync(inputFile, 'utf-8').split('\n').filter(Boolean);

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);

async function checkBlobExists(blobPath) {
  try {
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    return await blockBlobClient.exists();
  } catch (err) {
    return false;
  }
}

async function main() {
  let missing = [];
  for (const line of lines) {
    // Only check relative paths, skip full URLs (SAS URLs)
    if (line.startsWith('albums/')) {
      const exists = await checkBlobExists(line);
      if (!exists) {
        missing.push(line);
        console.log('MISSING:', line);
      }
    }
  }
  if (missing.length === 0) {
    console.log('All blobs exist.');
  } else {
    console.log(`Missing blobs: ${missing.length}`);
    fs.writeFileSync('missing_blobs.txt', missing.join('\n'));
  }
}

main();

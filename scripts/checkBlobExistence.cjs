// Check existence of blobs in Azure Storage for a list of blob names
// Usage: node scripts/checkBlobExistence.cjs <container> <blob1> <blob2> ...

const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const containerName = process.argv[2];
  const blobs = process.argv.slice(3);
  if (!containerName || blobs.length === 0) {
    console.error('Usage: node checkBlobExistence.cjs <container> <blob1> <blob2> ...');
    process.exit(1);
  }
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    console.error('Missing AZURE_STORAGE_CONNECTION_STRING in .env.local');
    process.exit(1);
  }
  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = blobServiceClient.getContainerClient(containerName);

  for (const blobName of blobs) {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    try {
      const exists = await blockBlobClient.exists();
      console.log(`${blobName}: ${exists ? 'FOUND' : 'NOT FOUND'}`);
    } catch (e) {
      console.error(`${blobName}: ERROR`, e.message);
    }
  }
}

main();

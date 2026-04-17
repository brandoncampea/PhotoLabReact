// Script to list all blobs in the configured Azure Storage container
// Usage: node scripts/listAzureBlobs.js

const { BlobServiceClient } = require('@azure/storage-blob');

const STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_CONTAINER_NAME;

if (!STORAGE_CONNECTION_STRING || !STORAGE_CONTAINER) {
  console.error('Missing Azure Storage connection string or container name.');
  process.exit(1);
}

async function listBlobs() {
  const blobServiceClient = BlobServiceClient.fromConnectionString(STORAGE_CONNECTION_STRING);
  const containerClient = blobServiceClient.getContainerClient(STORAGE_CONTAINER);

  console.log(`Listing blobs in container: ${STORAGE_CONTAINER}`);
  let count = 0;
  for await (const blob of containerClient.listBlobsFlat()) {
    console.log(blob.name);
    count++;
  }
  console.log(`Total blobs: ${count}`);
}

listBlobs().catch((err) => {
  console.error('Error listing blobs:', err.message);
  process.exit(1);
});

import { BlobServiceClient } from '@azure/storage-blob';

const STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'photos';

let containerClient;

function getContainerClient() {
  if (!STORAGE_CONNECTION_STRING) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
  }

  if (!containerClient) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(STORAGE_CONNECTION_STRING);
    containerClient = blobServiceClient.getContainerClient(STORAGE_CONTAINER);
  }

  return containerClient;
}

export async function uploadImageBufferToAzure(buffer, blobName, contentType = 'application/octet-stream') {
  const container = getContainerClient();
  await container.createIfNotExists();

  const blockBlobClient = container.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentType,
    },
  });

  return blockBlobClient.url;
}

export async function deleteBlobByUrl(blobUrl) {
  if (!blobUrl || !blobUrl.startsWith('http')) {
    return;
  }

  const container = getContainerClient();
  const url = new URL(blobUrl);
  const marker = `/${STORAGE_CONTAINER}/`;
  const markerIndex = url.pathname.indexOf(marker);

  if (markerIndex < 0) {
    return;
  }

  const blobName = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  if (!blobName) {
    return;
  }

  await container.deleteBlob(blobName, { deleteSnapshots: 'include' }).catch(() => {
    // Ignore missing blobs
  });
}

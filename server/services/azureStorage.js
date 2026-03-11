import {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';

const STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'photos';

let containerClient;

function parseConnectionString(connectionString) {
  if (!connectionString) return { accountName: null, accountKey: null };

  const parts = connectionString.split(';').reduce((acc, segment) => {
    const [key, ...rest] = segment.split('=');
    if (!key) return acc;
    acc[key] = rest.join('=');
    return acc;
  }, {});

  return {
    accountName: parts.AccountName || null,
    accountKey: parts.AccountKey || null,
  };
}

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

export function getBlobNameFromUrlOrName(blobUrlOrName) {
  if (!blobUrlOrName) return null;

  if (!String(blobUrlOrName).startsWith('http')) {
    return blobUrlOrName;
  }

  try {
    const parsed = new URL(blobUrlOrName);
    const marker = `/${STORAGE_CONTAINER}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }

    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

export function getSignedReadUrl(blobUrlOrName, expiresInHours = Number(process.env.AZURE_READ_SAS_HOURS || 24)) {
  if (!blobUrlOrName) return blobUrlOrName;

  const container = getContainerClient();
  const { accountName, accountKey } = parseConnectionString(STORAGE_CONNECTION_STRING);
  if (!accountName || !accountKey) {
    return blobUrlOrName;
  }

  const blobName = getBlobNameFromUrlOrName(blobUrlOrName);

  if (!blobName) return blobUrlOrName;

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + Math.max(1, expiresInHours) * 60 * 60 * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container.containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
      protocol: 'https',
    },
    sharedKeyCredential
  );

  return `${container.getBlockBlobClient(blobName).url}?${sas.toString()}`;
}

export async function downloadBlob(blobUrlOrName) {
  const blobName = getBlobNameFromUrlOrName(blobUrlOrName);
  if (!blobName) {
    return null;
  }

  const container = getContainerClient();
  const blockBlobClient = container.getBlockBlobClient(blobName);
  return blockBlobClient.download();
}

export async function deleteBlobByUrl(blobUrl) {
  if (!blobUrl || !blobUrl.startsWith('http')) {
    return;
  }

  const container = getContainerClient();
  const blobName = getBlobNameFromUrlOrName(blobUrl);
  if (!blobName) {
    return;
  }

  await container.deleteBlob(blobName, { deleteSnapshots: 'include' }).catch(() => {
    // Ignore missing blobs
  });
}

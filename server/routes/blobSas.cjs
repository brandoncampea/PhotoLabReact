const express = require('express');
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol } = require('@azure/storage-blob');
require('dotenv').config();

const router = express.Router();

const accountName = process.env.AZURE_STORAGE_ACCOUNT;
const accountKey = process.env.AZURE_STORAGE_KEY;
const containerName = process.env.AZURE_CONTAINER_NAME;

if (!accountName || !accountKey || !containerName) {
  console.error('Missing Azure Storage env vars. Set AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, AZURE_CONTAINER_NAME.');
}
// Endpoint to check Azure Storage config (safe for browser, masks secrets)
router.get('/config', (req, res) => {
  const config = {
    AZURE_STORAGE_ACCOUNT: process.env.AZURE_STORAGE_ACCOUNT || null,
    AZURE_STORAGE_KEY: process.env.AZURE_STORAGE_KEY ? '***MASKED***' : null,
    AZURE_CONTAINER_NAME: process.env.AZURE_CONTAINER_NAME || null,
    AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING ? '***MASKED***' : null,
    NODE_ENV: process.env.NODE_ENV || null,
  };
  res.json({ ok: true, config });
});

// Support both /sas-url and root for compatibility with frontend useSasUrl
router.get(['/sas-url', '/'], async (req, res) => {

  console.log('[SAS ROUTE] /api/blob-sas hit', { query: req.query });
  const { blobName } = req.query;
  console.log('[SAS ROUTE] blobName received:', blobName);
  console.log('[SAS ROUTE] containerName:', containerName);
  if (!blobName) return res.status(400).json({ error: 'Missing blobName' });

  try {
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('rcw'), // read, create, write
      startsOn: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      expiresOn: new Date(Date.now() + 3600 * 1000), // 1 hour
      protocol: SASProtocol.Https,
      resource: 'b',
    }, sharedKeyCredential).toString();

    const url = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
    // Log for debugging
    console.log('[SAS DEBUG]', {
      blobName,
      containerName,
      url,
      permissions: 'rcw',
      time: new Date().toISOString(),
    });
    // Extra logging for troubleshooting 403 errors
    console.log('[SAS EXTRA LOGGING]');
    console.log('  blobName:', blobName);
    console.log('  containerName:', containerName);
    console.log('  SAS URL:', url);
    try {
      const decodedBlobName = decodeURIComponent(blobName);
      console.log('  Decoded blobName:', decodedBlobName);
      console.log('  SAS URL with decoded blobName:', `https://${accountName}.blob.core.windows.net/${containerName}/${decodedBlobName}?${sasToken}`);
    } catch (e) {
      console.log('  Could not decode blobName:', e);
    }
    res.json({ sasUrl: url, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate SAS URL' });
  }
});

module.exports = router;

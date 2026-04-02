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

// Cache SAS tokens: they're valid for 1 hour, refresh after 55 min
const _sasCache = new Map(); // blobName -> { url, expiresAt }
const SAS_TTL_MS = 55 * 60 * 1000;

router.get('/sas-url', async (req, res) => {
  const { blobName } = req.query;
  if (!blobName) return res.status(400).json({ error: 'Missing blobName' });

  const cached = _sasCache.get(blobName);
  if (cached && Date.now() < cached.expiresAt) {
    return res.set('Cache-Control', 'public, max-age=3000').json({ url: cached.url });
  }

  try {
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn: new Date(),
      expiresOn: new Date(Date.now() + 3600 * 1000), // 1 hour
      protocol: SASProtocol.Https,
    }, sharedKeyCredential).toString();

    const url = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
    _sasCache.set(blobName, { url, expiresAt: Date.now() + SAS_TTL_MS });
    res.set('Cache-Control', 'public, max-age=3000').json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate SAS URL' });
  }
});

module.exports = router;

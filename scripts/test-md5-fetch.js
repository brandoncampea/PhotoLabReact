// Standalone test for Azure Blob fetch + MD5 hash using backend logic
import axios from 'axios';
import { createHash } from 'crypto';

const url = 'https://campeaphotolab.blob.core.windows.net/photostest/albums/70/1F2A6630.jpg';

async function computeImageSignature(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }
  const hash = createHash('md5');
  hash.update(buffer);
  return hash.digest('hex');
}

(async () => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', headers: {} });
    const buffer = Buffer.from(response.data);
    console.log('Fetched buffer length:', buffer.length);
    console.log('Buffer sample (first 32 bytes):', buffer.slice(0, 32));
    const hash = await computeImageSignature(buffer);
    console.log('MD5 hash:', hash);
  } catch (err) {
    if (err.response) {
      console.error('Fetch failed:', err.response.status, err.response.statusText);
    } else {
      console.error('Fetch failed:', err.message);
    }
  }
})();

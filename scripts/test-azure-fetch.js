// Minimal Node.js script to test Azure Blob public image fetch with axios and https

import axios from 'axios';
import https from 'https';

const url = 'https://campeaphotolab.blob.core.windows.net/photostest/albums/68/ADDISON_RICE_03.jpg'; // Replace with any failing URL

async function testAxios() {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    console.log('[AXIOS] Success:', res.status, 'bytes:', res.data.length);
  } catch (err) {
    if (err.response) {
      console.error('[AXIOS] Error:', err.response.status, err.response.statusText);
    } else {
      console.error('[AXIOS] Error:', err.message);
    }
  }
}

function testHttps() {
  https.get(url, (res) => {
    let data = [];
    res.on('data', chunk => data.push(chunk));
    res.on('end', () => {
      const buffer = Buffer.concat(data);
      console.log('[HTTPS] Success:', res.statusCode, 'bytes:', buffer.length);
    });
  }).on('error', (e) => {
    console.error('[HTTPS] Error:', e.message);
  });
}

(async () => {
  await testAxios();
  testHttps();
})();

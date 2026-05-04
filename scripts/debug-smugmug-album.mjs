// Run: node scripts/debug-smugmug-album.mjs 2QPfsG
import { createHmac } from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const albumKey = process.argv[2] || '2QPfsG';
const { default: db } = await import('../server/mssql.cjs');
const config = await db.queryRow(
  'SELECT api_key, api_secret, access_token, access_token_secret FROM studio_smugmug_config WHERE studio_id = $1',
  [7]
);
console.log('DB Config:', {
  apiKey: config?.api_key,
  hasApiSecret: !!config?.api_secret,
  hasAccessToken: !!config?.access_token,
  hasAccessTokenSecret: !!config?.access_token_secret,
});

const apiKey = String(config?.api_key || '').trim();
const apiSecret = String(config?.api_secret || '').trim();
const accessToken = String(config?.access_token || '').trim();
const accessTokenSecret = String(config?.access_token_secret || '').trim();

const { default: OAuth } = await import('oauth-1.0a');
const { default: fetch } = await import('node-fetch');

let authContext = null;
if (apiKey && apiSecret && accessToken && accessTokenSecret) {
  const oauth = OAuth({
    consumer: { key: apiKey, secret: apiSecret },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return createHmac('sha1', key).update(base_string).digest('base64');
    },
  });
  authContext = { oauth, token: { key: accessToken, secret: accessTokenSecret } };
  console.log('OAuth context: ACTIVE');
} else {
  console.log('OAuth context: NONE (missing credentials)');
}

const makeRequest = async (path) => {
  const url = new URL('https://api.smugmug.com' + path);
  if (apiKey) url.searchParams.set('APIKey', apiKey);
  const urlStr = url.toString();
  const headers = { Accept: 'application/json', 'Accept-Version': 'v2' };
  if (authContext) {
    const signed = authContext.oauth.toHeader(
      authContext.oauth.authorize({ url: urlStr, method: 'GET' }, authContext.token)
    );
    Object.assign(headers, signed);
  }
  const r = await fetch(urlStr, { headers });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
};

console.log('\n=== Album', albumKey, '===');
const imagesPayload = await makeRequest(`/api/v2/album/${albumKey}!images?count=3&_verbosity=2`);
const images = imagesPayload?.Response?.AlbumImage || imagesPayload?.Response?.Image || [];
console.log('Images in first page:', images.length);

for (const img of images.slice(0, 2)) {
  const imageKey = img?.ImageKey || img?.Key;
  console.log('\n--- Image:', img?.FileName || img?.Name, '| Key:', imageKey);
  console.log('  OriginalUrl:', img?.OriginalUrl ?? '(missing)');
  console.log('  ArchiveUrl:', img?.ArchiveUrl ?? '(missing)');
  console.log('  X5LargeUrl:', img?.X5LargeUrl ?? '(missing)');
  console.log('  X4LargeUrl:', img?.X4LargeUrl ?? '(missing)');
  console.log('  X3LargeUrl:', img?.X3LargeUrl ?? '(missing)');
  console.log('  X2LargeUrl:', img?.X2LargeUrl ?? '(missing)');
  console.log('  XLargeUrl:', img?.XLargeUrl ?? '(missing)');
  console.log('  LargeUrl:', img?.LargeUrl ?? '(missing)');
  console.log('  Url:', img?.Url ?? '(missing)');
  console.log('  Uri:', img?.Uri ?? '(missing)');
  console.log('  Uris keys:', Object.keys(img?.Uris || {}));

  if (imageKey) {
    try {
      const p = await makeRequest(`/api/v2/image/${imageKey}!largestimage`);
      const resp = p?.Response || {};
      console.log('  !largestimage keys:', Object.keys(resp));
      const li = resp?.LargestImage || resp?.Image || resp;
      console.log('  !largestimage Url:', li?.Url ?? '(missing)');
      console.log('  !largestimage Width:', li?.Width, 'Height:', li?.Height);
    } catch (e) {
      console.log('  !largestimage error:', e.message);
    }

    try {
      const p2 = await makeRequest(`/api/v2/image/${imageKey}!sizedetails`);
      const resp2 = p2?.Response || {};
      console.log('  !sizedetails keys:', Object.keys(resp2));
      const sizes = resp2?.ImageSizeDetails || resp2?.ImageSizes || [];
      if (Array.isArray(sizes)) {
        console.log('  Sizes count:', sizes.length);
        sizes.slice(0, 5).forEach(s => console.log('    Size:', s?.Label, '|', s?.Width, 'x', s?.Height, '|', s?.Url?.slice(0, 80)));
      } else if (typeof sizes === 'object') {
        const vals = Object.values(sizes);
        console.log('  Sizes count:', vals.length);
        vals.slice(0, 5).forEach(s => console.log('    Size:', s?.Label, '|', s?.Width, 'x', s?.Height, '|', s?.Url?.slice(0, 80)));
      }
    } catch (e) {
      console.log('  !sizedetails error:', e.message);
    }
  }
}

process.exit(0);

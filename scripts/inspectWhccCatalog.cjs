require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
  try {
    const base = process.env.WHCC_SANDBOX === 'true'
      ? 'https://sandbox.apps.whcc.com'
      : 'https://apps.whcc.com';

    const tokenResp = await axios.get(`${base}/api/AccessToken`, {
      params: {
        grant_type: 'consumer_credentials',
        consumer_key: process.env.WHCC_CONSUMER_KEY,
        consumer_secret: process.env.WHCC_CONSUMER_SECRET,
      },
      headers: { Accept: 'application/json' },
    });

    const token = tokenResp.data?.Token || tokenResp.data?.token;
    console.log('Has token:', !!token);

    const catalogResp = await axios.get(`${base}/api/catalog`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    const payload = catalogResp.data;
    let products = [];
    if (Array.isArray(payload?.Products)) products = payload.Products;
    else if (Array.isArray(payload?.products)) products = payload.products;
    else if (Array.isArray(payload?.Categories)) {
      products = payload.Categories.flatMap((c) => (Array.isArray(c?.ProductList) ? c.ProductList : []));
    } else if (Array.isArray(payload?.categories)) {
      products = payload.categories.flatMap((c) => (Array.isArray(c?.productList) ? c.productList : []));
    }

    console.log('Total catalog products:', products.length);

    const rows = products.map((p) => ({
      uid: p?.ProductUID ?? p?.productUID ?? p?.ProductId ?? p?.productId ?? p?.UID ?? null,
      node: p?.ProductNodeID ?? p?.productNodeID ?? p?.DefaultProductNodeID ?? p?.defaultProductNodeID ?? null,
      name: p?.Name || p?.name || p?.ProductName || '',
      desc: p?.Description || p?.description || '',
      attrs: p?.DefaultItemAttributes || p?.defaultItemAttributes || p?.ItemAttributes || p?.itemAttributes || [],
    }));

    const mugLike = rows.filter((r) => /mug|cup|tumbler|drink/i.test(`${r.name} ${r.desc}`));
    console.log('Mug-like products:', mugLike.length);
    mugLike.slice(0, 80).forEach((r) => {
      const attrUids = Array.isArray(r.attrs)
        ? r.attrs.map((a) => a?.AttributeUID ?? a?.attributeUID ?? a?.uid ?? a).filter(Boolean)
        : [];
      console.log(`${r.uid} | node:${r.node} | ${r.name} | attrs:[${attrUids.join(',')}]`);
    });
  } catch (e) {
    console.error('Catalog inspection failed:', e?.response?.status, e?.response?.data || e.message);
    process.exit(1);
  }
})();

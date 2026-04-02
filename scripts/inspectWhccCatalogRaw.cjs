require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
  const base = process.env.WHCC_SANDBOX === 'true' ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';
  try {
    const tokenResp = await axios.get(`${base}/api/AccessToken`, {
      params: {
        grant_type: 'consumer_credentials',
        consumer_key: process.env.WHCC_CONSUMER_KEY,
        consumer_secret: process.env.WHCC_CONSUMER_SECRET,
      },
      headers: { Accept: 'application/json' },
    });
    const token = tokenResp.data?.Token || tokenResp.data?.token;

    const catResp = await axios.get(`${base}/api/catalog`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    const d = catResp.data;
    console.log('Top-level keys:', Object.keys(d || {}));

    if (Array.isArray(d?.Categories) && d.Categories.length) {
      console.log('First category keys:', Object.keys(d.Categories[0] || {}));
      console.log('First category name:', d.Categories[0]?.Name || d.Categories[0]?.name);
      const list = d.Categories[0]?.ProductList || d.Categories[0]?.productList || [];
      if (Array.isArray(list) && list.length) {
        console.log('First product keys in first category:', Object.keys(list[0] || {}));
        console.log('First product sample:', JSON.stringify(list[0], null, 2).slice(0, 3000));
      }

      const orderAttrCats = d.Categories
        .flatMap((c) => Array.isArray(c?.OrderAttributeCategoryList) ? c.OrderAttributeCategoryList : [])
        .slice(0, 20)
        .map((o) => ({
          id: o?.Id,
          name: o?.AttributeCategoryName || o?.Name,
          required: o?.RequiredLevel,
          attrCount: Array.isArray(o?.Attributes) ? o.Attributes.length : 0,
          attrs: (o?.Attributes || []).slice(0, 5).map((a) => ({ id: a?.Id, name: a?.AttributeName || a?.Name })),
        }));
      console.log('OrderAttributeCategoryList sample:', JSON.stringify(orderAttrCats, null, 2));

      const mugProducts = d.Categories
        .flatMap((c) => Array.isArray(c?.ProductList) ? c.ProductList : [])
        .filter((p) => /mug|drink|cup|tumbler/i.test(String(p?.Name || '')))
        .slice(0, 10);
      console.log('Mug product samples:', JSON.stringify(mugProducts, null, 2).slice(0, 8000));
    }

    if (Array.isArray(d?.Products) && d.Products.length) {
      console.log('First product keys in Products:', Object.keys(d.Products[0] || {}));
      console.log('First product sample:', JSON.stringify(d.Products[0], null, 2).slice(0, 3000));
    }
  } catch (e) {
    console.error('Failed:', e?.response?.status, e?.response?.data || e.message);
    process.exit(1);
  }
})();

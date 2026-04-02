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

    const categories = Array.isArray(catResp.data?.Categories) ? catResp.data.Categories : [];
    const allProducts = categories.flatMap((c) => Array.isArray(c?.ProductList) ? c.ProductList : []);

    const product = allProducts.find((p) => Number(p?.Id ?? p?.ProductUID ?? p?.ProductId) === 895);

    if (!product) {
      console.log('Product 895 not found');
      return;
    }

    const category = categories.find((c) => (c?.ProductList || []).some((p) => Number(p?.Id ?? p?.ProductUID ?? p?.ProductId) === 895));

    console.log('Category:', category?.Name || category?.name);
    console.log('Name:', product?.Name || product?.name);
    console.log('ID:', product?.Id || product?.ProductUID || product?.ProductId);
    console.log('\nFull product JSON:');
    console.log(JSON.stringify(product, null, 2));
  } catch (e) {
    console.error('Failed:', e?.response?.status, e?.response?.data || e.message);
    process.exit(1);
  }
})();

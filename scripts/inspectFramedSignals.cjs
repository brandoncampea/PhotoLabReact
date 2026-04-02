require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
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
  const catalogResp = await axios.get(`${base}/api/catalog`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const categories = Array.isArray(catalogResp.data?.Categories) ? catalogResp.data.Categories : [];
  const framed = categories.find((c) => String(c?.Name || '') === 'Framed Prints');
  const products = Array.isArray(framed?.ProductList) ? framed.ProductList : [];

  const categoryNames = new Set();
  const attributeNames = new Set();

  for (const product of products) {
    const attrCats = Array.isArray(product?.AttributeCategories) ? product.AttributeCategories : [];
    for (const cat of attrCats) {
      const catName = String(cat?.AttributeCategoryName || '');
      if (catName) categoryNames.add(catName);
      const attrs = Array.isArray(cat?.Attributes) ? cat.Attributes : [];
      for (const a of attrs) {
        const attrName = String(a?.AttributeName || '');
        if (attrName) attributeNames.add(attrName);
      }
    }
  }

  const catArr = Array.from(categoryNames).sort();
  const attrArr = Array.from(attributeNames).sort();
  const signalRe = /image|photo|opening|window|single|double|triple|collage|panel|slot|multi|front|back|inside|pages?|spread/i;

  console.log(JSON.stringify({
    totalProducts: products.length,
    categoryNameCount: catArr.length,
    signalCategoryNames: catArr.filter((n) => signalRe.test(n)),
    signalAttributeNames: attrArr.filter((n) => signalRe.test(n)),
  }, null, 2));
})();

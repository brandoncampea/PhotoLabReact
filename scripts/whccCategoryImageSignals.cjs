require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

const targetCategories = new Set(['Albums', 'Books', 'Framed Prints', 'Press Printed Books']);

function hasKeyword(value, regex) {
  return regex.test(String(value || ''));
}

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
  const nameSignalRe = /image|photo|page|spread|panel|inside|front|back|book|album|cover/i;
  const multiSignalRe = /front\s*and\s*back|pages?|spread|inside|multi/i;

  for (const category of categories) {
    const categoryName = String(category?.Name || 'Uncategorized');
    if (!targetCategories.has(categoryName)) continue;

    const products = Array.isArray(category?.ProductList) ? category.ProductList : [];

    let productsWithNodes = 0;
    let productsWithMultiNodes = 0;
    let productsWithBookAttributes = 0;
    let productsWithNameSignals = 0;
    let productsWithMultiSignals = 0;

    const samples = [];

    for (const product of products) {
      const productName = String(product?.Name || '');
      const nodes = Array.isArray(product?.ProductNodes) ? product.ProductNodes : [];
      const bookAttrs = Array.isArray(product?.bookAttributes) ? product.bookAttributes : [];
      const attrCats = Array.isArray(product?.AttributeCategories) ? product.AttributeCategories : [];

      const attrCategoryNames = attrCats.map((ac) => String(ac?.AttributeCategoryName || ''));
      const attrNames = attrCats.flatMap((ac) => (Array.isArray(ac?.Attributes) ? ac.Attributes : []).map((a) => String(a?.AttributeName || '')));

      const hasNameSignal = attrCategoryNames.some((n) => hasKeyword(n, nameSignalRe)) || attrNames.some((n) => hasKeyword(n, nameSignalRe));
      const hasMultiSignal = attrCategoryNames.some((n) => hasKeyword(n, multiSignalRe)) || attrNames.some((n) => hasKeyword(n, multiSignalRe));

      if (nodes.length > 0) productsWithNodes += 1;
      if (nodes.length > 1) productsWithMultiNodes += 1;
      if (bookAttrs.length > 0) productsWithBookAttributes += 1;
      if (hasNameSignal) productsWithNameSignals += 1;
      if (hasMultiSignal) productsWithMultiSignals += 1;

      if (samples.length < 3) {
        samples.push({
          id: Number(product?.Id || 0),
          name: productName,
          nodeCount: nodes.length,
          bookAttributesCount: bookAttrs.length,
          sampleAttrCategorySignals: attrCategoryNames.filter((n) => hasKeyword(n, nameSignalRe)).slice(0, 6),
        });
      }
    }

    console.log(JSON.stringify({
      category: categoryName,
      totalProducts: products.length,
      productsWithNodes,
      productsWithMultiNodes,
      productsWithBookAttributes,
      productsWithImageOrBookSignals: productsWithNameSignals,
      productsWithExplicitMultiSignals: productsWithMultiSignals,
      samples,
    }, null, 2));
  }
})().catch((e) => {
  console.error(e?.response?.status, e?.response?.data || e.message);
  process.exit(1);
});

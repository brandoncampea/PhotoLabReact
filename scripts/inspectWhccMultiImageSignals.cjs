require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
  const base = process.env.WHCC_SANDBOX === 'true'
    ? 'https://sandbox.apps.whcc.com'
    : 'https://apps.whcc.com';

  const targetCategories = new Set(['Albums', 'Books', 'Framed Prints', 'Press Printed Books']);

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

  const categories = Array.isArray(catalogResp.data?.Categories)
    ? catalogResp.data.Categories
    : [];

  for (const category of categories) {
    const categoryName = String(category?.Name || 'Uncategorized');
    if (!targetCategories.has(categoryName)) continue;

    const productList = Array.isArray(category?.ProductList) ? category.ProductList : [];
    console.log(`\n=== ${categoryName} (products: ${productList.length}) ===`);

    const sample = productList.slice(0, 3);
    for (const product of sample) {
      const id = Number(product?.Id ?? 0) || null;
      const name = String(product?.Name || '');
      const keys = Object.keys(product || {});
      const nodes = Array.isArray(product?.ProductNodes) ? product.ProductNodes : [];
      const attrCats = Array.isArray(product?.AttributeCategories) ? product.AttributeCategories : [];
      const bookAttrs = Array.isArray(product?.bookAttributes) ? product.bookAttributes : [];

      const signalFields = {
        id,
        name,
        keys,
        ProductNodesCount: nodes.length,
        AttributeCategoriesCount: attrCats.length,
        BookAttributesCount: bookAttrs.length,
        PotentialSignals: Object.fromEntries(
          Object.entries(product || {}).filter(([k]) =>
            /image|photo|page|spread|sheet|panel|side|book|multi|min|max|count/i.test(k)
          )
        ),
      };

      console.log(JSON.stringify(signalFields, null, 2));

      if (bookAttrs.length) {
        console.log('bookAttributes sample:', JSON.stringify(bookAttrs.slice(0, 5), null, 2));
      }

      const attrSignalCats = attrCats
        .filter((ac) => /image|photo|page|spread|sheet|panel|side|book|cover|inside/i.test(String(ac?.AttributeCategoryName || '')))
        .map((ac) => ({
          id: ac?.Id,
          name: ac?.AttributeCategoryName,
          requiredLevel: ac?.RequiredLevel,
          attrCount: Array.isArray(ac?.Attributes) ? ac.Attributes.length : 0,
          attrs: (ac?.Attributes || []).slice(0, 10).map((a) => ({ id: a?.Id, name: a?.AttributeName, parent: a?.ParentAttributeUID })),
        }));

      if (attrSignalCats.length) {
        console.log('attribute signal categories:', JSON.stringify(attrSignalCats, null, 2));
      }
    }
  }
})().catch((e) => {
  console.error(e?.response?.status, e?.response?.data || e.message);
  process.exit(1);
});

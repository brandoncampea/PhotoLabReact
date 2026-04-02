require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
  const base = process.env.WHCC_SANDBOX === 'true' ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';
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
  const allProducts = categories.flatMap((c) => Array.isArray(c?.ProductList) ? c.ProductList.map((p) => ({...p, _category: c?.Name || c?.name || ''})) : []);

  const matches = allProducts.filter((p) => {
    const n = String(p?.Name || '').toLowerCase();
    return n.includes('blanket') || n.includes('fleece') || n.includes('60x80') || n.includes('60 x 80');
  });

  console.log(JSON.stringify(matches.map((p) => ({
    id: p?.Id,
    name: p?.Name,
    category: p?._category,
    node: Array.isArray(p?.ProductNodes) ? p.ProductNodes[0]?.DP2NodeID : null,
    attrs: (p?.AttributeCategories || []).map((ac) => ({
      id: ac?.Id,
      name: ac?.AttributeCategoryName,
      requiredLevel: ac?.RequiredLevel,
      firstAttr: ac?.Attributes?.[0] ? { id: ac.Attributes[0].Id, name: ac.Attributes[0].AttributeName, parent: ac.Attributes[0].ParentAttributeUID } : null,
    })),
  })), null, 2));
})();

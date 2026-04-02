require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

const targetProductIds = new Set([669, 928, 81]);
const targetAttrIds = new Set([2905, 627, 617]);

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
    const products = categories.flatMap((c) => (c?.ProductList || []).map((p) => ({ ...p, _category: c?.Name || '' })));

    for (const p of products) {
      const pid = Number(p?.Id ?? p?.ProductUID ?? p?.ProductId);
      if (!targetProductIds.has(pid)) continue;
      console.log('\n=== PRODUCT ===');
      console.log(JSON.stringify({ id: pid, name: p?.Name, category: p?._category }, null, 2));
      for (const ac of (p?.AttributeCategories || [])) {
        console.log(JSON.stringify({
          categoryId: ac?.Id,
          categoryName: ac?.AttributeCategoryName,
          requiredLevel: ac?.RequiredLevel,
          attrs: (ac?.Attributes || []).map((a) => ({
            id: a?.Id,
            name: a?.AttributeName,
            parent: a?.ParentAttributeUID,
            hit: targetAttrIds.has(Number(a?.Id)) || targetAttrIds.has(Number(a?.ParentAttributeUID || 0)),
          })),
        }, null, 2));
      }
    }
  } catch (e) {
    console.error('Failed', e?.response?.status, e?.response?.data || e.message);
    process.exit(1);
  }
})();

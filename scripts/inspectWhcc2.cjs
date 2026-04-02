require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
  const base = process.env.WHCC_SANDBOX === 'true'
    ? 'https://sandbox.apps.whcc.com'
    : 'https://apps.whcc.com';

  console.log('Base:', base, '| Key prefix:', process.env.WHCC_CONSUMER_KEY?.slice(0, 8));

  const tok = await axios.get(base + '/api/AccessToken', {
    params: {
      grant_type: 'consumer_credentials',
      consumer_key: process.env.WHCC_CONSUMER_KEY,
      consumer_secret: process.env.WHCC_CONSUMER_SECRET,
    },
  });
  const token = tok.data.Token;
  console.log('Token OK:', !!token);

  const cat = await axios.get(base + '/api/catalog', {
    headers: { Authorization: 'Bearer ' + token },
  });

  console.log('Catalog response keys:', Object.keys(cat.data || {}));

  // Products live in Categories[].ProductList
  const prods = (cat.data.Categories ?? []).flatMap(c => c.ProductList ?? []);
  console.log('Total products in catalog:', prods.length);

  const TARGET_IDS = [1005, 1006, 1007, 1008, 1009, 1032, 1043, 1044, 1045, 1046];
  const found = prods.filter(p => TARGET_IDS.includes(Number(p.Id ?? p.ProductUID ?? p.productUID)));

  const byName = prods.filter(p => {
    const n = String(p.Name ?? p.name ?? '').toLowerCase();
    return n.includes('rep card') || n.includes('bamboo ornament');
  });

  const combined = [...found];
  for (const p of byName) {
    if (!combined.some(x => x.Id === p.Id)) combined.push(p);
  }

  console.log('Matched products:', combined.length);

  for (const p of combined) {
    console.log('\n=== Id:', p.Id, '|', p.Name, '===');
    console.log('  ProductNodes:', JSON.stringify((p.ProductNodes || []).map(n => ({ nodeId: n.DP2NodeID, desc: n.Description }))));
    console.log('  DefaultItemAttributes:', JSON.stringify(p.DefaultItemAttributes ?? []));
    const cats = p.AttributeCategories ?? [];
    for (const cat of cats) {
      const catName = cat.AttributeCategoryName ?? cat.Name;
      console.log('  AttrCat:', catName, '| RequiredLevel:', cat.RequiredLevel);
      for (const a of (cat.Attributes ?? [])) {
        console.log('    Attr Id:', a.Id, '| Name:', a.AttributeName ?? a.Name, '| ParentAttributeUID:', a.ParentAttributeUID);
      }
    }
  }

  require('fs').writeFileSync('scripts/whcc-catalog-inspect.json', JSON.stringify(combined, null, 2));
  console.log('\nSaved to scripts/whcc-catalog-inspect.json');
  process.exit(0);
})().catch(e => {
  console.error('ERROR:', e.response?.data || e.message);
  process.exit(1);
});

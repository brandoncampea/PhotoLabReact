import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axios = require('axios');

const base = process.env.WHCC_SANDBOX === 'true'
  ? 'https://sandbox.apps.whcc.com'
  : 'https://apps.whcc.com';

const tok = await axios.get(base + '/api/AccessToken', {
  params: {
    grant_type: 'consumer_credentials',
    consumer_key: process.env.WHCC_CONSUMER_KEY,
    consumer_secret: process.env.WHCC_CONSUMER_SECRET,
  },
});
const token = tok.data.Token;

const cat = await axios.get(base + '/api/catalog', {
  headers: { Authorization: 'Bearer ' + token },
});

const prods = cat.data?.Products || cat.data?.products || [];

const TARGET_UIDS = [1005,1006,1007,1008,1009,1032,1043,1044,1045,1046];

const found = prods.filter(p => TARGET_UIDS.includes(Number(p.ProductUID ?? p.productUID)));

const byName = prods.filter(p => {
  const n = String(p.Name ?? p.name ?? '').toLowerCase();
  return n.includes('rep card') || n.includes('bamboo ornament');
});

const combined = [...found];
for (const p of byName) {
  if (!combined.some(x => x.ProductUID === p.ProductUID)) combined.push(p);
}

// Save full structure for inspection
writeFileSync('scripts/whcc-catalog-inspect.json', JSON.stringify(combined, null, 2));
console.log(`Saved ${combined.length} products to scripts/whcc-catalog-inspect.json`);
console.log(combined.map(p => ({
  uid: p.ProductUID,
  name: p.Name,
  nodeCount: p.ProductNodes?.length ?? 0,
  attrCategories: (p.AttributeCategories ?? []).map(c => ({
    name: c.Name,
    requiredLevel: c.RequiredLevel,
    attrs: (c.Attributes ?? []).map(a => ({ id: a.Id, name: a.Name, parent: a.ParentAttributeUID })),
  })),
  defaultAttrs: p.DefaultItemAttributes ?? p.ItemAttributes ?? [],
})));

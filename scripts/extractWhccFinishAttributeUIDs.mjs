import fs from 'fs';

// Load the WHCC catalog inspect file
const catalogPath = 'scripts/whcc-catalog-inspect.json';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Finishes/surfaces to extract (add more as needed)
const FINISH_NAMES = [
  'lustre',
  'pearl',
  'matte',
  'deep matte',
  'glossy',
  'metallic',
  'silk',
  'linen',
  'canvas',
  'fine art',
  'smooth matte',
  'deep matte velvet',
  'satin',
  'semi-gloss',
  'high gloss',
];

const finishMap = {};

for (const product of catalog) {
  if (!product.AttributeCategories) continue;
  for (const cat of product.AttributeCategories) {
    const catName = (cat.AttributeCategoryName || cat.name || '').toLowerCase();
    if (!cat.Attributes) continue;
    for (const attr of cat.Attributes) {
      const attrName = (attr.AttributeName || attr.name || '').toLowerCase();
      for (const finish of FINISH_NAMES) {
        if (attrName.includes(finish)) {
          if (!finishMap[finish]) finishMap[finish] = [];
          finishMap[finish].push({
            productId: product.Id || product.ProductUID,
            productName: product.Name,
            attributeCategory: catName,
            attributeId: attr.Id,
            attributeName: attr.AttributeName,
          });
        }
      }
    }
  }
}

// Output the mapping for review or use in updates
const outPath = 'scripts/whcc-finish-attribute-map.json';
fs.writeFileSync(outPath, JSON.stringify(finishMap, null, 2));
console.log(`Extracted finish AttributeUIDs for: ${Object.keys(finishMap).join(', ')}`);
console.log(`Output written to ${outPath}`);

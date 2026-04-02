const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scripts/whcc-node-meaning-report.json', 'utf8'));
const rows = Array.isArray(data?.rows) ? data.rows : [];

const byCategory = {};
for (const row of rows) {
  const category = row.category || 'Uncategorized';
  if (!byCategory[category]) byCategory[category] = new Map();

  const key = String(row.nodeId);
  if (!byCategory[category].has(key)) {
    byCategory[category].set(key, { count: 0, descs: new Set() });
  }

  const bucket = byCategory[category].get(key);
  bucket.count += 1;
  if (row.nodeDescription) bucket.descs.add(String(row.nodeDescription));
}

const out = Object.entries(byCategory)
  .map(([category, map]) => ({
    category,
    nodes: Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([nodeId, value]) => ({
        nodeId,
        count: value.count,
        descriptions: Array.from(value.descs).slice(0, 3),
      })),
  }))
  .sort((a, b) => a.category.localeCompare(b.category));

console.log(JSON.stringify(out, null, 2));

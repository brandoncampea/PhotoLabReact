/**
 * syncWhccProductOptions.mjs
 *
 * For every product linked to a super price list:
 *   1. Match it against whcc_all_products_full.csv by name+size scoring
 *   2. Store the WHCC Product Code as whccProductUID in products.options
 *   3. If base_cost on the super_price_list_item is 0/null, fill it from the CSV Price
 *      (also updates product_sizes.cost and products.cost/price if they are also 0/null)
 *
 * Usage:
 *   node scripts/syncWhccProductOptions.mjs [--dry-run]
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const db = require('../server/mssql.cjs');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(ROOT, '..', 'whcc_all_products_full.csv');

// ─── CSV Loading ─────────────────────────────────────────────────────────────

function loadCsv(path) {
  const text = fs.readFileSync(path, 'utf8');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Handle possible quoted fields with commas inside
    const cols = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim(); });
    return row;
  });
}

// ─── Name Normalisation ───────────────────────────────────────────────────────

const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const extractSize = s => {
  const m = String(s || '').match(/(\d+(?:\.\d+)?(?:up|oz|x\d+(?:\.\d+)?)(?:x\d+(?:\.\d+)?)?)/i);
  return m ? m[1].toLowerCase() : '';
};

const tokenize = s =>
  normalize(s)
    .split(' ')
    .filter(t => t.length > 1 && !['and', 'the', 'for', 'with', 'print', 'from', 'in'].includes(t));

// ─── Derive the expected WHCC sheet name from a product name ─────────────────

function expectedSheet(productName) {
  const n = productName.toLowerCase();
  if (/^metal print/.test(n)) return 'metal prints';
  if (/^wood print/.test(n)) return 'wood prints';
  if (/^acrylic print/.test(n) || /^acrylic block/.test(n)) return 'acrylic';
  if (/^fine art canvas/.test(n) || /^float wrap/.test(n)) return 'gallery wraps';
  if (/^fine art print/.test(n)) return 'fine art prints';
  if (/^framed print/.test(n)) return 'framed prints';
  if (/^canvas/.test(n)) return 'canvas';
  if (/^photo print/.test(n) || /^mounted display/.test(n)) return 'photo';
  if (/\bbook\b/.test(n) || /\balbum\b/.test(n) || /\blayflat\b/.test(n) || /\bhardcover\b/.test(n) || /\bsoftcover\b/.test(n)) return 'press printed books';
  if (/\bcard\b/.test(n)) return 'press printed cards';
  return null;
}

// ─── Score a CSV row against a DB product+size ───────────────────────────────

function scoreRow(csvRow, productName, sizeName) {
  const csvName = csvRow['Product Name/Size'] || '';
  const csvSheet = (csvRow['Sheet'] || '').toLowerCase();
  const csvNorm = normalize(csvName);
  const csvSize = extractSize(csvName);

  // Combine product name + size for full-name comparison
  const fullName = sizeName
    ? normalize(productName).replace(normalize(sizeName), '').trim() + ' ' + sizeName
    : normalize(productName);
  const fullNorm = normalize(fullName.trim());
  const sizeNorm = normalize(sizeName || '');

  let score = 0;

  // Exact full-name match (highest priority)
  if (csvNorm === fullNorm || csvNorm === normalize(productName)) score += 100;

  // Sheet/category affinity — reward matching category, penalise clearly wrong one
  const expSheet = expectedSheet(productName);
  if (expSheet) {
    if (csvSheet.includes(expSheet) || expSheet.includes(csvSheet)) score += 40;
    else score -= 50; // wrong product type — strongly penalise
  }

  // Size match (heavily weighted — prevents cross-size collisions)
  if (sizeNorm && csvSize && csvSize === sizeNorm) score += 50;
  else if (sizeNorm && csvNorm.includes(sizeNorm)) score += 30;
  else if (sizeNorm && sizeNorm !== '' && !csvNorm.includes(sizeNorm)) score -= 60; // penalise wrong size

  // Token overlap on base name (without size)
  const baseProductNorm = normalize(productName).replace(sizeNorm, '').trim();
  const pTokens = new Set(tokenize(baseProductNorm));
  const csvTokens = new Set(tokenize(csvNorm));
  let overlap = 0;
  pTokens.forEach(t => { if (csvTokens.has(t)) overlap++; });
  score += overlap * 10;

  // CSV name contains the DB product name base
  if (csvNorm.includes(normalize(productName).replace(sizeNorm, '').trim())) score += 15;

  return score;
}

// ─── Find best matching CSV row ───────────────────────────────────────────────

function findBestCsvMatch(csvRows, productName, sizeName) {
  const csvRowsWithUID = csvRows.filter(r => /^\d+$/.test(r['Product Code']));
  let best = null;
  let bestScore = 40; // minimum threshold — must pass sheet affinity + size

  for (const row of csvRowsWithUID) {
    const s = scoreRow(row, productName, sizeName);
    if (s > bestScore) {
      bestScore = s;
      best = row;
    }
  }
  return best;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`[syncWhccOptions] Loading CSV from ${CSV_PATH}`);
const csvRows = loadCsv(CSV_PATH);
const validCsvRows = csvRows.filter(r => /^\d+$/.test(r['Product Code']));
console.log(`[syncWhccOptions] ${validCsvRows.length} CSV rows with numeric Product Code`);

console.log(`[syncWhccOptions] Fetching super price list items from DB...`);
const items = await db.queryRows(`
  SELECT
    spi.id          AS spi_id,
    spi.super_price_list_id,
    spi.product_size_id,
    spi.base_cost,
    ps.id           AS ps_id,
    ps.size_name,
    ps.cost         AS ps_cost,
    p.id            AS product_id,
    p.name          AS product_name,
    p.category,
    p.cost          AS p_cost,
    p.price         AS p_price,
    p.options
  FROM super_price_list_items spi
  JOIN product_sizes ps ON ps.id = spi.product_size_id
  JOIN products p ON ps.product_id = p.id
  ORDER BY spi.super_price_list_id, p.name, ps.size_name
`);

console.log(`[syncWhccOptions] Processing ${items.length} items...`);

let matched = 0, unmatched = 0, costFilled = 0, uidFilled = 0, skipped = 0;

// Deduplicate product-level updates (same product_id may appear in multiple sizes)
const productUpdated = new Set();

for (const item of items) {
  const existingOptions = (() => {
    try { return JSON.parse(item.options || '{}'); } catch { return {}; }
  })();

  const alreadyHasUID = !!existingOptions.whccProductUID;
  const costMissing = !item.base_cost || Number(item.base_cost) === 0;

  // Skip if both are already fine
  if (alreadyHasUID && !costMissing) {
    skipped++;
    continue;
  }

  const csvMatch = findBestCsvMatch(validCsvRows, item.product_name, item.size_name);

  if (!csvMatch) {
    unmatched++;
    if (!alreadyHasUID) {
      console.log(`  [NO-MATCH] ${item.category}/${item.product_name} | size:${item.size_name}`);
    }
    continue;
  }

  matched++;
  const whccUID = Number(csvMatch['Product Code']);
  const csvPrice = parseFloat(csvMatch['Price']);

  // ── Update products.options with whccProductUID ──────────────────────────
  if (!alreadyHasUID && !productUpdated.has(item.product_id)) {
    const newOptions = JSON.stringify({
      ...existingOptions,
      whccProductUID: whccUID,
    });

    if (!DRY_RUN) {
      await db.query('UPDATE products SET options = @p1 WHERE id = @p2', [newOptions, item.product_id]);
    }
    productUpdated.add(item.product_id);
    uidFilled++;
    console.log(`  [UID] ${item.product_name} (id:${item.product_id}) → whccProductUID=${whccUID} (CSV: "${csvMatch['Product Name/Size']}")`);
  }

  // ── Fill missing base_cost on super_price_list_item ──────────────────────
  if (costMissing && !isNaN(csvPrice) && csvPrice > 0) {
    if (!DRY_RUN) {
      await db.query(
        'UPDATE super_price_list_items SET base_cost = @p1 WHERE id = @p2',
        [csvPrice, item.spi_id]
      );
      // Also update product_sizes.cost if it's also 0/null
      if (!item.ps_cost || Number(item.ps_cost) === 0) {
        await db.query(
          'UPDATE product_sizes SET cost = @p1, price = @p2 WHERE id = @p3',
          [csvPrice, csvPrice, item.ps_id]
        );
      }
      // Also update products.cost/price if they're 0/null (and not already updated this run)
      if (!productUpdated.has(`cost-${item.product_id}`)) {
        if (!item.p_cost || Number(item.p_cost) === 0) {
          await db.query(
            'UPDATE products SET cost = @p1, price = @p2 WHERE id = @p3',
            [csvPrice, csvPrice, item.product_id]
          );
          productUpdated.add(`cost-${item.product_id}`);
        }
      }
    }
    costFilled++;
    console.log(`  [COST] ${item.product_name} | size:${item.size_name} | spi_id:${item.spi_id} → base_cost=${csvPrice}`);
  }
}

console.log(`
========================================
 syncWhccProductOptions Summary
========================================
 Mode          : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}
 Items scanned : ${items.length}
 CSV matched   : ${matched}
 CSV unmatched : ${unmatched}
 UIDs written  : ${uidFilled} products
 Costs filled  : ${costFilled} price list items
 Already OK    : ${skipped}
========================================
`);

process.exit(0);

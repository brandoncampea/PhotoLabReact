import mssql from '../mssql.cjs';

const { queryRows, queryRow, query } = mssql;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitArgIndex = args.indexOf('--limit');
const limit = limitArgIndex >= 0 ? Math.max(1, Number(args[limitArgIndex + 1]) || 20) : 20;

const calcCte = `
WITH order_item_totals AS (
  SELECT
    oi.order_id,
    ROUND(SUM(ISNULL(oi.price, 0) * ISNULL(oi.quantity, 0)), 2) AS item_subtotal,
    COUNT(1) AS total_item_count,
    SUM(CASE WHEN (
      NULLIF(LTRIM(RTRIM(CAST(oi.digital_download_scope AS NVARCHAR(MAX)))), '') IS NOT NULL
      OR LOWER(COALESCE(p.category, '')) LIKE '%digital%'
      OR LOWER(COALESCE(p.name, '')) LIKE '%digital%'
    ) THEN 1 ELSE 0 END) AS digital_item_count
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  GROUP BY oi.order_id
),
calc AS (
  SELECT
    o.id,
    ROUND(ISNULL(o.subtotal, 0), 2) AS current_subtotal,
    ROUND(ISNULL(o.shipping_cost, 0), 2) AS current_shipping,
    ROUND(ISNULL(o.tax_amount, 0), 2) AS current_tax,
    ROUND(ISNULL(o.total, 0), 2) AS current_total,
    ROUND(ISNULL(t.item_subtotal, 0), 2) AS expected_subtotal,
    CASE
      WHEN ISNULL(t.total_item_count, 0) > 0 AND ISNULL(t.digital_item_count, 0) = ISNULL(t.total_item_count, 0)
        THEN 0
      ELSE ROUND(ISNULL(o.shipping_cost, 0), 2)
    END AS expected_shipping,
    ROUND(ISNULL(o.tax_amount, 0), 2) AS expected_tax,
    CASE
      WHEN NULLIF(LTRIM(RTRIM(ISNULL(o.discount_code, ''))), '') IS NULL THEN 0
      ELSE CASE
        WHEN ROUND((ISNULL(o.subtotal, 0) + ISNULL(o.tax_amount, 0)) - ISNULL(o.total, 0), 2) > 0
          THEN ROUND((ISNULL(o.subtotal, 0) + ISNULL(o.tax_amount, 0)) - ISNULL(o.total, 0), 2)
        WHEN ROUND((ISNULL(o.subtotal, 0) + ISNULL(o.tax_amount, 0) + ISNULL(o.shipping_cost, 0)) - ISNULL(o.total, 0), 2) > 0
          THEN ROUND((ISNULL(o.subtotal, 0) + ISNULL(o.tax_amount, 0) + ISNULL(o.shipping_cost, 0)) - ISNULL(o.total, 0), 2)
        ELSE 0
      END
    END AS inferred_discount
  FROM orders o
  LEFT JOIN order_item_totals t ON t.order_id = o.id
  WHERE LOWER(ISNULL(o.status, '')) NOT IN ('cancelled', 'refunded')
),
updates AS (
  SELECT
    id,
    current_subtotal,
    current_shipping,
    current_tax,
    current_total,
    expected_subtotal,
    expected_shipping,
    expected_tax,
    ROUND(expected_subtotal + expected_shipping + expected_tax - inferred_discount, 2) AS expected_total
  FROM calc
)
`;

const previewSql = `
${calcCte}
SELECT TOP (${limit})
  id,
  current_subtotal,
  expected_subtotal,
  current_shipping,
  expected_shipping,
  current_tax,
  expected_tax,
  current_total,
  expected_total
FROM updates
WHERE ABS(current_subtotal - expected_subtotal) >= 0.01
   OR ABS(current_shipping - expected_shipping) >= 0.01
   OR ABS(current_total - expected_total) >= 0.01
ORDER BY id DESC;
`;

const countSql = `
${calcCte}
SELECT COUNT(1) AS count
FROM updates
WHERE ABS(current_subtotal - expected_subtotal) >= 0.01
   OR ABS(current_shipping - expected_shipping) >= 0.01
   OR ABS(current_total - expected_total) >= 0.01;
`;

const updateSql = `
${calcCte}
UPDATE o
SET
  subtotal = u.expected_subtotal,
  shipping_cost = u.expected_shipping,
  tax_amount = u.expected_tax,
  total = u.expected_total
FROM orders o
INNER JOIN updates u ON u.id = o.id
WHERE ABS(u.current_subtotal - u.expected_subtotal) >= 0.01
   OR ABS(u.current_shipping - u.expected_shipping) >= 0.01
   OR ABS(u.current_total - u.expected_total) >= 0.01;
`;

const main = async () => {
  const before = Number((await queryRow(countSql))?.count || 0);
  const sample = await queryRows(previewSql);

  console.log(`Orders needing snapshot backfill: ${before}`);
  if (sample.length) {
    console.log('Sample rows (current -> expected):');
    for (const row of sample) {
      console.log(`#${row.id} subtotal ${row.current_subtotal} -> ${row.expected_subtotal}, shipping ${row.current_shipping} -> ${row.expected_shipping}, total ${row.current_total} -> ${row.expected_total}`);
    }
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to persist changes.');
    return;
  }

  await query(updateSql);

  const after = Number((await queryRow(countSql))?.count || 0);
  console.log(`Backfill complete. Remaining mismatches: ${after}`);
};

main().catch((error) => {
  console.error('Backfill failed:', error?.message || error);
  process.exit(1);
});

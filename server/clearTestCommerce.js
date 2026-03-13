import { queryRow, queryRows, query, tableExists } from './mssql.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const inClause = (ids, startIndex = 1) => {
  const placeholders = ids.map((_, i) => `$${startIndex + i}`);
  return `(${placeholders.join(', ')})`;
};

const toNumberIds = (rows) => rows.map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0);

const logCount = (label, count) => {
  console.log(`${label}: ${count}`);
};

const deleteByIds = async (table, idColumn, ids, label) => {
  if (!ids.length) {
    logCount(label, 0);
    return;
  }
  const clause = inClause(ids);
  if (!apply) {
    logCount(label, ids.length);
    return;
  }
  await query(`DELETE FROM ${table} WHERE ${idColumn} IN ${clause}`, ids);
  logCount(label, ids.length);
};

const main = async () => {
  console.log(apply ? '🧹 Applying test data cleanup...' : '🔎 Dry run: test data cleanup preview');

  const studioRows = await queryRows(
    `SELECT id FROM studios
     WHERE email LIKE 'seed-studio-%@example.com'
        OR name LIKE 'Seed Studio %'`,
    []
  );
  const studioIds = toNumberIds(studioRows);

  const userRows = await queryRows(
    `SELECT id FROM users
     WHERE email LIKE 'seed-studio-admin-%@example.com'
        OR email LIKE 'seed-customer-%@example.com'
        OR email LIKE 'seed-studio-%@example.com'`,
    []
  );
  const userIds = toNumberIds(userRows);

  let albumIds = [];
  if (studioIds.length) {
    const clause = inClause(studioIds);
    albumIds = toNumberIds(
      await queryRows(
        `SELECT id FROM albums
         WHERE studio_id IN ${clause}
            OR name LIKE 'Seed Studio % Album %'`,
        studioIds
      )
    );
  } else {
    albumIds = toNumberIds(
      await queryRows(`SELECT id FROM albums WHERE name LIKE 'Seed Studio % Album %'`, [])
    );
  }

  let photoIds = [];
  if (albumIds.length) {
    const clause = inClause(albumIds);
    photoIds = toNumberIds(
      await queryRows(
        `SELECT id FROM photos
         WHERE album_id IN ${clause}
            OR file_name LIKE 'seed-s%-a%-p%.jpg'`,
        albumIds
      )
    );
  } else {
    photoIds = toNumberIds(
      await queryRows(`SELECT id FROM photos WHERE file_name LIKE 'seed-s%-a%-p%.jpg'`, [])
    );
  }

  let orderIds = [];
  const orderIdSet = new Set();

  if (userIds.length) {
    const clause = inClause(userIds);
    const rows = await queryRows(`SELECT id FROM orders WHERE user_id IN ${clause}`, userIds);
    rows.forEach((r) => orderIdSet.add(Number(r.id)));
  }

  if (photoIds.length) {
    const clause = inClause(photoIds);
    const rows = await queryRows(`SELECT DISTINCT order_id as id FROM order_items WHERE photo_id IN ${clause}`, photoIds);
    rows.forEach((r) => orderIdSet.add(Number(r.id)));
  }

  orderIds = Array.from(orderIdSet).filter((id) => Number.isInteger(id) && id > 0);

  const seedProduct = await queryRow(`SELECT TOP 1 id FROM products WHERE name = 'Seed Test Print'`, []);
  const seedProductId = Number(seedProduct?.id || 0) || null;
  let seedProductSizeIds = [];
  if (seedProductId) {
    seedProductSizeIds = toNumberIds(await queryRows('SELECT id FROM product_sizes WHERE product_id = $1', [seedProductId]));
  }

  console.log('--- Target rows ---');
  logCount('Studios', studioIds.length);
  logCount('Users', userIds.length);
  logCount('Albums', albumIds.length);
  logCount('Photos', photoIds.length);
  logCount('Orders', orderIds.length);
  logCount('Seed product_sizes', seedProductSizeIds.length);
  logCount('Seed products', seedProductId ? 1 : 0);

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to delete these rows.');
    process.exit(0);
  }

  // Delete in FK-safe order
  if (orderIds.length) {
    if (await tableExists('studio_invoice_items')) {
      const clause = inClause(orderIds);
      await query(`DELETE FROM studio_invoice_items WHERE order_id IN ${clause}`, orderIds);
    }

    const clause = inClause(orderIds);
    await query(`DELETE FROM order_items WHERE order_id IN ${clause}`, orderIds);
    await query(`DELETE FROM orders WHERE id IN ${clause}`, orderIds);
    logCount('Deleted orders', orderIds.length);
  } else {
    logCount('Deleted orders', 0);
  }

  if (userIds.length && await tableExists('user_cart')) {
    const clause = inClause(userIds);
    await query(`DELETE FROM user_cart WHERE user_id IN ${clause}`, userIds);
  }

  await deleteByIds('photos', 'id', photoIds, 'Deleted photos');
  await deleteByIds('albums', 'id', albumIds, 'Deleted albums');

  // Delete seeded users first (studios table FK from users has no cascade)
  if (userIds.length) {
    const clause = inClause(userIds);
    await query(`DELETE FROM users WHERE id IN ${clause}`, userIds);
    logCount('Deleted users', userIds.length);
  } else {
    logCount('Deleted users', 0);
  }

  if (studioIds.length) {
    if (await tableExists('studio_profit_payouts')) {
      const clause = inClause(studioIds);
      await query(`DELETE FROM studio_profit_payouts WHERE studio_id IN ${clause}`, studioIds);
    }
    if (await tableExists('studio_invoices')) {
      const clause = inClause(studioIds);
      await query(`DELETE FROM studio_invoices WHERE studio_id IN ${clause}`, studioIds);
    }

    const clause = inClause(studioIds);
    await query(`DELETE FROM studios WHERE id IN ${clause}`, studioIds);
    logCount('Deleted studios', studioIds.length);
  } else {
    logCount('Deleted studios', 0);
  }

  if (seedProductSizeIds.length) {
    const clause = inClause(seedProductSizeIds);
    await query(`DELETE FROM product_sizes WHERE id IN ${clause}`, seedProductSizeIds);
    logCount('Deleted seed product_sizes', seedProductSizeIds.length);
  } else {
    logCount('Deleted seed product_sizes', 0);
  }

  if (seedProductId) {
    await query('DELETE FROM products WHERE id = $1', [seedProductId]);
    logCount('Deleted seed products', 1);
  } else {
    logCount('Deleted seed products', 0);
  }

  console.log('✅ Test commerce cleanup completed.');
  process.exit(0);
};

main().catch((error) => {
  console.error('❌ Cleanup failed:', error?.message || error);
  process.exit(1);
});

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;
    await query(`
      IF COL_LENGTH('order_items', 'package_group_id') IS NULL
        ALTER TABLE order_items ADD package_group_id NVARCHAR(128) NULL;
      IF COL_LENGTH('order_items', 'package_price') IS NULL
        ALTER TABLE order_items ADD package_price FLOAT NULL;
      IF COL_LENGTH('order_items', 'package_name') IS NULL
        ALTER TABLE order_items ADD package_name NVARCHAR(256) NULL;
    `);
    console.log('[startup] Ensured package_group_id, package_price, package_name columns exist on order_items');
  } catch (err) {
    console.error('[startup] Failed to ensure package order columns:', err);
  }
})();

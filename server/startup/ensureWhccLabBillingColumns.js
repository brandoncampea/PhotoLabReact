// Run this script at server startup to ensure WHCC billing columns exist on orders

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;
    await query(`
      IF COL_LENGTH('orders', 'whcc_lab_subtotal') IS NULL
        ALTER TABLE orders ADD whcc_lab_subtotal FLOAT NULL;
      IF COL_LENGTH('orders', 'whcc_lab_tax') IS NULL
        ALTER TABLE orders ADD whcc_lab_tax FLOAT NULL;
      IF COL_LENGTH('orders', 'whcc_lab_total') IS NULL
        ALTER TABLE orders ADD whcc_lab_total FLOAT NULL;
    `);
    console.log('[startup] Ensured WHCC lab billing columns exist on orders');
  } catch (err) {
    console.error('[startup] Failed to ensure WHCC lab billing columns:', err);
  }
})();

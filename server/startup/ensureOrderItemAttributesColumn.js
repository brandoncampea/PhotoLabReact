// Ensure 'attributes' column exists on order_items table at backend startup
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;
    await query(`
      IF COL_LENGTH('order_items', 'attributes') IS NULL
        ALTER TABLE order_items ADD attributes NVARCHAR(MAX) NULL;
    `);
    console.log('[startup] Ensured attributes column exists on order_items');
  } catch (err) {
    console.error('[startup] Failed to ensure attributes column:', err);
  }
})();

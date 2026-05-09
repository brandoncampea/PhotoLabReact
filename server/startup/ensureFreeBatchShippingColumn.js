// Run this script at server startup to ensure the can_receive_free_batch_shipping column exists on studios

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;
    await query(`
      IF COL_LENGTH('studios', 'can_receive_free_batch_shipping') IS NULL
        ALTER TABLE studios ADD can_receive_free_batch_shipping BIT DEFAULT 0;
    `);
    console.log('[startup] Ensured can_receive_free_batch_shipping column exists on studios');
  } catch (err) {
    console.error('[startup] Failed to ensure can_receive_free_batch_shipping column:', err);
  }
})();

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;
    await query(`
      IF COL_LENGTH('users', 'receive_order_notifications') IS NULL
        ALTER TABLE users ADD receive_order_notifications BIT NOT NULL DEFAULT 1;
    `);
    console.log('[startup] Ensured receive_order_notifications column exists on users');
  } catch (err) {
    console.error('[startup] Failed to ensure receive_order_notifications column on users:', err);
  }
})();

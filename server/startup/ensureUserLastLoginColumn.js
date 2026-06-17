import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;
    await query(`
      IF COL_LENGTH('users', 'last_login_at') IS NULL
        ALTER TABLE users ADD last_login_at DATETIME NULL;
    `);
    console.log('[startup] Ensured last_login_at column exists on users');
  } catch (err) {
    console.error('[startup] Failed to ensure last_login_at column on users:', err);
  }
})();

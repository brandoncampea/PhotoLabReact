// Ensure approval and preview columns exist on orders and batches tables
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;
    // Orders table
    await query(`
      IF COL_LENGTH('orders', 'approval_status') IS NULL
        ALTER TABLE orders ADD approval_status NVARCHAR(32) DEFAULT 'pending';
      IF COL_LENGTH('orders', 'preview_payload') IS NULL
        ALTER TABLE orders ADD preview_payload NVARCHAR(MAX) NULL;
      IF COL_LENGTH('orders', 'approved_at') IS NULL
        ALTER TABLE orders ADD approved_at DATETIME2 NULL;
    `);
    // Batches table (if exists)
    await query(`
      IF OBJECT_ID('batches', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('batches', 'approval_status') IS NULL
          ALTER TABLE batches ADD approval_status NVARCHAR(32) DEFAULT 'pending';
        IF COL_LENGTH('batches', 'preview_payload') IS NULL
          ALTER TABLE batches ADD preview_payload NVARCHAR(MAX) NULL;
        IF COL_LENGTH('batches', 'approved_at') IS NULL
          ALTER TABLE batches ADD approved_at DATETIME2 NULL;
      END
    `);
    console.log('[startup] Ensured approval and preview columns exist on orders and batches');
  } catch (err) {
    console.error('[startup] Failed to ensure approval/preview columns:', err);
  }
})();

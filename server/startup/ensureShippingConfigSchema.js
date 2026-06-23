import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'shipping_config')
      BEGIN
        CREATE TABLE shipping_config (
          id INT PRIMARY KEY,
          batch_deadline NVARCHAR(255) DEFAULT '2099-12-31T23:59:59Z',
          direct_shipping_charge FLOAT DEFAULT 10.00,
          is_active BIT DEFAULT 1,
          batch_shipping_address NVARCHAR(MAX),
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF COL_LENGTH('shipping_config', 'batch_shipping_address') IS NULL
        ALTER TABLE shipping_config ADD batch_shipping_address NVARCHAR(MAX) NULL
    `);

    await query(`
      IF COL_LENGTH('shipping_config', 'direct_pricing_mode') IS NULL
        ALTER TABLE shipping_config ADD direct_pricing_mode NVARCHAR(32) DEFAULT 'flat_fee'
    `);

    await query(`
      IF COL_LENGTH('shipping_config', 'direct_flat_fee') IS NULL
        ALTER TABLE shipping_config ADD direct_flat_fee FLOAT NULL
    `);

    await query(`
      IF COL_LENGTH('shipping_config', 'batch_shipping_note') IS NULL
        ALTER TABLE shipping_config ADD batch_shipping_note NVARCHAR(MAX) NULL
    `);

    await query(`
      IF COL_LENGTH('shipping_config', 'direct_handling_fee') IS NULL
        ALTER TABLE shipping_config ADD direct_handling_fee FLOAT NOT NULL DEFAULT 0
    `);

    await query(`
      IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_shipping_config_id')
        ALTER TABLE shipping_config DROP CONSTRAINT ck_shipping_config_id
    `);

    console.log('[startup] Shipping config schema migrations complete');
  } catch (err) {
    console.error('[startup] Failed to run shipping config schema migrations:', err);
  }
})();

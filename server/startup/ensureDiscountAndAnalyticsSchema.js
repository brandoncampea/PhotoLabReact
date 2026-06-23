import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query, tableExists } = mssql;

    // ── analytics ──────────────────────────────────────────────
    const analyticsExists = await tableExists('analytics');
    if (!analyticsExists) {
      await query(`
        CREATE TABLE analytics (
          id INT IDENTITY(1,1) PRIMARY KEY,
          event_type NVARCHAR(100) NOT NULL,
          event_data NVARCHAR(MAX) NULL,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // ── discount_codes ─────────────────────────────────────────
    const dcExists = await tableExists('discount_codes');
    if (!dcExists) {
      await query(`
        CREATE TABLE discount_codes (
          id INT IDENTITY(1,1) PRIMARY KEY,
          code NVARCHAR(255) UNIQUE NOT NULL,
          description NVARCHAR(MAX) NULL,
          discount_type NVARCHAR(50) NOT NULL,
          discount_value FLOAT NOT NULL DEFAULT 0,
          application_type NVARCHAR(50) NOT NULL DEFAULT 'entire-order',
          bundle_quantity INT NULL,
          bundle_price FLOAT NULL,
          applicable_category_names NVARCHAR(MAX) NULL,
          applicable_album_ids NVARCHAR(MAX) NULL,
          start_date DATETIME2 NULL,
          expiration_date DATETIME2 NULL,
          min_subtotal FLOAT NULL,
          is_one_time_use BIT NOT NULL DEFAULT 0,
          usage_count INT NOT NULL DEFAULT 0,
          max_usages INT NULL,
          per_customer_limit INT NULL,
          first_order_only BIT NOT NULL DEFAULT 0,
          is_active BIT NOT NULL DEFAULT 1,
          studio_id INT NULL,
          validation_message NVARCHAR(500) NULL,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='application_type') ALTER TABLE discount_codes ADD application_type NVARCHAR(50) NOT NULL DEFAULT 'entire-order'`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='bundle_quantity') ALTER TABLE discount_codes ADD bundle_quantity INT NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='bundle_price') ALTER TABLE discount_codes ADD bundle_price FLOAT NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='applicable_category_names') ALTER TABLE discount_codes ADD applicable_category_names NVARCHAR(MAX) NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='applicable_album_ids') ALTER TABLE discount_codes ADD applicable_album_ids NVARCHAR(MAX) NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='start_date') ALTER TABLE discount_codes ADD start_date DATETIME2 NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='min_subtotal') ALTER TABLE discount_codes ADD min_subtotal FLOAT NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='per_customer_limit') ALTER TABLE discount_codes ADD per_customer_limit INT NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='first_order_only') ALTER TABLE discount_codes ADD first_order_only BIT NOT NULL DEFAULT 0`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='studio_id') ALTER TABLE discount_codes ADD studio_id INT NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='validation_message') ALTER TABLE discount_codes ADD validation_message NVARCHAR(500) NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='discount_codes' AND COLUMN_NAME='updated_at') ALTER TABLE discount_codes ADD updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP`);
    }

    const dcpExists = await tableExists('discount_code_products');
    if (!dcpExists) {
      await query(`
        CREATE TABLE discount_code_products (
          discount_code_id INT NOT NULL FOREIGN KEY REFERENCES discount_codes(id) ON DELETE CASCADE,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE CASCADE,
          CONSTRAINT pk_discount_code_products PRIMARY KEY (discount_code_id, product_id)
        )
      `);
    }

    console.log('[startup] Discount codes and analytics schema migrations complete');
  } catch (err) {
    console.error('[startup] Failed to run discount/analytics schema migrations:', err);
  }
})();


const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = require('mssql');
const bcrypt = require('bcryptjs');

  const rawConnectionString = (process.env.MSSQL_CONNECTION_STRING || '').trim();
  const hasValidConnectionString = /(?:^|;)\s*(server|data source)\s*=\s*/i.test(rawConnectionString);

  const parseConnectionString = (connectionString) => {
    const pairs = String(connectionString)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part.trim().toLowerCase(), ''];
        return [part.slice(0, idx).trim().toLowerCase(), part.slice(idx + 1).trim()];
      });

    const map = new Map(pairs);
    const serverRaw = map.get('server') || map.get('data source') || '';
    const serverWithoutProtocol = serverRaw.replace(/^tcp:/i, '').trim();
    const [serverHost, serverPortRaw] = serverWithoutProtocol.split(',');
    const port = Number(serverPortRaw || map.get('port') || 1433);

    const database = map.get('initial catalog') || map.get('database') || '';
    const user = map.get('user id') || map.get('uid') || map.get('user') || '';
    const password = map.get('password') || map.get('pwd') || '';
    const encrypt = map.has('encrypt') ? String(map.get('encrypt')).toLowerCase() !== 'false' : process.env.MSSQL_ENCRYPT !== 'false';
    const trustServerCertificate = map.has('trustservercertificate')
      ? String(map.get('trustservercertificate')).toLowerCase() === 'true'
      : process.env.MSSQL_TRUST_CERT === 'true';

    return {
      user,
      password,
      server: serverHost,
      port,
      database,
      options: {
        encrypt,
        trustServerCertificate,
        connectionTimeout: 5000,
        requestTimeout: 10000,
      },
    };
  };

  console.log('MSSQL Config Debug:');
  console.log('- MSSQL_CONNECTION_STRING present:', !!rawConnectionString);
  console.log('- MSSQL_CONNECTION_STRING valid:', hasValidConnectionString);
  console.log('- DB_HOST:', process.env.DB_HOST);
  console.log('- DB_NAME:', process.env.DB_NAME);
  console.log('- DB_USER:', process.env.DB_USER ? '***set***' : 'not set');
  console.log('- DB_PASSWORD:', process.env.DB_PASSWORD ? '***set***' : 'not set');

  const hasDbParts = !!(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD);

  const mssqlConfig = hasValidConnectionString
    ? parseConnectionString(rawConnectionString)
    : hasDbParts
    ? {
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || 'yourStrong(!)Password',
        server: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 1433),
        database: process.env.DB_NAME || 'photolab',
        options: {
          encrypt: process.env.MSSQL_ENCRYPT !== 'false',
          trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
          connectionTimeout: 5000, // 5 second connection timeout
          requestTimeout: 10000, // 10 second request timeout
        },
      }
    : {
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || 'yourStrong(!)Password',
        server: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 1433),
        database: process.env.DB_NAME || 'photolab',
        options: {
          encrypt: process.env.MSSQL_ENCRYPT !== 'false',
          trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
          connectionTimeout: 5000, // 5 second connection timeout
          requestTimeout: 10000, // 10 second request timeout
        },
      };

  if (rawConnectionString && !hasValidConnectionString) {
    console.warn('MSSQL_CONNECTION_STRING is set but appears invalid. Falling back to DB_HOST/DB_PORT/DB_NAME/DB_USER.');
  }

  if (hasValidConnectionString && hasDbParts) {
    console.log('Using MSSQL_CONNECTION_STRING (DB_* values are ignored because connection string takes precedence).');
  }

  console.log('Final mssqlConfig:', {
    ...mssqlConfig,
    password: mssqlConfig.password ? '***' : undefined,
    connectionString: mssqlConfig.connectionString ? '***set***' : undefined
  });

  let poolPromise = null;

  const getPoolPromise = () => {
    if (!poolPromise) {
      const pool = new sql.ConnectionPool(mssqlConfig);
      poolPromise = pool.connect().catch((error) => {
        poolPromise = null;
        throw error;
      });
    }
    return poolPromise;
  };


module.exports = {
  query,
  queryRow,
  queryRows,
  tableExists,
  columnExists,
  transaction,
  initializeDatabase,
  poolPromise: getPoolPromise(),
};

function transformSql(text) {
  let sqlText = text;

  if (/RETURNING\s+id/i.test(sqlText)) {
    sqlText = sqlText.replace(/RETURNING\s+id\s*;?\s*$/i, '');
    sqlText = sqlText.replace(
      /INSERT\s+INTO\s+([^\(]+\([^\)]*\))\s*VALUES/i,
      'INSERT INTO $1 OUTPUT INSERTED.id VALUES'
    );
  }

  sqlText = sqlText.replace(/\$(\d+)/g, '@p$1');
  return sqlText;
}

function normalizeResult(result) {
  return {
    rows: result.recordset || [],
    rowCount: result.rowsAffected?.[0] || 0,
  };
}
// This file exists only to prevent ESM import errors. Use mssql.cjs for all database logic.
// If you see this error, update your import to:
//   import mssql from './mssql.cjs';
// Or, for CommonJS:
//   const mssql = require('./mssql.cjs');

throw new Error('Do not import mssql.mjs. Use mssql.cjs instead.');
          stripe_fee_amount FLOAT DEFAULT 0,
          customer_receipt_sent_at DATETIME2,
          studio_receipt_sent_at DATETIME2
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'order_items')
      BEGIN
        CREATE TABLE order_items (
          id INT IDENTITY(1,1) PRIMARY KEY,
          order_id INT NOT NULL FOREIGN KEY REFERENCES orders(id) ON DELETE CASCADE,
          photo_id INT NOT NULL FOREIGN KEY REFERENCES photos(id),
          photo_ids NVARCHAR(MAX),
          product_id INT NOT NULL,
          quantity INT DEFAULT 1,
          price FLOAT NOT NULL,
          crop_data NVARCHAR(MAX)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'products')
      BEGIN
        CREATE TABLE products (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) NOT NULL,
          category NVARCHAR(255) NOT NULL,
          price FLOAT NOT NULL,
          description NVARCHAR(MAX),
          cost FLOAT,
          options NVARCHAR(MAX)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'price_lists')
      BEGIN
        CREATE TABLE price_lists (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) NOT NULL UNIQUE,
          description NVARCHAR(MAX),
          is_default BIT DEFAULT 0,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'price_list_products')
      BEGIN
        CREATE TABLE price_list_products (
          id INT IDENTITY(1,1) PRIMARY KEY,
          price_list_id INT NOT NULL FOREIGN KEY REFERENCES price_lists(id) ON DELETE CASCADE,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE CASCADE,
          CONSTRAINT uq_price_list_products UNIQUE (price_list_id, product_id)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_price_list_offerings')
      BEGIN
        CREATE TABLE studio_price_list_offerings (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          price_list_id INT NOT NULL FOREIGN KEY REFERENCES price_lists(id) ON DELETE CASCADE,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE CASCADE,
          is_offered BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_studio_price_list_offerings UNIQUE (studio_id, price_list_id, product_id)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'product_sizes')
      BEGIN
        CREATE TABLE product_sizes (
          id INT IDENTITY(1,1) PRIMARY KEY,
          price_list_id INT NOT NULL FOREIGN KEY REFERENCES price_lists(id) ON DELETE CASCADE,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE CASCADE,
          size_name NVARCHAR(255) NOT NULL,
          price FLOAT NOT NULL,
          cost FLOAT,
          CONSTRAINT uq_product_sizes UNIQUE (price_list_id, product_id, size_name)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_price_list_size_overrides')
      BEGIN
        CREATE TABLE studio_price_list_size_overrides (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          price_list_id INT NOT NULL FOREIGN KEY REFERENCES price_lists(id) ON DELETE NO ACTION,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE NO ACTION,
          product_size_id INT NOT NULL FOREIGN KEY REFERENCES product_sizes(id) ON DELETE NO ACTION,
          price FLOAT NOT NULL,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_studio_price_list_size_overrides UNIQUE (studio_id, price_list_id, product_size_id)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'packages')
      BEGIN
        CREATE TABLE packages (
          id INT IDENTITY(1,1) PRIMARY KEY,
          price_list_id INT NOT NULL FOREIGN KEY REFERENCES price_lists(id) ON DELETE CASCADE,
          name NVARCHAR(255) NOT NULL,
          description NVARCHAR(MAX),
          package_price FLOAT NOT NULL,
          is_active BIT DEFAULT 1,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'package_items')
      BEGIN
        CREATE TABLE package_items (
          id INT IDENTITY(1,1) PRIMARY KEY,
          package_id INT NOT NULL FOREIGN KEY REFERENCES packages(id) ON DELETE CASCADE,
          product_id INT NOT NULL,
          product_size_id INT NOT NULL FOREIGN KEY REFERENCES product_sizes(id),
          quantity INT NOT NULL
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'profile_config')
      BEGIN
        CREATE TABLE profile_config (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL UNIQUE FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          owner_name NVARCHAR(255),
          business_name NVARCHAR(255),
          email NVARCHAR(255),
          receive_order_notifications BIT DEFAULT 1,
          logo_url NVARCHAR(MAX),
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
      ELSE IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'profile_config' AND COLUMN_NAME = 'studio_id')
      BEGIN
        ALTER TABLE profile_config ADD studio_id INT NULL;
        -- Optionally, migrate existing data: set studio_id = id where studio_id IS NULL
        UPDATE profile_config SET studio_id = id WHERE studio_id IS NULL AND id IS NOT NULL;
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_smugmug_config')
      BEGIN
        CREATE TABLE studio_smugmug_config (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL UNIQUE FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          nickname NVARCHAR(255) NULL,
          api_key NVARCHAR(255) NULL,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_cart')
      BEGIN
        CREATE TABLE user_cart (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NOT NULL UNIQUE FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
          cart_data NVARCHAR(MAX),
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'watermarks')
      BEGIN
        CREATE TABLE watermarks (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) NOT NULL,
          image_url NVARCHAR(MAX) NOT NULL,
          position NVARCHAR(50) DEFAULT 'bottom-right',
          opacity FLOAT DEFAULT 0.5,
          is_default BIT DEFAULT 0,
          tiled BIT DEFAULT 0,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'discount_codes')
      BEGIN
        CREATE TABLE discount_codes (
          id INT IDENTITY(1,1) PRIMARY KEY,
          code NVARCHAR(255) UNIQUE NOT NULL,
          description NVARCHAR(MAX),
          discount_type NVARCHAR(50) NOT NULL,
          discount_value FLOAT NOT NULL,
          application_type NVARCHAR(50) NOT NULL,
          expiration_date DATETIME2,
          is_one_time_use BIT DEFAULT 0,
          usage_count INT DEFAULT 0,
          max_usages INT,
          is_active BIT DEFAULT 1,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'discount_code_products')
      BEGIN
        CREATE TABLE discount_code_products (
          discount_code_id INT NOT NULL FOREIGN KEY REFERENCES discount_codes(id) ON DELETE CASCADE,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE CASCADE,
          CONSTRAINT pk_discount_code_products PRIMARY KEY (discount_code_id, product_id)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'analytics')
      BEGIN
        CREATE TABLE analytics (
          id INT IDENTITY(1,1) PRIMARY KEY,
          event_type NVARCHAR(255) NOT NULL,
          event_data NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'shipping_config')
      BEGIN
        CREATE TABLE shipping_config (
          id INT PRIMARY KEY,
          batch_deadline NVARCHAR(255) DEFAULT '2099-12-31T23:59:59Z',
          direct_shipping_charge FLOAT DEFAULT 10.00,
          is_active BIT DEFAULT 1,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT ck_shipping_config_id CHECK (id = 1)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'stripe_config')
      BEGIN
        CREATE TABLE stripe_config (
          id INT PRIMARY KEY,
          publishable_key NVARCHAR(255),
          secret_key NVARCHAR(255),
          is_live_mode BIT DEFAULT 0,
          is_active BIT DEFAULT 0,
          webhook_secret NVARCHAR(255),
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT ck_stripe_config_id CHECK (id = 1)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'subscription_stripe_config')
      BEGIN
        CREATE TABLE subscription_stripe_config (
          id INT PRIMARY KEY,
          publishable_key NVARCHAR(255),
          secret_key NVARCHAR(255),
          webhook_secret NVARCHAR(255),
          is_live_mode BIT DEFAULT 0,
          is_active BIT DEFAULT 0,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT ck_subscription_stripe_config_id CHECK (id = 1)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_profit_payout_config')
      BEGIN
        CREATE TABLE studio_profit_payout_config (
          id INT PRIMARY KEY,
          payout_threshold FLOAT NOT NULL DEFAULT 500,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT ck_studio_profit_payout_config_id CHECK (id = 1)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'categories')
      BEGIN
        CREATE TABLE categories (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) UNIQUE NOT NULL,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'subscription_plans')
      BEGIN
        CREATE TABLE subscription_plans (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) UNIQUE NOT NULL,
          description NVARCHAR(MAX),
          monthly_price FLOAT NOT NULL,
          yearly_price FLOAT,
          max_albums INT,
          max_storage_gb INT,
          features NVARCHAR(MAX),
          stripe_monthly_price_id NVARCHAR(255),
          stripe_yearly_price_id NVARCHAR(255),
          is_active BIT DEFAULT 1,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    // Add stripe price ID columns to existing subscription_plans tables (migration)
    await query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('subscription_plans') AND name = 'stripe_monthly_price_id'
      )
      BEGIN
        ALTER TABLE subscription_plans ADD stripe_monthly_price_id NVARCHAR(255)
      END
    `);
    await query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('subscription_plans') AND name = 'stripe_yearly_price_id'
      )
      BEGIN
        ALTER TABLE subscription_plans ADD stripe_yearly_price_id NVARCHAR(255)
      END
    `);

    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(23, 59, 59, 0);

    await query(
      `IF NOT EXISTS (SELECT 1 FROM shipping_config WHERE id = 1)
       BEGIN
         INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active)
         VALUES (1, $1, 10.00, 1)
       END`,
      [nextSunday.toISOString()]
    );

    await query(
      `IF NOT EXISTS (SELECT 1 FROM stripe_config WHERE id = 1)
       BEGIN
         INSERT INTO stripe_config (id, publishable_key, secret_key, is_live_mode, is_active)
         VALUES (1, 'pk_test_example', 'sk_test_example', 0, 0)
       END`
    );

    await query(
      `IF NOT EXISTS (SELECT 1 FROM subscription_stripe_config WHERE id = 1)
       BEGIN
         INSERT INTO subscription_stripe_config (id, publishable_key, secret_key, webhook_secret, is_live_mode, is_active)
         VALUES (1, 'pk_test_example', 'sk_test_example', NULL, 0, 0)
       END`
    );

    await query(
      `IF NOT EXISTS (SELECT 1 FROM studio_profit_payout_config WHERE id = 1)
       BEGIN
         INSERT INTO studio_profit_payout_config (id, payout_threshold)
         VALUES (1, 500)
       END`
    );

    await query(`
      IF COL_LENGTH('studios', 'payment_vendors') IS NULL
      BEGIN
        ALTER TABLE studios ADD payment_vendors NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('studios', 'lab_vendors') IS NULL
      BEGIN
        ALTER TABLE studios ADD lab_vendors NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      UPDATE studios
      SET payment_vendors = '["stripe"]'
      WHERE payment_vendors IS NULL OR LTRIM(RTRIM(payment_vendors)) = ''
    `);

    await query(`
      UPDATE studios
      SET lab_vendors = '["roes","whcc","mpix"]'
      WHERE lab_vendors IS NULL OR LTRIM(RTRIM(lab_vendors)) = ''
    `);

    await query(`
      IF COL_LENGTH('orders', 'batch_ready_date') IS NULL
      BEGIN
        ALTER TABLE orders ADD batch_ready_date DATETIME2 NULL
      END
    `);

    await query(`
      IF COL_LENGTH('albums', 'studio_id') IS NULL
      BEGIN
        ALTER TABLE albums ADD studio_id INT NULL
      END
    `);

    await query(`
      IF COL_LENGTH('photos', 'file_size_bytes') IS NULL
      BEGIN
        ALTER TABLE photos ADD file_size_bytes BIGINT NULL
      END
    `);

    await query(`
      IF COL_LENGTH('order_items', 'product_size_id') IS NULL
      BEGIN
        ALTER TABLE order_items ADD product_size_id INT NULL
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_invoices')
      BEGIN
        CREATE TABLE studio_invoices (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          billing_period_start DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP,
          billing_period_end DATETIME2 NULL,
          status NVARCHAR(50) NOT NULL DEFAULT 'open',
          total_amount FLOAT NOT NULL DEFAULT 0,
          item_count INT NOT NULL DEFAULT 0,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_invoice_items')
      BEGIN
        CREATE TABLE studio_invoice_items (
          id INT IDENTITY(1,1) PRIMARY KEY,
          invoice_id INT NOT NULL FOREIGN KEY REFERENCES studio_invoices(id) ON DELETE CASCADE,
          studio_id INT NOT NULL,
          order_id INT NOT NULL,
          product_id INT NOT NULL,
          product_size_id INT NULL,
          quantity INT NOT NULL DEFAULT 1,
          unit_cost FLOAT NOT NULL DEFAULT 0,
          total_cost FLOAT NOT NULL DEFAULT 0,
          order_date DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'batch_queue_status') IS NULL
      BEGIN
        ALTER TABLE orders ADD batch_queue_status NVARCHAR(50) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'batch_lab_vendor') IS NULL
      BEGIN
        ALTER TABLE orders ADD batch_lab_vendor NVARCHAR(50) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'payment_intent_id') IS NULL
      BEGIN
        ALTER TABLE orders ADD payment_intent_id NVARCHAR(255) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'stripe_charge_id') IS NULL
      BEGIN
        ALTER TABLE orders ADD stripe_charge_id NVARCHAR(255) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'stripe_fee_amount') IS NULL
      BEGIN
        ALTER TABLE orders ADD stripe_fee_amount FLOAT NOT NULL CONSTRAINT df_orders_stripe_fee_amount DEFAULT 0
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'customer_receipt_sent_at') IS NULL
      BEGIN
        ALTER TABLE orders ADD customer_receipt_sent_at DATETIME2 NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'studio_receipt_sent_at') IS NULL
      BEGIN
        ALTER TABLE orders ADD studio_receipt_sent_at DATETIME2 NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_confirmation_id') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_confirmation_id NVARCHAR(255) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_import_response') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_import_response NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_submit_response') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_submit_response NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_request_log') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_request_log NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_last_error') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_last_error NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_order_number') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_order_number NVARCHAR(255) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_webhook_status') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_webhook_status NVARCHAR(100) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_webhook_event') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_webhook_event NVARCHAR(100) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_webhook_payload') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_webhook_payload NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'whcc_webhook_received_at') IS NULL
      BEGIN
        ALTER TABLE orders ADD whcc_webhook_received_at DATETIME2 NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'shipping_carrier') IS NULL
      BEGIN
        ALTER TABLE orders ADD shipping_carrier NVARCHAR(100) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'tracking_number') IS NULL
      BEGIN
        ALTER TABLE orders ADD tracking_number NVARCHAR(255) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'tracking_url') IS NULL
      BEGIN
        ALTER TABLE orders ADD tracking_url NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('orders', 'shipped_at') IS NULL
      BEGIN
        ALTER TABLE orders ADD shipped_at DATETIME2 NULL
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whcc_webhook_config')
      BEGIN
        CREATE TABLE whcc_webhook_config (
          studio_id INT PRIMARY KEY,
          callback_uri NVARCHAR(MAX) NULL,
          last_verifier NVARCHAR(255) NULL,
          verified_at DATETIME2 NULL,
          last_registration_response NVARCHAR(MAX) NULL,
          last_verification_response NVARCHAR(MAX) NULL,
          last_payload NVARCHAR(MAX) NULL,
          last_received_at DATETIME2 NULL,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_whcc_webhook_config_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_price_list_offerings')
      BEGIN
        CREATE TABLE studio_price_list_offerings (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          price_list_id INT NOT NULL FOREIGN KEY REFERENCES price_lists(id) ON DELETE CASCADE,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE CASCADE,
          is_offered BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_studio_price_list_offerings UNIQUE (studio_id, price_list_id, product_id)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_price_list_size_overrides')
      BEGIN
        CREATE TABLE studio_price_list_size_overrides (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          price_list_id INT NOT NULL FOREIGN KEY REFERENCES price_lists(id) ON DELETE NO ACTION,
          product_id INT NOT NULL FOREIGN KEY REFERENCES products(id) ON DELETE NO ACTION,
          product_size_id INT NOT NULL FOREIGN KEY REFERENCES product_sizes(id) ON DELETE NO ACTION,
          price FLOAT NOT NULL,
          is_offered BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_studio_price_list_size_overrides UNIQUE (studio_id, price_list_id, product_size_id)
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_invoices')
      BEGIN
        CREATE TABLE studio_invoices (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          billing_period_start DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP,
          billing_period_end DATETIME2 NULL,
          status NVARCHAR(50) NOT NULL DEFAULT 'open',
          total_amount FLOAT NOT NULL DEFAULT 0,
          item_count INT NOT NULL DEFAULT 0,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_invoice_items')
      BEGIN
        CREATE TABLE studio_invoice_items (
          id INT IDENTITY(1,1) PRIMARY KEY,
          invoice_id INT NOT NULL FOREIGN KEY REFERENCES studio_invoices(id) ON DELETE CASCADE,
          studio_id INT NOT NULL,
          order_id INT NOT NULL,
          product_id INT NOT NULL,
          product_size_id INT NULL,
          quantity INT NOT NULL DEFAULT 1,
          unit_cost FLOAT NOT NULL DEFAULT 0,
          total_cost FLOAT NOT NULL DEFAULT 0,
          order_date DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF COL_LENGTH('products', 'sample_photo_url') IS NULL
      BEGIN
        ALTER TABLE products ADD sample_photo_url NVARCHAR(MAX) NULL
      END
    `);

    await query(`
      IF COL_LENGTH('studio_price_list_size_overrides', 'is_offered') IS NULL
      BEGIN
        ALTER TABLE studio_price_list_size_overrides ADD is_offered BIT NOT NULL DEFAULT 1
      END
    `);

    await query(`
      IF COL_LENGTH('studios', 'public_slug') IS NULL
      BEGIN
        ALTER TABLE studios ADD public_slug NVARCHAR(120) NULL
      END
    `);

    await query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'ux_studios_public_slug' AND object_id = OBJECT_ID('studios')
      )
      BEGIN
        CREATE UNIQUE INDEX ux_studios_public_slug
        ON studios(public_slug)
        WHERE public_slug IS NOT NULL
      END
    `);

    await query(`
      UPDATE orders
      SET batch_queue_status = 'queued'
      WHERE is_batch = 1
        AND (lab_submitted = 0 OR lab_submitted IS NULL)
        AND (batch_queue_status IS NULL OR batch_queue_status = '')
    `);

    const planPayloads = [
      {
        name: 'Starter',
        description: 'Perfect for small studios',
        monthly: 29.99,
        yearly: 299.9,
        albums: 10,
        storage: 50,
        features: JSON.stringify(['Basic analytics', 'Up to 10 albums', '50GB storage', 'Email support']),
      },
      {
        name: 'Professional',
        description: 'For growing studios',
        monthly: 79.99,
        yearly: 799.9,
        albums: 50,
        storage: 500,
        features: JSON.stringify(['Advanced analytics', 'Up to 50 albums', '500GB storage', 'Priority support', 'Custom branding']),
      },
      {
        name: 'Enterprise',
        description: 'For large operations',
        monthly: 199.99,
        yearly: 1999.9,
        albums: 500,
        storage: 2000,
        features: JSON.stringify(['Full analytics', 'Unlimited albums', '2TB storage', '24/7 support', 'Custom integrations', 'Dedicated account manager']),
      },
    ];

    for (const plan of planPayloads) {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = $1)
         BEGIN
           INSERT INTO subscription_plans (name, description, monthly_price, yearly_price, max_albums, max_storage_gb, features)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
         END`,
        [plan.name, plan.description, plan.monthly, plan.yearly, plan.albums, plan.storage, plan.features]
      );
    }

    const superAdminExists = await queryRow('SELECT id FROM users WHERE role = $1', ['super_admin']);
    if (!superAdminExists) {
      const hashedPassword = bcrypt.hashSync('SuperAdmin@123456', 10);
      await query(
        `INSERT INTO users (email, password, name, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        ['super_admin@photolab.com', hashedPassword, 'Super Admin', 'super_admin', 1]
      );
      console.log('Super admin user created: super_admin@photolab.com / SuperAdmin@123456');
    }

    console.log('✓ Database schema initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

process.on('exit', async () => {
  try {
    if (poolPromise) {
      const poolInstance = await poolPromise;
      await poolInstance.close();
    }
  } catch {
    // ignore shutdown errors
  }
});

export { poolPromise };

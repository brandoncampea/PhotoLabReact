import sql from 'mssql';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env.local' });

const mssqlConfig = process.env.MSSQL_CONNECTION_STRING
  ? {
      connectionString: process.env.MSSQL_CONNECTION_STRING,
      options: {
        encrypt: process.env.MSSQL_ENCRYPT !== 'false',
        trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
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
      },
    };

const pool = new sql.ConnectionPool(mssqlConfig);
const poolPromise = pool.connect();

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

// Helper function to run queries
export async function query(text, params = []) {
  const start = Date.now();
  try {
    const poolInstance = await poolPromise;
    const request = poolInstance.request();
    params.forEach((param, index) => {
      request.input(`p${index + 1}`, param);
    });
    const result = await request.query(transformSql(text));
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowsAffected?.[0] || 0 });
    return normalizeResult(result);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper function to get a single row
export async function queryRow(text, params) {
  const result = await query(text, params);
  return result.rows[0];
}

// Helper function to get all rows
export async function queryRows(text, params) {
  const result = await query(text, params);
  return result.rows;
}

// Helper function to run a transaction
export async function transaction(callback) {
  const poolInstance = await poolPromise;
  const tx = new sql.Transaction(poolInstance);
  await tx.begin();
  const client = {
    query: async (text, params = []) => {
      const request = new sql.Request(tx);
      params.forEach((param, index) => {
        request.input(`p${index + 1}`, param);
      });
      const result = await request.query(transformSql(text));
      return normalizeResult(result);
    },
  };

  try {
    const result = await callback(client);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// Initialize database schema
export async function initializeDatabase() {
  console.log('Initializing MSSQL database...');

  try {
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studios')
      BEGIN
        CREATE TABLE studios (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) NOT NULL,
          email NVARCHAR(255) UNIQUE,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          subscription_status NVARCHAR(50) DEFAULT 'inactive',
          subscription_plan NVARCHAR(100),
          subscription_start DATETIME2,
          subscription_end DATETIME2,
          stripe_customer_id NVARCHAR(255),
          stripe_subscription_id NVARCHAR(255),
          fee_type NVARCHAR(50) DEFAULT 'percentage',
          fee_value FLOAT DEFAULT 0,
          billing_cycle NVARCHAR(50) DEFAULT 'monthly',
          is_free_subscription BIT DEFAULT 0,
          cancellation_requested BIT DEFAULT 0,
          cancellation_date DATETIME2
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'users')
      BEGIN
        CREATE TABLE users (
          id INT IDENTITY(1,1) PRIMARY KEY,
          email NVARCHAR(255) UNIQUE NOT NULL,
          password NVARCHAR(255) NOT NULL,
          name NVARCHAR(255) NOT NULL,
          role NVARCHAR(50) DEFAULT 'customer',
          is_active BIT DEFAULT 1,
          last_login_at DATETIME2,
          studio_id INT FOREIGN KEY REFERENCES studios(id),
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'albums')
      BEGIN
        CREATE TABLE albums (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255),
          title NVARCHAR(255),
          description NVARCHAR(MAX),
          cover_image_url NVARCHAR(MAX),
          cover_photo_id INT,
          photo_count INT DEFAULT 0,
          category NVARCHAR(255),
          price_list_id INT,
          is_password_protected BIT DEFAULT 0,
          password NVARCHAR(255),
          password_hint NVARCHAR(255),
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'photos')
      BEGIN
        CREATE TABLE photos (
          id INT IDENTITY(1,1) PRIMARY KEY,
          album_id INT NOT NULL FOREIGN KEY REFERENCES albums(id) ON DELETE CASCADE,
          file_name NVARCHAR(255) NOT NULL,
          thumbnail_url NVARCHAR(MAX) NOT NULL,
          full_image_url NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX),
          metadata NVARCHAR(MAX),
          player_names NVARCHAR(MAX),
          width INT,
          height INT,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'orders')
      BEGIN
        CREATE TABLE orders (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NOT NULL FOREIGN KEY REFERENCES users(id),
          total FLOAT NOT NULL,
          status NVARCHAR(50) DEFAULT 'pending',
          shipping_address NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          shipping_option NVARCHAR(50) DEFAULT 'direct',
          shipping_cost FLOAT DEFAULT 0,
          discount_code NVARCHAR(255),
          is_batch BIT DEFAULT 0,
          batch_shipping_address NVARCHAR(MAX),
          lab_submitted BIT DEFAULT 0,
          lab_submitted_at DATETIME2,
          subtotal FLOAT DEFAULT 0,
          tax_amount FLOAT DEFAULT 0,
          tax_rate FLOAT DEFAULT 0
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
          id INT PRIMARY KEY,
          owner_name NVARCHAR(255),
          business_name NVARCHAR(255),
          email NVARCHAR(255),
          receive_order_notifications BIT DEFAULT 1,
          logo_url NVARCHAR(MAX),
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT ck_profile_config_id CHECK (id = 1)
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
          is_active BIT DEFAULT 1,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
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
    const poolInstance = await poolPromise;
    await poolInstance.close();
  } catch {
    // ignore shutdown errors
  }
});

export { poolPromise };

import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'photolab',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      }
);

// Helper function to run queries
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Initialize database schema
export async function initializeDatabase() {
  console.log('Initializing PostgreSQL database...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS studios (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        subscription_status TEXT DEFAULT 'inactive',
        subscription_plan TEXT,
        subscription_start TIMESTAMP,
        subscription_end TIMESTAMP,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        fee_type TEXT DEFAULT 'percentage',
        fee_value REAL DEFAULT 0,
        billing_cycle TEXT DEFAULT 'monthly',
        is_free_subscription BOOLEAN DEFAULT false,
        cancellation_requested BOOLEAN DEFAULT false,
        cancellation_date TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'customer',
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP,
        studio_id INTEGER REFERENCES studios(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS albums (
        id SERIAL PRIMARY KEY,
        name TEXT,
        title TEXT,
        description TEXT,
        cover_image_url TEXT,
        cover_photo_id INTEGER,
        photo_count INTEGER DEFAULT 0,
        category TEXT,
        price_list_id INTEGER,
        is_password_protected BOOLEAN DEFAULT false,
        password TEXT,
        password_hint TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        thumbnail_url TEXT NOT NULL,
        full_image_url TEXT NOT NULL,
        description TEXT,
        metadata TEXT,
        player_names TEXT,
        width INTEGER,
        height INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        shipping_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        shipping_option TEXT DEFAULT 'direct',
        shipping_cost REAL DEFAULT 0,
        discount_code TEXT,
        is_batch BOOLEAN DEFAULT false,
        batch_shipping_address TEXT,
        lab_submitted BOOLEAN DEFAULT false,
        lab_submitted_at TIMESTAMP,
        subtotal REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        photo_id INTEGER NOT NULL REFERENCES photos(id),
        photo_ids TEXT,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        price REAL NOT NULL,
        crop_data TEXT
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        cost REAL,
        options TEXT
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS price_list_products (
        id SERIAL PRIMARY KEY,
        price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE (price_list_id, product_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS product_sizes (
        id SERIAL PRIMARY KEY,
        price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        size_name TEXT NOT NULL,
        price REAL NOT NULL,
        cost REAL,
        UNIQUE (price_list_id, product_id, size_name)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        package_price REAL NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS package_items (
        id SERIAL PRIMARY KEY,
        package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_size_id INTEGER NOT NULL REFERENCES product_sizes(id),
        quantity INTEGER NOT NULL
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS profile_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        owner_name TEXT,
        business_name TEXT,
        email TEXT,
        receive_order_notifications BOOLEAN DEFAULT true,
        logo_url TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS user_cart (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        cart_data TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS watermarks (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        position TEXT DEFAULT 'bottom-right',
        opacity REAL DEFAULT 0.5,
        is_default BOOLEAN DEFAULT false,
        tiled BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        description TEXT,
        discount_type TEXT NOT NULL,
        discount_value REAL NOT NULL,
        application_type TEXT NOT NULL,
        expiration_date TIMESTAMP,
        is_one_time_use BOOLEAN DEFAULT false,
        usage_count INTEGER DEFAULT 0,
        max_usages INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS discount_code_products (
        discount_code_id INTEGER NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        PRIMARY KEY (discount_code_id, product_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS shipping_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        batch_deadline TEXT DEFAULT '2099-12-31T23:59:59Z',
        direct_shipping_charge REAL DEFAULT 10.00,
        is_active BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS stripe_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        publishable_key TEXT,
        secret_key TEXT,
        is_live_mode BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT false,
        webhook_secret TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        monthly_price REAL NOT NULL,
        yearly_price REAL,
        max_albums INTEGER,
        max_storage_gb INTEGER,
        features TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(23, 59, 59, 0);

    await query(
      `INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active)
       VALUES (1, $1, 10.00, true)
       ON CONFLICT (id) DO NOTHING`,
      [nextSunday.toISOString()]
    );

    await query(
      `INSERT INTO stripe_config (id, publishable_key, secret_key, is_live_mode, is_active)
       VALUES (1, 'pk_test_example', 'sk_test_example', false, false)
       ON CONFLICT (id) DO NOTHING`
    );

    await query(
      `INSERT INTO subscription_plans (name, description, monthly_price, yearly_price, max_albums, max_storage_gb, features)
       VALUES
        ('Starter', 'Perfect for small studios', 29.99, 299.90, 10, 50, $1),
        ('Professional', 'For growing studios', 79.99, 799.90, 50, 500, $2),
        ('Enterprise', 'For large operations', 199.99, 1999.90, 500, 2000, $3)
       ON CONFLICT (name) DO NOTHING`,
      [
        JSON.stringify(['Basic analytics', 'Up to 10 albums', '50GB storage', 'Email support']),
        JSON.stringify(['Advanced analytics', 'Up to 50 albums', '500GB storage', 'Priority support', 'Custom branding']),
        JSON.stringify(['Full analytics', 'Unlimited albums', '2TB storage', '24/7 support', 'Custom integrations', 'Dedicated account manager']),
      ]
    );

    const superAdminExists = await queryRow('SELECT id FROM users WHERE role = $1', ['super_admin']);
    if (!superAdminExists) {
      const hashedPassword = bcrypt.hashSync('SuperAdmin@123456', 10);
      await query(
        `INSERT INTO users (email, password, name, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)`,
        ['super_admin@photolab.com', hashedPassword, 'Super Admin', 'super_admin']
      );
      console.log('Super admin user created: super_admin@photolab.com / SuperAdmin@123456');
    }

    console.log('✓ Database schema initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Graceful shutdown
process.on('exit', async () => {
  await pool.end();
});

export { pool };

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'photolab.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
const initDb = () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      is_active BOOLEAN DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate users table to add missing columns (role, is_active, last_login_at)
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    const colNames = userCols.map(c => c.name);
    if (!colNames.includes('role')) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'");
    }
    if (!colNames.includes('is_active')) {
      db.exec("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1");
    }
    if (!colNames.includes('last_login_at')) {
      db.exec("ALTER TABLE users ADD COLUMN last_login_at DATETIME");
    }
  } catch (e) {
    // ignore
  }

  // Migrate photos table to add player_names column
  try {
    const photoCols = db.prepare("PRAGMA table_info(photos)").all();
    const colNames = photoCols.map(c => c.name);
    if (!colNames.includes('player_names')) {
      db.exec("ALTER TABLE photos ADD COLUMN player_names TEXT");
    }
    if (!colNames.includes('width')) {
      db.exec("ALTER TABLE photos ADD COLUMN width INTEGER");
    }
    if (!colNames.includes('height')) {
      db.exec("ALTER TABLE photos ADD COLUMN height INTEGER");
    }
  } catch (e) {
    // ignore
  }

  // Albums table
  db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      title TEXT,
      description TEXT,
      cover_image_url TEXT,
      photo_count INTEGER DEFAULT 0,
      category TEXT,
      price_list_id INTEGER,
      is_password_protected BOOLEAN DEFAULT 0,
      password TEXT,
      password_hint TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Backfill name from legacy title column if needed
  try {
    const albumCols = db.prepare("PRAGMA table_info(albums)").all();
    const colNames = albumCols.map(c => c.name);
    if (!colNames.includes('name')) {
      db.exec("ALTER TABLE albums ADD COLUMN name TEXT");
    }
    if (!colNames.includes('title')) {
      // keep schema tolerant; no-op if title absent
    }
    if (!colNames.includes('cover_photo_id')) {
      db.exec("ALTER TABLE albums ADD COLUMN cover_photo_id INTEGER");
    }
    db.exec("UPDATE albums SET name = COALESCE(name, title) WHERE name IS NULL AND title IS NOT NULL");
  } catch (e) {
    // ignore
  }

  // Photos table
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      full_image_url TEXT NOT NULL,
      description TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    )
  `);

  // Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      shipping_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Order items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      photo_id INTEGER NOT NULL,
      photo_ids TEXT,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      price REAL NOT NULL,
      crop_data TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (photo_id) REFERENCES photos(id)
    )
  `);

  // Migrate order_items to add photo_ids column for multi-photo products
  try {
    const orderItemCols = db.prepare("PRAGMA table_info(order_items)").all();
    const colNames = orderItemCols.map(c => c.name);
    if (!colNames.includes('photo_ids')) {
      db.exec("ALTER TABLE order_items ADD COLUMN photo_ids TEXT");
    }
  } catch (e) {
    // ignore
  }

  // Migrate orders table to add batch shipping columns
  try {
    const orderCols = db.prepare("PRAGMA table_info(orders)").all();
    const orderColNames = orderCols.map(c => c.name);
    
    if (!orderColNames.includes('shipping_option')) {
      db.exec("ALTER TABLE orders ADD COLUMN shipping_option TEXT DEFAULT 'direct'");
    }
    if (!orderColNames.includes('shipping_cost')) {
      db.exec("ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0");
    }
    if (!orderColNames.includes('discount_code')) {
      db.exec("ALTER TABLE orders ADD COLUMN discount_code TEXT");
    }
    if (!orderColNames.includes('is_batch')) {
      db.exec("ALTER TABLE orders ADD COLUMN is_batch INTEGER DEFAULT 0");
    }
    if (!orderColNames.includes('batch_shipping_address')) {
      db.exec("ALTER TABLE orders ADD COLUMN batch_shipping_address TEXT");
    }
    if (!orderColNames.includes('lab_submitted')) {
      db.exec("ALTER TABLE orders ADD COLUMN lab_submitted INTEGER DEFAULT 0");
    }
    if (!orderColNames.includes('lab_submitted_at')) {
      db.exec("ALTER TABLE orders ADD COLUMN lab_submitted_at DATETIME");
    }
    if (!orderColNames.includes('subtotal')) {
      db.exec("ALTER TABLE orders ADD COLUMN subtotal REAL DEFAULT 0");
    }
    if (!orderColNames.includes('tax_amount')) {
      db.exec("ALTER TABLE orders ADD COLUMN tax_amount REAL DEFAULT 0");
    }
    if (!orderColNames.includes('tax_rate')) {
      db.exec("ALTER TABLE orders ADD COLUMN tax_rate REAL DEFAULT 0");
    }
  } catch (e) {
    console.error('Error migrating orders table:', e);
  }

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      cost REAL,
      options TEXT
    )
  `);

  // Price Lists table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_default BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Price List Products table (many-to-many with sizes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_list_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_list_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(price_list_id, product_id)
    )
  `);

  // Product Sizes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_list_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      size_name TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL,
      FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(price_list_id, product_id, size_name)
    )
  `);

  // Packages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_list_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      package_price REAL NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE
    )
  `);

  // Package Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS package_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_size_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (product_size_id) REFERENCES product_sizes(id)
    )
  `);

  // Profile Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      owner_name TEXT,
      business_name TEXT,
      email TEXT,
      receive_order_notifications BOOLEAN DEFAULT 1,
      logo_url TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User Cart table (per-user carts)
  const existingCartSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_cart'").get();
  if (!existingCartSchema) {
    db.exec(`
      CREATE TABLE user_cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        cart_data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } else if (existingCartSchema.sql && existingCartSchema.sql.includes('CHECK (id = 1)')) {
    // Migrate from single-row cart to per-user carts
    db.exec('BEGIN');
    db.exec(`
      CREATE TABLE user_cart_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        cart_data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // Attempt to migrate the existing single cart to a NULL user; if NULL, skip as we enforce NOT NULL
    try {
      const single = db.prepare('SELECT user_id, cart_data FROM user_cart WHERE id = 1').get();
      if (single && single.user_id) {
        db.prepare('INSERT INTO user_cart_new (user_id, cart_data) VALUES (?, ?)').run(single.user_id, single.cart_data || null);
      }
    } catch {}
    db.exec('DROP TABLE user_cart');
    db.exec('ALTER TABLE user_cart_new RENAME TO user_cart');
    db.exec('COMMIT');
  }

  // Watermarks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS watermarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      position TEXT DEFAULT 'bottom-right',
      opacity REAL DEFAULT 0.5,
      is_default BOOLEAN DEFAULT 0,
      tiled BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Discount Codes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS discount_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      application_type TEXT NOT NULL,
      expiration_date DATETIME,
      is_one_time_use BOOLEAN DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      max_usages INTEGER,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Discount Code Products table (for applicable products)
  db.exec(`
    CREATE TABLE IF NOT EXISTS discount_code_products (
      discount_code_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      PRIMARY KEY (discount_code_id, product_id),
      FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Analytics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      event_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Shipping config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipping_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      batch_deadline TEXT DEFAULT '2099-12-31T23:59:59Z',
      direct_shipping_charge REAL DEFAULT 10.00,
      is_active BOOLEAN DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Stripe config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      publishable_key TEXT,
      secret_key TEXT,
      is_live_mode BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      webhook_secret TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed shipping config if not exists
  try {
    const shippingExists = db.prepare('SELECT * FROM shipping_config WHERE id = 1').get();
    if (!shippingExists) {
      // Set batch deadline to next Sunday at 11:59 PM
      const now = new Date();
      const nextSunday = new Date(now);
      nextSunday.setDate(now.getDate() + (7 - now.getDay()));
      nextSunday.setHours(23, 59, 59, 0);
      
      db.prepare(`
        INSERT INTO shipping_config (id, batch_deadline, direct_shipping_charge, is_active)
        VALUES (1, ?, 10.00, 1)
      `).run(nextSunday.toISOString());
    }
  } catch (e) {
    console.error('Error seeding shipping config:', e);
  }

  // Seed stripe config if not exists
  try {
    const stripeExists = db.prepare('SELECT * FROM stripe_config WHERE id = 1').get();
    if (!stripeExists) {
      db.prepare(`
        INSERT INTO stripe_config (id, publishable_key, secret_key, is_live_mode, is_active)
        VALUES (1, 'pk_test_example', 'sk_test_example', 0, 0)
      `).run();
    }
  } catch (e) {
    console.error('Error seeding stripe config:', e);
  }

  // Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database initialized successfully');
};

export { db, initDb };

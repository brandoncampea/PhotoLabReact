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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Albums table
  db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
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
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      price REAL NOT NULL,
      crop_data TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (photo_id) REFERENCES photos(id)
    )
  `);

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

  // User Cart table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_cart (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      user_id INTEGER,
      cart_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  console.log('Database initialized successfully');
};

export { db, initDb };

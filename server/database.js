
// ...existing code...
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'campeaphotolab-test.db'));

db.pragma('foreign_keys = ON');

const initDb = () => {
  // Super Admin Price Lists (moved to top for guaranteed execution)
  try {
    // ...existing code...
    db.exec(`
      CREATE TABLE IF NOT EXISTS super_price_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ...existing code...
  } catch (err) {
    console.error('Error creating super_price_lists table:', err);
  }

  try {
    // ...existing code...
    db.exec(`
      CREATE TABLE IF NOT EXISTS super_price_list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        super_price_list_id INTEGER NOT NULL,
        product_size_id INTEGER NOT NULL,
        base_cost REAL,
        markup_percent REAL,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (super_price_list_id) REFERENCES super_price_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (product_size_id) REFERENCES product_sizes(id) ON DELETE CASCADE,
        UNIQUE(super_price_list_id, product_size_id)
      )
    `);
    // ...existing code...
  } catch (err) {
    console.error('Error creating super_price_list_items table:', err);
  }

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
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    const colNames = userCols.map(c => c.name);
    if (!colNames.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'");
    if (!colNames.includes('is_active')) db.exec("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1");
    if (!colNames.includes('last_login_at')) db.exec("ALTER TABLE users ADD COLUMN last_login_at DATETIME");
    if (!colNames.includes('studio_id')) db.exec("ALTER TABLE users ADD COLUMN studio_id INTEGER");
  } catch {}

  // Studios table
  db.exec(`
    CREATE TABLE IF NOT EXISTS studios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      subscription_status TEXT DEFAULT 'inactive',
      subscription_plan TEXT,
      subscription_start DATETIME,
      subscription_end DATETIME,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT
    )
  `);
  try {
    const studioCols = db.prepare("PRAGMA table_info(studios)").all();
    const colNames = studioCols.map(c => c.name);
    if (!colNames.includes('subscription_status')) db.exec("ALTER TABLE studios ADD COLUMN subscription_status TEXT DEFAULT 'inactive'");
    if (!colNames.includes('subscription_plan')) db.exec("ALTER TABLE studios ADD COLUMN subscription_plan TEXT");
    if (!colNames.includes('subscription_start')) db.exec("ALTER TABLE studios ADD COLUMN subscription_start DATETIME");
    if (!colNames.includes('subscription_end')) db.exec("ALTER TABLE studios ADD COLUMN subscription_end DATETIME");
    if (!colNames.includes('stripe_customer_id')) db.exec("ALTER TABLE studios ADD COLUMN stripe_customer_id TEXT");
    if (!colNames.includes('stripe_subscription_id')) db.exec("ALTER TABLE studios ADD COLUMN stripe_subscription_id TEXT");
    if (!colNames.includes('fee_type')) db.exec("ALTER TABLE studios ADD COLUMN fee_type TEXT DEFAULT 'percentage'");
    if (!colNames.includes('fee_value')) db.exec("ALTER TABLE studios ADD COLUMN fee_value REAL DEFAULT 0");
    if (!colNames.includes('billing_cycle')) db.exec("ALTER TABLE studios ADD COLUMN billing_cycle TEXT DEFAULT 'monthly'");
    if (!colNames.includes('is_free_subscription')) db.exec("ALTER TABLE studios ADD COLUMN is_free_subscription BOOLEAN DEFAULT 0");
    if (!colNames.includes('cancellation_requested')) db.exec("ALTER TABLE studios ADD COLUMN cancellation_requested BOOLEAN DEFAULT 0");
    if (!colNames.includes('cancellation_date')) db.exec("ALTER TABLE studios ADD COLUMN cancellation_date DATETIME");
  } catch {}

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
  try {
    const albumCols = db.prepare("PRAGMA table_info(albums)").all();
    const colNames = albumCols.map(c => c.name);
    if (!colNames.includes('name')) db.exec("ALTER TABLE albums ADD COLUMN name TEXT");
    if (!colNames.includes('cover_photo_id')) db.exec("ALTER TABLE albums ADD COLUMN cover_photo_id INTEGER");
    db.exec("UPDATE albums SET name = COALESCE(name, title) WHERE name IS NULL AND title IS NOT NULL");
  } catch {}

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
  try {
    const photoCols = db.prepare("PRAGMA table_info(photos)").all();
    const colNames = photoCols.map(c => c.name);
    if (!colNames.includes('player_names')) db.exec("ALTER TABLE photos ADD COLUMN player_names TEXT");
    if (!colNames.includes('width')) db.exec("ALTER TABLE photos ADD COLUMN width INTEGER");
    if (!colNames.includes('height')) db.exec("ALTER TABLE photos ADD COLUMN height INTEGER");
  } catch {}

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

  // Studio Product Offerings table (studio-specific product settings)
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_product_offerings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studio_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      price_list_id INTEGER,
      is_offered INTEGER NOT NULL DEFAULT 1,
      price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(studio_id, product_id, price_list_id),
      FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE
    )
  `);

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lab_id INTEGER,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      is_digital BOOLEAN DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE SET NULL
    )
  `);

  // Product Sizes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      is_digital BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Labs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS labs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Studio Price Lists
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_price_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studio_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_default BOOLEAN DEFAULT 0,
      super_price_list_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
      FOREIGN KEY (super_price_list_id) REFERENCES super_price_lists(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_price_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studio_price_list_id INTEGER NOT NULL,
      product_size_id INTEGER NOT NULL,
      price REAL,
      markup_percent REAL,
      is_offered BOOLEAN DEFAULT 1,
      FOREIGN KEY (studio_price_list_id) REFERENCES studio_price_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (product_size_id) REFERENCES product_sizes(id) ON DELETE CASCADE,
      UNIQUE(studio_price_list_id, product_size_id)
    )
  `);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // ...existing code...
  // ...existing code...
  // (Removed conditional initDb call; now always called at top level)

  return { db, initDb };
};


// Initialize DB schema when run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDb();
  // ...existing code...
}

import Database from 'better-sqlite3';
import bcryptjs from 'bcryptjs';

const db = new Database('server/photolab.db');

// Create studio
const studioResult = db.prepare(`
  INSERT INTO studios (name, email, subscription_plan, subscription_status, subscription_start, subscription_end, is_free_subscription, created_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+1 month'), ?, datetime('now'))
`).run('Test Studio', 'teststudio@example.com', 'pro', 'active', 1);

const studioId = studioResult.lastInsertRowid;

// Hash password
const hashedPassword = bcryptjs.hashSync('StudioPassword@123', 10);

// Create studio admin user
const userResult = db.prepare(`
  INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
`).run('studioowner@example.com', hashedPassword, 'Studio Owner', 'studio_admin', studioId);

console.log('✅ Studio created with ID:', studioId);
console.log('✅ User created with ID:', userResult.lastInsertRowid);
console.log('📧 Email: studioowner@example.com');
console.log('🔑 Password: StudioPassword@123');

db.close();

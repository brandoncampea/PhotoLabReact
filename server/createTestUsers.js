import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'photolab.db');
const db = new sqlite3.Database(dbPath);

const testUsers = [
  {
    email: 'customer@example.com',
    password: 'TestPassword@123',
    name: 'Test Customer',
    role: 'customer',
    studio_id: 1
  },
  {
    email: 'admin@example.com',
    password: 'AdminPassword@123',
    name: 'Test Admin',
    role: 'admin',
    studio_id: 1
  }
];

async function createTestUsers() {
  console.log('Creating test users...');
  
  for (const user of testUsers) {
    try {
      // Check if user exists
      const existing = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM users WHERE email = ?', [user.email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existing) {
        console.log(`User ${user.email} already exists, skipping...`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(user.password, 10);

      // Insert user
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (email, password, name, role, studio_id) VALUES (?, ?, ?, ?, ?)',
          [user.email, hashedPassword, user.name, user.role, user.studio_id],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      console.log(`✓ Created user: ${user.email} (${user.role})`);
    } catch (error) {
      console.error(`Error creating user ${user.email}:`, error);
    }
  }

  console.log('Done!');
  db.close();
}

createTestUsers();

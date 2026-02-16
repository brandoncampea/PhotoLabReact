import bcrypt from 'bcryptjs';
import { queryRow, query } from './mssql.js';

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
      const existing = await queryRow('SELECT id FROM users WHERE email = $1', [user.email]);

      if (existing) {
        console.log(`User ${user.email} already exists, skipping...`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(user.password, 10);

      // Insert user
      await query(
        'INSERT INTO users (email, password, name, role, studio_id) VALUES ($1, $2, $3, $4, $5)',
        [user.email, hashedPassword, user.name, user.role, user.studio_id]
      );

      console.log(`✓ Created user: ${user.email} (${user.role})`);
    } catch (error) {
      console.error(`Error creating user ${user.email}:`, error);
    }
  }

  console.log('Done!');
  process.exit(0);
}

createTestUsers();

// Script: initMSSQLWithSuperUser.cjs
// Usage: node scripts/initMSSQLWithSuperUser.cjs
// Description: Initializes a new MSSQL database with the bcampea@gmail.com super user account.

import mssql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

const SUPER_USER = {
  email: 'bcampea@gmail.com',
  passwordHash: '$2b$10$REPLACE_WITH_HASHED_PASSWORD', // Replace with a real bcrypt hash
  role: 'super_admin',
  name: 'Brandon Campea',
  isActive: 1,
};

async function main() {
  let pool;
  try {
    pool = await mssql.connect(config);
    // Create users table if not exists
    await pool.request().query(`
      IF OBJECT_ID('users', 'U') IS NULL
      CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        email NVARCHAR(255) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(50) NOT NULL,
        name NVARCHAR(255),
        is_active BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Insert super user if not exists
    const result = await pool.request()
      .input('email', mssql.NVarChar, SUPER_USER.email)
      .query('SELECT id FROM users WHERE email = @email');
    if (result.recordset.length === 0) {
      await pool.request()
        .input('email', mssql.NVarChar, SUPER_USER.email)
        .input('password_hash', mssql.NVarChar, SUPER_USER.passwordHash)
        .input('role', mssql.NVarChar, SUPER_USER.role)
        .input('name', mssql.NVarChar, SUPER_USER.name)
        .input('is_active', mssql.Bit, SUPER_USER.isActive)
        .query(`INSERT INTO users (email, password_hash, role, name, is_active) VALUES (@email, @password_hash, @role, @name, @is_active)`);
      console.log('Super user created:', SUPER_USER.email);
    } else {
      console.log('Super user already exists:', SUPER_USER.email);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error initializing MSSQL DB:', err);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

main();

-- initMSSQLWithSuperUser.sql
-- Description: Initializes a new MSSQL database with the bcampea@gmail.com super user account.
-- Usage: Run this script in SQL Server Management Studio or with sqlcmd after creating your database.

-- 1. Create users table if it does not exist
IF OBJECT_ID('users', 'U') IS NULL
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        email NVARCHAR(255) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(50) NOT NULL,
        name NVARCHAR(255),
        is_active BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    );
END
GO

-- 2. Insert super user if not exists
IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'bcampea@gmail.com')
BEGIN
    INSERT INTO users (email, password_hash, role, name, is_active)
    VALUES (
        'bcampea@gmail.com',
        '$2b$10$REPLACE_WITH_HASHED_PASSWORD', -- Replace with a real bcrypt hash
        'super_admin',
        'Brandon Campea',
        1
    );
END
GO

-- 3. Output result
SELECT * FROM users WHERE email = 'bcampea@gmail.com';
GO

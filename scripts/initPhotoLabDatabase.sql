-- initPhotoLabDatabase.sql
-- Description: Initializes the full MSSQL schema for PhotoLab, including all core tables and a super admin user.
-- Usage: Run this script in SQL Server Management Studio or with sqlcmd after creating your database.

-- USERS TABLE
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

-- STUDIOS TABLE
IF OBJECT_ID('studios', 'U') IS NULL
BEGIN
    CREATE TABLE studios (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        email NVARCHAR(255),
        public_slug NVARCHAR(255) UNIQUE,
        subscription_plan NVARCHAR(100),
        subscription_status NVARCHAR(50),
        subscription_start DATETIME2,
        subscription_end DATETIME2,
        stripe_customer_id NVARCHAR(255),
        stripe_subscription_id NVARCHAR(255),
        fee_type NVARCHAR(50),
        fee_value DECIMAL(18,2),
        billing_cycle NVARCHAR(50),
        is_free_subscription BIT DEFAULT 0,
        cancellation_requested BIT DEFAULT 0,
        cancellation_date DATETIME2,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    );
END
GO

-- PROFILE CONFIG TABLE
IF OBJECT_ID('profile_config', 'U') IS NULL
BEGIN
    CREATE TABLE profile_config (
        id INT PRIMARY KEY,
        owner_name NVARCHAR(255),
        business_name NVARCHAR(255),
        email NVARCHAR(255),
        receive_order_notifications BIT DEFAULT 1,
        logo_url NVARCHAR(512)
    );
END
GO

-- SUPER PRICE LISTS TABLE
IF OBJECT_ID('super_price_lists', 'U') IS NULL
BEGIN
    CREATE TABLE super_price_lists (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(1000),
        is_active BIT DEFAULT 1,
        category_image_url NVARCHAR(512),
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    );
END
GO

-- SUPER PRICE LIST ITEMS TABLE
IF OBJECT_ID('super_price_list_items', 'U') IS NULL
BEGIN
    CREATE TABLE super_price_list_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        super_price_list_id INT NOT NULL,
        product_code NVARCHAR(100) NOT NULL,
        product_name NVARCHAR(255),
        base_price DECIMAL(18,2),
        suggested_price DECIMAL(18,2),
        image_url NVARCHAR(512),
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (super_price_list_id) REFERENCES super_price_lists(id)
    );
END
GO

-- STUDIO PRICE LISTS TABLE
IF OBJECT_ID('studio_price_lists', 'U') IS NULL
BEGIN
    CREATE TABLE studio_price_lists (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        super_price_list_id INT NOT NULL,
        name NVARCHAR(255),
        is_active BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (studio_id) REFERENCES studios(id),
        FOREIGN KEY (super_price_list_id) REFERENCES super_price_lists(id)
    );
END
GO

-- STUDIO PRICE LIST ITEMS TABLE
IF OBJECT_ID('studio_price_list_items', 'U') IS NULL
BEGIN
    CREATE TABLE studio_price_list_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_price_list_id INT NOT NULL,
        product_code NVARCHAR(100) NOT NULL,
        product_name NVARCHAR(255),
        price DECIMAL(18,2),
        image_url NVARCHAR(512),
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (studio_price_list_id) REFERENCES studio_price_lists(id)
    );
END
GO

-- TICKETS TABLE
IF OBJECT_ID('tickets', 'U') IS NULL
BEGIN
    CREATE TABLE tickets (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        studio_id INT,
        subject NVARCHAR(255) NOT NULL,
        body NVARCHAR(MAX),
        status NVARCHAR(50) DEFAULT 'open',
        unread BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (studio_id) REFERENCES studios(id)
    );
END
GO

-- TICKET REPLIES TABLE
IF OBJECT_ID('ticket_replies', 'U') IS NULL
BEGIN
    CREATE TABLE ticket_replies (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ticket_id INT NOT NULL,
        user_id INT NOT NULL,
        body NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
END
GO

-- ALBUMS TABLE
IF OBJECT_ID('albums', 'U') IS NULL
BEGIN
    CREATE TABLE albums (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(1000),
        cover_image_url NVARCHAR(512),
        cover_photo_id INT,
        photo_count INT DEFAULT 0,
        category NVARCHAR(255),
        price_list_id INT,
        is_password_protected BIT DEFAULT 0,
        password NVARCHAR(255),
        password_hint NVARCHAR(255),
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (studio_id) REFERENCES studios(id)
    );
END
GO

-- PHOTOS TABLE
IF OBJECT_ID('photos', 'U') IS NULL
BEGIN
    CREATE TABLE photos (
        id INT IDENTITY(1,1) PRIMARY KEY,
        album_id INT NOT NULL,
        thumbnail_url NVARCHAR(512),
        full_image_url NVARCHAR(512),
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (album_id) REFERENCES albums(id)
    );
END
GO

-- SHIPPING CONFIG TABLE
IF OBJECT_ID('shipping_config', 'U') IS NULL
BEGIN
    CREATE TABLE shipping_config (
        id INT PRIMARY KEY,
        is_active BIT DEFAULT 0,
        batch_deadline DATETIME2
    );
END
GO

-- USER CART TABLE
IF OBJECT_ID('user_cart', 'U') IS NULL
BEGIN
    CREATE TABLE user_cart (
        user_id INT PRIMARY KEY,
        cart_data NVARCHAR(MAX),
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
END
GO

-- SUBSCRIPTION PLANS TABLE
IF OBJECT_ID('subscription_plans', 'U') IS NULL
BEGIN
    CREATE TABLE subscription_plans (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(1000),
        monthly_price DECIMAL(18,2),
        yearly_price DECIMAL(18,2),
        max_albums INT,
        max_storage_gb INT,
        features NVARCHAR(MAX),
        stripe_monthly_price_id NVARCHAR(255),
        stripe_yearly_price_id NVARCHAR(255),
        is_active BIT DEFAULT 1
    );
END
GO

-- STRIPE CONFIG TABLE
IF OBJECT_ID('stripe_config', 'U') IS NULL
BEGIN
    CREATE TABLE stripe_config (
        id INT PRIMARY KEY,
        publishable_key NVARCHAR(255),
        secret_key NVARCHAR(255),
        is_live_mode BIT DEFAULT 0,
        is_active BIT DEFAULT 1,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    );
END
GO

-- Insert super user if not exists
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

-- Output super user
SELECT * FROM users WHERE email = 'bcampea@gmail.com';
GO

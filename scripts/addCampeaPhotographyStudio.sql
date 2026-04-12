-- addCampeaPhotographyStudio.sql
-- Description: Adds the Campea Photography studio and links it to the bcampea@gmail.com super admin account.
-- Usage: Run this script in SQL Server Management Studio or with sqlcmd after initializing your database.

-- 1. Get the user ID for the super admin
-- Ensure users table has studio_id column
IF COL_LENGTH('users', 'studio_id') IS NULL
BEGIN
    ALTER TABLE users ADD studio_id INT NULL;
END

DECLARE @SuperAdminId INT;
SELECT @SuperAdminId = id FROM users WHERE email = 'bcampea@gmail.com';

IF @SuperAdminId IS NULL
BEGIN
    RAISERROR('Super admin user bcampea@gmail.com not found.', 16, 1);
    RETURN;
END

-- 2. Insert the Campea Photography studio if it does not exist
DECLARE @StudioId INT;
SELECT @StudioId = id FROM studios WHERE name = 'Campea Photography';

IF @StudioId IS NULL
BEGIN
    INSERT INTO studios (name, email, public_slug, created_at)
    VALUES ('Campea Photography', 'info@campeaphotography.com', 'campea-photography', CURRENT_TIMESTAMP);
    SET @StudioId = SCOPE_IDENTITY();
END

-- 3. Link the super admin to the studio (update studio_id on user)
UPDATE users SET studio_id = @StudioId WHERE id = @SuperAdminId;

-- 4. Output the result
SELECT * FROM studios WHERE id = @StudioId;
SELECT * FROM users WHERE id = @SuperAdminId;

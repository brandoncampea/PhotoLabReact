import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;

    await query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'scheduling_session_types')
      CREATE TABLE scheduling_session_types (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX),
        duration_minutes INT NOT NULL DEFAULT 60,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_sst_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
      )
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'scheduling_availability')
      CREATE TABLE scheduling_availability (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        session_type_id INT,
        slot_date DATE NOT NULL,
        start_time NVARCHAR(10) NOT NULL,
        end_time NVARCHAR(10) NOT NULL,
        location NVARCHAR(500),
        staff_name NVARCHAR(255),
        max_bookings INT NOT NULL DEFAULT 1,
        notes NVARCHAR(MAX),
        is_active BIT NOT NULL DEFAULT 1,
        buffer_before_minutes INT NOT NULL DEFAULT 0,
        buffer_after_minutes INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_sa_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE NO ACTION,
        CONSTRAINT FK_sa_session_type FOREIGN KEY (session_type_id) REFERENCES scheduling_session_types(id) ON DELETE NO ACTION
      )
    `);
    await query(`IF COL_LENGTH('scheduling_availability', 'buffer_before_minutes') IS NULL ALTER TABLE scheduling_availability ADD buffer_before_minutes INT NOT NULL DEFAULT 0`);
    await query(`IF COL_LENGTH('scheduling_availability', 'buffer_after_minutes') IS NULL ALTER TABLE scheduling_availability ADD buffer_after_minutes INT NOT NULL DEFAULT 0`);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'scheduling_bookings')
      CREATE TABLE scheduling_bookings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        studio_id INT NOT NULL,
        availability_id INT,
        session_type_id INT,
        customer_user_id INT,
        customer_name NVARCHAR(255) NOT NULL,
        customer_email NVARCHAR(255) NOT NULL,
        customer_phone NVARCHAR(50),
        customer_notes NVARCHAR(MAX),
        status NVARCHAR(50) NOT NULL DEFAULT 'pending',
        requires_payment BIT NOT NULL DEFAULT 0,
        payment_amount DECIMAL(10,2),
        stripe_checkout_session_id NVARCHAR(255),
        payment_intent_id NVARCHAR(255),
        payment_status NVARCHAR(50),
        stripe_fee_amount DECIMAL(10,2),
        platform_fee_amount DECIMAL(10,2),
        studio_payout_amount DECIMAL(10,2),
        rejection_reason NVARCHAR(MAX),
        approved_at DATETIME,
        rejected_at DATETIME,
        cancelled_at DATETIME,
        booking_start_time NVARCHAR(10),
        booking_end_time NVARCHAR(10),
        manual_date DATE,
        manual_start_time NVARCHAR(10),
        manual_end_time NVARCHAR(10),
        manual_location NVARCHAR(500),
        manual_staff_name NVARCHAR(255),
        created_at DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_sb_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE NO ACTION,
        CONSTRAINT FK_sb_availability FOREIGN KEY (availability_id) REFERENCES scheduling_availability(id) ON DELETE NO ACTION,
        CONSTRAINT FK_sb_session_type FOREIGN KEY (session_type_id) REFERENCES scheduling_session_types(id) ON DELETE NO ACTION,
        CONSTRAINT FK_sb_customer FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE NO ACTION
      )
    `);
    await query(`IF COL_LENGTH('scheduling_bookings', 'booking_start_time') IS NULL ALTER TABLE scheduling_bookings ADD booking_start_time NVARCHAR(10)`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'booking_end_time') IS NULL ALTER TABLE scheduling_bookings ADD booking_end_time NVARCHAR(10)`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'manual_date') IS NULL ALTER TABLE scheduling_bookings ADD manual_date DATE`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'manual_start_time') IS NULL ALTER TABLE scheduling_bookings ADD manual_start_time NVARCHAR(10)`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'manual_end_time') IS NULL ALTER TABLE scheduling_bookings ADD manual_end_time NVARCHAR(10)`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'manual_location') IS NULL ALTER TABLE scheduling_bookings ADD manual_location NVARCHAR(500)`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'manual_staff_name') IS NULL ALTER TABLE scheduling_bookings ADD manual_staff_name NVARCHAR(255)`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'source') IS NULL ALTER TABLE scheduling_bookings ADD source NVARCHAR(20)`);
    await query(`IF COL_LENGTH('scheduling_bookings', 'session_type_name_text') IS NULL ALTER TABLE scheduling_bookings ADD session_type_name_text NVARCHAR(255)`);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'scheduling_fee_config')
      CREATE TABLE scheduling_fee_config (
        id INT IDENTITY(1,1) PRIMARY KEY,
        fee_type NVARCHAR(20) NOT NULL DEFAULT 'percentage',
        fee_value DECIMAL(10,4) NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT GETDATE(),
        updated_by INT,
        CONSTRAINT FK_sfc_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE NO ACTION
      )
    `);

    console.log('[startup] Ensured scheduling tables exist');
  } catch (err) {
    console.error('[startup] Failed to ensure scheduling tables:', err);
  }
})();

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query, tableExists } = mssql;
    const exists = await tableExists('profile_config');

    if (!exists) {
      await query(`
        CREATE TABLE profile_config (
          id INT PRIMARY KEY,
          studio_id INT NULL,
          owner_name NVARCHAR(255) NULL,
          business_name NVARCHAR(255) NULL,
          email NVARCHAR(255) NULL,
          receive_order_notifications BIT DEFAULT 1,
          logo_url NVARCHAR(MAX) NULL,
          instagram_url NVARCHAR(500) NULL,
          facebook_url NVARCHAR(500) NULL,
          timezone NVARCHAR(100) NULL,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='studio_id') ALTER TABLE profile_config ADD studio_id INT NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='instagram_url') ALTER TABLE profile_config ADD instagram_url NVARCHAR(500) NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='facebook_url') ALTER TABLE profile_config ADD facebook_url NVARCHAR(500) NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='timezone') ALTER TABLE profile_config ADD timezone NVARCHAR(100) NULL`);
      await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='custom_domain') ALTER TABLE profile_config ADD custom_domain NVARCHAR(255) NULL`);

      // Drop legacy CHECK constraints (e.g. id=1 constraint from old schema)
      await query(`
        DECLARE @sql NVARCHAR(MAX) = N'';
        SELECT @sql = @sql + N'ALTER TABLE profile_config DROP CONSTRAINT [' + cc.name + N'];'
        FROM sys.check_constraints cc
        WHERE cc.parent_object_id = OBJECT_ID('profile_config');
        IF LEN(@sql) > 0 EXEC sp_executesql @sql;
      `);

      await query(`UPDATE profile_config SET studio_id = 1 WHERE studio_id IS NULL AND id = 1`);
    }

    await query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'uq_profile_config_studio_id'
          AND object_id = OBJECT_ID('profile_config')
      )
      BEGIN
        CREATE UNIQUE INDEX uq_profile_config_studio_id
        ON profile_config(studio_id)
        WHERE studio_id IS NOT NULL
      END
    `);

    console.log('[startup] profile_config schema migrations complete');
  } catch (err) {
    console.error('[startup] Failed to run profile_config schema migrations:', err);
  }
})();

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;

    await query(`
      IF COL_LENGTH('albums', 'published') IS NULL
        ALTER TABLE albums ADD published BIT NOT NULL CONSTRAINT DF_albums_published DEFAULT 1;
    `);
    await query(`
      IF COL_LENGTH('albums', 'hidden') IS NULL
        ALTER TABLE albums ADD hidden BIT NOT NULL CONSTRAINT DF_albums_hidden DEFAULT 0;
    `);
    await query(`UPDATE albums SET published = 1 WHERE published IS NULL;`);
    await query(`UPDATE albums SET hidden = 0 WHERE hidden IS NULL;`);

    await query(`
      IF COL_LENGTH('albums', 'batch_shipping_active') IS NULL
        ALTER TABLE albums ADD batch_shipping_active BIT NOT NULL CONSTRAINT DF_albums_batch_shipping_active DEFAULT 0;
    `);

    await query(`
      IF COL_LENGTH('albums', 'album_purchase_enabled') IS NULL
        ALTER TABLE albums ADD album_purchase_enabled BIT NOT NULL CONSTRAINT DF_albums_album_purchase_enabled DEFAULT 1;
    `);

    await query(`
      IF COL_LENGTH('albums', 'school_tags') IS NULL
        ALTER TABLE albums ADD school_tags NVARCHAR(2000) NULL;
    `);

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_school_roster')
      BEGIN
        CREATE TABLE studio_school_roster (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL,
          school_name NVARCHAR(255) NOT NULL,
          school_type NVARCHAR(100) NULL,
          source_album_id INT NULL,
          created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
          updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
        );
      END
    `);

    await query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'IX_studio_school_roster_studio_name'
          AND object_id = OBJECT_ID('studio_school_roster')
      )
      BEGIN
        CREATE INDEX IX_studio_school_roster_studio_name
        ON studio_school_roster (studio_id, school_name);
      END
    `);

    console.log('[startup] Album schema migrations complete');
  } catch (err) {
    console.error('[startup] Failed to run album schema migrations:', err);
  }
})();

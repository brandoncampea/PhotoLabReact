import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;

    // photos table columns
    await query(`
      IF COL_LENGTH('photos', 'width') IS NULL
        ALTER TABLE photos ADD width INT NULL;
      IF COL_LENGTH('photos', 'height') IS NULL
        ALTER TABLE photos ADD height INT NULL;
      IF COL_LENGTH('photos', 'file_size_bytes') IS NULL
        ALTER TABLE photos ADD file_size_bytes BIGINT NULL;
      IF COL_LENGTH('photos', 'player_names') IS NULL
        ALTER TABLE photos ADD player_names NVARCHAR(MAX) NULL;
      IF COL_LENGTH('photos', 'player_numbers') IS NULL
        ALTER TABLE photos ADD player_numbers NVARCHAR(255) NULL;
      IF COL_LENGTH('photos', 'detected_numbers') IS NULL
        ALTER TABLE photos ADD detected_numbers NVARCHAR(MAX) NULL;
      IF COL_LENGTH('photos', 'detected_numbers_updated_at') IS NULL
        ALTER TABLE photos ADD detected_numbers_updated_at DATETIME2 NULL;
    `);

    // studio_player_roster table
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_player_roster')
      BEGIN
        CREATE TABLE studio_player_roster (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL,
          player_name NVARCHAR(255) NOT NULL,
          player_number NVARCHAR(64) NULL,
          roster_name NVARCHAR(255) NULL,
          source_album_id INT NULL,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);
    await query(`
      IF COL_LENGTH('studio_player_roster', 'roster_name') IS NULL
        ALTER TABLE studio_player_roster ADD roster_name NVARCHAR(255) NULL;
      IF COL_LENGTH('studio_player_roster', 'source_album_id') IS NULL
        ALTER TABLE studio_player_roster ADD source_album_id INT NULL;
    `);

    // studio_player_face_signatures table
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_player_face_signatures')
      BEGIN
        CREATE TABLE studio_player_face_signatures (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL,
          player_name NVARCHAR(255) NOT NULL,
          player_number NVARCHAR(64) NULL,
          signature_hash NVARCHAR(128) NOT NULL,
          source_photo_id INT NULL,
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    // photo_tag_suggestions table
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'photo_tag_suggestions')
      BEGIN
        CREATE TABLE photo_tag_suggestions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL,
          album_id INT NOT NULL,
          photo_id INT NOT NULL,
          player_name NVARCHAR(255) NOT NULL,
          status NVARCHAR(32) NOT NULL CONSTRAINT DF_photo_tag_suggestions_status DEFAULT 'pending',
          submitted_by_user_id INT NULL,
          submitted_by_name NVARCHAR(255) NULL,
          submitted_at DATETIME2 NOT NULL CONSTRAINT DF_photo_tag_suggestions_submitted_at DEFAULT GETDATE(),
          reviewed_by_user_id INT NULL,
          reviewed_at DATETIME2 NULL,
          review_note NVARCHAR(500) NULL
        )
      END
    `);
    await query(`
      IF COL_LENGTH('photo_tag_suggestions', 'studio_id') IS NULL
        ALTER TABLE photo_tag_suggestions ADD studio_id INT NOT NULL DEFAULT 0;
    `);

    console.log('[startup] Photo schema migrations complete');
  } catch (err) {
    console.error('[startup] Failed to run photo schema migrations:', err);
  }
})();

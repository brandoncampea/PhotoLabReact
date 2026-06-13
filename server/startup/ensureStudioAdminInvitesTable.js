import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;

    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_admin_invites')
      BEGIN
        CREATE TABLE studio_admin_invites (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL,
          email NVARCHAR(255) NOT NULL,
          name NVARCHAR(255) NULL,
          token NVARCHAR(128) NOT NULL,
          invited_by INT NULL,
          expires_at DATETIME2 NOT NULL,
          accepted_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL CONSTRAINT DF_studio_admin_invites_created_at DEFAULT GETDATE(),
          CONSTRAINT FK_studio_admin_invites_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
          CONSTRAINT FK_studio_admin_invites_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE NO ACTION
        )
      END
    `);

    await query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UX_studio_admin_invites_token'
          AND object_id = OBJECT_ID('studio_admin_invites')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_studio_admin_invites_token ON studio_admin_invites(token)
      END
    `);

    await query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'IX_studio_admin_invites_studio_email'
          AND object_id = OBJECT_ID('studio_admin_invites')
      )
      BEGIN
        CREATE INDEX IX_studio_admin_invites_studio_email ON studio_admin_invites(studio_id, email)
      END
    `);

    console.log('[startup] Ensured studio_admin_invites table exists');
  } catch (err) {
    console.error('[startup] Failed to ensure studio_admin_invites table:', err);
  }
})();

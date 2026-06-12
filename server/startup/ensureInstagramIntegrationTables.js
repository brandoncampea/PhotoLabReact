// Run this script at server startup to ensure Instagram/social integration tables exist

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;

    // Studio-level social integration credentials/state (per studio, per provider)
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_social_integrations')
      BEGIN
        CREATE TABLE studio_social_integrations (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL,
          provider NVARCHAR(50) NOT NULL,
          provider_user_id NVARCHAR(255) NULL,
          instagram_user_id NVARCHAR(255) NULL,
          facebook_page_id NVARCHAR(255) NULL,
          access_token_encrypted NVARCHAR(MAX) NULL,
          refresh_token_encrypted NVARCHAR(MAX) NULL,
          token_expires_at DATETIME2 NULL,
          scopes NVARCHAR(MAX) NULL,
          status NVARCHAR(32) NOT NULL CONSTRAINT DF_studio_social_integrations_status DEFAULT 'disconnected',
          connected_at DATETIME2 NULL,
          last_synced_at DATETIME2 NULL,
          last_error NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL CONSTRAINT DF_studio_social_integrations_created_at DEFAULT GETDATE(),
          updated_at DATETIME2 NOT NULL CONSTRAINT DF_studio_social_integrations_updated_at DEFAULT GETDATE(),
          CONSTRAINT FK_studio_social_integrations_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
        )
      END
    `);

    await query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_studio_social_integrations_studio_provider'
          AND object_id = OBJECT_ID('studio_social_integrations')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_studio_social_integrations_studio_provider
        ON studio_social_integrations(studio_id, provider)
      END
    `);

    // Publish jobs represent each publish attempt (request -> result)
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'social_publish_jobs')
      BEGIN
        CREATE TABLE social_publish_jobs (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL,
          provider NVARCHAR(50) NOT NULL CONSTRAINT DF_social_publish_jobs_provider DEFAULT 'instagram',
          integration_id INT NULL,
          requested_by_user_id INT NULL,
          status NVARCHAR(32) NOT NULL CONSTRAINT DF_social_publish_jobs_status DEFAULT 'queued',
          caption NVARCHAR(MAX) NULL,
          payload_json NVARCHAR(MAX) NULL,
          provider_publish_id NVARCHAR(255) NULL,
          provider_permalink NVARCHAR(MAX) NULL,
          error_message NVARCHAR(MAX) NULL,
          requested_at DATETIME2 NOT NULL CONSTRAINT DF_social_publish_jobs_requested_at DEFAULT GETDATE(),
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL CONSTRAINT DF_social_publish_jobs_created_at DEFAULT GETDATE(),
          updated_at DATETIME2 NOT NULL CONSTRAINT DF_social_publish_jobs_updated_at DEFAULT GETDATE(),
          CONSTRAINT FK_social_publish_jobs_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
          CONSTRAINT FK_social_publish_jobs_integration FOREIGN KEY (integration_id) REFERENCES studio_social_integrations(id) ON DELETE NO ACTION
        )
      END
    `);

    await query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_social_publish_jobs_studio_status_requested_at'
          AND object_id = OBJECT_ID('social_publish_jobs')
      )
      BEGIN
        CREATE INDEX IX_social_publish_jobs_studio_status_requested_at
        ON social_publish_jobs(studio_id, status, requested_at DESC)
      END
    `);

    // Individual media items for each publish job
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'social_publish_job_items')
      BEGIN
        CREATE TABLE social_publish_job_items (
          id INT IDENTITY(1,1) PRIMARY KEY,
          job_id INT NOT NULL,
          studio_id INT NOT NULL,
          photo_id INT NULL,
          sort_order INT NOT NULL,
          source_url NVARCHAR(MAX) NULL,
          provider_media_container_id NVARCHAR(255) NULL,
          status NVARCHAR(32) NOT NULL CONSTRAINT DF_social_publish_job_items_status DEFAULT 'queued',
          error_message NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL CONSTRAINT DF_social_publish_job_items_created_at DEFAULT GETDATE(),
          updated_at DATETIME2 NOT NULL CONSTRAINT DF_social_publish_job_items_updated_at DEFAULT GETDATE(),
          CONSTRAINT FK_social_publish_job_items_job FOREIGN KEY (job_id) REFERENCES social_publish_jobs(id) ON DELETE CASCADE,
          CONSTRAINT FK_social_publish_job_items_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE NO ACTION,
          CONSTRAINT FK_social_publish_job_items_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE NO ACTION
        )
      END
    `);

    await query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_social_publish_job_items_job_sort_order'
          AND object_id = OBJECT_ID('social_publish_job_items')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_social_publish_job_items_job_sort_order
        ON social_publish_job_items(job_id, sort_order)
      END
    `);

    console.log('[startup] Ensured Instagram/social integration tables exist');
  } catch (err) {
    console.error('[startup] Failed to ensure Instagram/social integration tables:', err);
  }
})();

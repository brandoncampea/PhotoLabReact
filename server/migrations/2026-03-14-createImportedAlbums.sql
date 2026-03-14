-- Create table for persistent SmugMug album import tracking
CREATE TABLE ImportedAlbums (
  id INT IDENTITY(1,1) PRIMARY KEY,
  studioId INT NOT NULL,
  albumKey NVARCHAR(128) NOT NULL,
  importedAt DATETIME NOT NULL DEFAULT GETDATE(),
  jobId NVARCHAR(64) NULL,
  status NVARCHAR(32) NOT NULL DEFAULT 'completed'
);
-- Optional: add index for fast lookup
CREATE INDEX IX_ImportedAlbums_StudioAlbum ON ImportedAlbums(studioId, albumKey);

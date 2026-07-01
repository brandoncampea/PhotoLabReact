-- 2026-06-30-addPhotosAlbumFileIndex.sql
-- Covering index for the album_id + file_name lookup used during imports.
-- INCLUDE (id, width, height) lets the engine satisfy the query entirely
-- from the index leaf pages without touching the base table rows.

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_photos_album_file'
    AND object_id = OBJECT_ID('photos')
)
  CREATE INDEX IX_photos_album_file
    ON photos (album_id, file_name)
    INCLUDE (id, width, height);

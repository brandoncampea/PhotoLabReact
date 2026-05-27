-- Remove duplicate photos in the same album (keep the most recent by created_at)
-- WARNING: Review before running in production!

WITH ranked AS (
  SELECT 
    id,
    album_id,
    file_name,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY album_id, file_name ORDER BY created_at DESC, id DESC) as rn
  FROM photos
)
DELETE FROM photos WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

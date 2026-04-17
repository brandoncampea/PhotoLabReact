-- Update all thumbnail_url values in the photos table to replace spaces with %20
-- Only affects rows where thumbnail_url contains a space

UPDATE photos
SET thumbnail_url = REPLACE(thumbnail_url, ' ', '%20')
WHERE CHARINDEX(' ', thumbnail_url) > 0;

-- Optional: Preview affected rows before running the update
-- SELECT id, thumbnail_url FROM photos WHERE CHARINDEX(' ', thumbnail_url) > 0;

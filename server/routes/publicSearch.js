import express from 'express';
import { queryRows, columnExists } from '../mssql.js';

const router = express.Router();

const getPhotoAssetUrl = (photoId, variant = 'thumbnail') => `/api/photos/${photoId}/asset?variant=${variant}`;
const getProxySourceUrl = (source) => `/api/photos/proxy?source=${encodeURIComponent(source)}`;
const getInitials = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'S';

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ studios: [], albums: [], photos: [] });
    }

    const searchPattern = `%${q}%`;
    const hasPublicSlug = await columnExists('studios', 'public_slug');

    if (!hasPublicSlug) {
      return res.json({ studios: [], albums: [], photos: [] });
    }

    const [studios, albums, photos] = await Promise.all([
      queryRows(
        `SELECT TOP 8
           id,
           name,
           public_slug as publicSlug
         FROM studios
         WHERE public_slug IS NOT NULL
           AND (
             name LIKE $1
             OR email LIKE $1
             OR public_slug LIKE $1
           )
         ORDER BY name ASC`,
        [searchPattern]
      ),
      queryRows(
        `SELECT TOP 12
           a.id,
           COALESCE(a.name, a.title) as name,
           a.description,
           a.photo_count as photoCount,
           a.cover_photo_id as coverPhotoId,
           a.cover_image_url as coverImageUrl,
           s.name as studioName,
           s.public_slug as studioSlug
         FROM albums a
         INNER JOIN studios s ON s.id = a.studio_id
         WHERE s.public_slug IS NOT NULL
           AND (
             COALESCE(a.name, a.title) LIKE $1
             OR a.description LIKE $1
             OR s.name LIKE $1
           )
         ORDER BY a.created_at DESC`,
        [searchPattern]
      ),
      queryRows(
        `SELECT TOP 20
           p.id,
           p.album_id as albumId,
           p.file_name as fileName,
           p.thumbnail_url as thumbnailUrl,
           p.description,
           COALESCE(a.name, a.title) as albumName,
           s.name as studioName,
           s.public_slug as studioSlug
         FROM photos p
         INNER JOIN albums a ON a.id = p.album_id
         INNER JOIN studios s ON s.id = a.studio_id
         WHERE s.public_slug IS NOT NULL
           AND (
             p.file_name LIKE $1
             OR p.description LIKE $1
             OR p.player_names LIKE $1
             OR COALESCE(a.name, a.title) LIKE $1
             OR s.name LIKE $1
           )
         ORDER BY p.created_at DESC`,
        [searchPattern]
      ),
    ]);

    res.json({
      studios: studios.map((studio) => ({
        id: studio.id,
        name: studio.name,
        initials: getInitials(studio.name),
        publicSlug: studio.publicSlug,
        url: `/s/${studio.publicSlug}`,
      })),
      albums: albums.map((album) => ({
        id: album.id,
        name: album.name,
        description: album.description,
        photoCount: Number(album.photoCount) || 0,
        studioName: album.studioName,
        studioSlug: album.studioSlug,
        coverImageUrl: album.coverPhotoId
          ? getPhotoAssetUrl(album.coverPhotoId, 'thumbnail')
          : album.coverImageUrl
            ? getProxySourceUrl(album.coverImageUrl)
            : null,
        url: `/s/${album.studioSlug}/albums/${album.id}`,
      })),
      photos: photos.map((photo) => ({
        id: photo.id,
        fileName: photo.fileName,
        description: photo.description,
        thumbnailUrl: photo.thumbnailUrl,
        albumId: photo.albumId,
        albumName: photo.albumName,
        studioName: photo.studioName,
        studioSlug: photo.studioSlug,
        thumbnailUrl: photo.id ? getPhotoAssetUrl(photo.id, 'thumbnail') : photo.thumbnailUrl,
        url: `/s/${photo.studioSlug}/albums/${photo.albumId}?photo=${photo.id}`,
      })),
    });
  } catch (error) {
    console.error('Public search error:', error);
    res.status(500).json({ error: 'Failed to run public search' });
  }
});

export default router;

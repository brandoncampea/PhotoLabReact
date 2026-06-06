import jwt from 'jsonwebtoken';

const PHOTO_ASSET_TOKEN_SECRET = String(
  process.env.PHOTO_ASSET_TOKEN_SECRET ||
  process.env.DOWNLOAD_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  'photo-lab-photo-asset-secret'
);

const normalizePhotoAssetVariant = (variant) => {
  const value = String(variant || 'full').toLowerCase();
  return value === 'thumb' || value === 'thumbnail' ? 'thumb' : 'full';
};

export const createPhotoAssetToken = ({ photoId, variant = 'full', purpose = 'app', expiresIn = '7d' }) => {
  const normalizedPhotoId = Number(photoId);
  if (!Number.isInteger(normalizedPhotoId) || normalizedPhotoId <= 0) {
    throw new Error('Invalid photoId for asset token');
  }

  const normalizedVariant = normalizePhotoAssetVariant(variant);
  return jwt.sign(
    {
      scope: 'photo-asset',
      photoId: normalizedPhotoId,
      variant: normalizedVariant,
      purpose: String(purpose || 'app'),
    },
    PHOTO_ASSET_TOKEN_SECRET,
    { expiresIn }
  );
};

export const verifyPhotoAssetToken = (token) => jwt.verify(String(token || ''), PHOTO_ASSET_TOKEN_SECRET);

export const buildSignedPhotoAssetUrl = (photoId, variant = 'full', purpose = 'app', expiresIn = '7d') => {
  const normalizedPhotoId = Number(photoId);
  if (!Number.isInteger(normalizedPhotoId) || normalizedPhotoId <= 0) {
    return '';
  }

  const normalizedVariant = normalizePhotoAssetVariant(variant);
  const token = createPhotoAssetToken({ photoId: normalizedPhotoId, variant: normalizedVariant, purpose, expiresIn });
  return `/api/photos/${normalizedPhotoId}/asset?variant=${normalizedVariant}&asset_token=${encodeURIComponent(token)}`;
};

export { PHOTO_ASSET_TOKEN_SECRET, normalizePhotoAssetVariant };

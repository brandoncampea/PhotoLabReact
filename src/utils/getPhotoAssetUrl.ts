// Centralized utility for getting the canonical asset URL for a photo
// Always prefer /api/photos/{photoId}/asset if photoId is present

export function getPhotoAssetUrl(photo: { photoId?: number; id?: number; fullImageUrl?: string; }, variant: 'thumb' | 'full' = 'thumb') {
  const id = photo.photoId || photo.id;
  if (id) {
    return `/api/photos/${id}/asset?variant=${variant}`;
  }
  if (photo.fullImageUrl) {
    return photo.fullImageUrl;
  }
  return '';
}

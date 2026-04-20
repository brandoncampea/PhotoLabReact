// Centralized utility for getting the canonical asset URL for a photo
// Always prefer /api/photos/{photoId}/asset if photoId is present

export function getPhotoAssetUrl(photo: { photoId?: number; id?: number; fullImageUrl?: string; }) {
  const id = photo.photoId || photo.id;
  if (id) {
    return `/api/photos/${id}/asset`;
  }
  if (photo.fullImageUrl) {
    return photo.fullImageUrl;
  }
  return '';
}

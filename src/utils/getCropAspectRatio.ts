// Centralized crop aspect ratio utility
// Handles orientation swap logic for photo vs product size

export function getCropAspectRatioForPhotoAndProduct({
  photoWidth,
  photoHeight,
  productWidth,
  productHeight
}: {
  photoWidth: number;
  photoHeight: number;
  productWidth: number;
  productHeight: number;
}): number {
  let width = productWidth;
  let height = productHeight;
  const photoIsLandscape = photoWidth > photoHeight;
  const sizeIsLandscape = productWidth > productHeight;
  if (photoIsLandscape !== sizeIsLandscape) {
    [width, height] = [height, width];
  }
  if (width > 0 && height > 0) {
    return width / height;
  }
  return NaN;
}

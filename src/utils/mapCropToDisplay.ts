// Shared utility to map crop rectangle from original image to displayed (drawn) image coordinates
// Handles letterboxing (objectFit: contain) and returns overlay box in display coordinates

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function mapCropToDisplay({
  crop,
  originalWidth,
  originalHeight,
  displayWidth,
  displayHeight,
}: {
  crop: CropBox;
  originalWidth: number;
  originalHeight: number;
  displayWidth: number;
  displayHeight: number;
}): CropBox {
  // Letterboxing logic (objectFit: contain)
  const frameAspect = displayWidth / displayHeight;
  const photoAspect = originalWidth / originalHeight;
  let drawnW = displayWidth;
  let drawnH = displayHeight;
  let offsetX = 0;
  let offsetY = 0;
  if (photoAspect > frameAspect) {
    drawnW = displayWidth;
    drawnH = displayWidth / photoAspect;
    offsetY = (displayHeight - drawnH) / 2;
  } else {
    drawnH = displayHeight;
    drawnW = displayHeight * photoAspect;
    offsetX = (displayWidth - drawnW) / 2;
  }
  const scaleX = drawnW / originalWidth;
  const scaleY = drawnH / originalHeight;
  return {
    x: offsetX + crop.x * scaleX,
    y: offsetY + crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

// Also provide the inverse: map from display back to original image coordinates
export function mapCropToOriginal({
  crop,
  originalWidth,
  originalHeight,
  displayWidth,
  displayHeight,
}: {
  crop: CropBox;
  originalWidth: number;
  originalHeight: number;
  displayWidth: number;
  displayHeight: number;
}): CropBox {
  const frameAspect = displayWidth / displayHeight;
  const photoAspect = originalWidth / originalHeight;
  let drawnW = displayWidth;
  let drawnH = displayHeight;
  let offsetX = 0;
  let offsetY = 0;
  if (photoAspect > frameAspect) {
    drawnW = displayWidth;
    drawnH = displayWidth / photoAspect;
    offsetY = (displayHeight - drawnH) / 2;
  } else {
    drawnH = displayHeight;
    drawnW = displayHeight * photoAspect;
    offsetX = (displayWidth - drawnW) / 2;
  }
  const scaleX = originalWidth / drawnW;
  const scaleY = originalHeight / drawnH;
  return {
    x: (crop.x - offsetX) * scaleX,
    y: (crop.y - offsetY) * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

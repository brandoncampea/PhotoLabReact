// src/utils/whccCrop.ts
import { CropData } from './formatCropData';

export interface WhccCrop {
  X: number; // percent, center of crop (0-100)
  Y: number; // percent, center of crop (0-100)
  ZoomX: number; // percent of source width kept (100 = full width)
  ZoomY: number; // percent of source height kept (100 = full height)
  ImageRotation: 0 | 90;
}

/**
 * Converts app cropData (pixels) to WHCC crop values (percent-based center + retained-size zoom).
 * @param crop CropData (x, y, width, height, rotate, scaleX, scaleY)
 * @param imageWidth original image width in px
 * @param imageHeight original image height in px
 * @returns WhccCrop
 */
export function toWhccCrop(crop: CropData, imageWidth: number, imageHeight: number): WhccCrop {
  // Clamp helper
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  // Center of crop in px
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  // Convert to percent (0-100)
  const X = clamp((centerX / imageWidth) * 100, 0, 100);
  const Y = clamp((centerY / imageHeight) * 100, 0, 100);
  // ZoomX/ZoomY are retained percentages of source image dimensions.
  // 100 = full image (no crop), smaller values = tighter crop.
  const ZoomX = clamp((crop.width / imageWidth) * 100, 0, 100);
  const ZoomY = clamp((crop.height / imageHeight) * 100, 0, 100);
  // WHCC only supports 0 or 90 degree rotation
  let ImageRotation: 0 | 90 = 0;
  if (Math.abs(Math.round(crop.rotate) % 180) === 90) {
    ImageRotation = 90;
  }
  return { X, Y, ZoomX, ZoomY, ImageRotation };
}

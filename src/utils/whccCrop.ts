// src/utils/whccCrop.ts
import { CropData } from './formatCropData';

export interface WhccCrop {
  X: number; // percent, center of crop (0-100)
  Y: number; // percent, center of crop (0-100)
  ZoomX: number; // percent, 100 = fit
  ZoomY: number; // percent, 100 = fit
  ImageRotation: 0 | 90;
}

/**
 * Converts app cropData (pixels) to WHCC crop values (percent-based, center, zoom, rotation).
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
  // Zoom: 100 = fit, >100 = zoomed in
  const ZoomX = clamp((imageWidth / crop.width) * 100, 1, 1000);
  const ZoomY = clamp((imageHeight / crop.height) * 100, 1, 1000);
  // WHCC only supports 0 or 90 degree rotation
  let ImageRotation: 0 | 90 = 0;
  if (Math.abs(Math.round(crop.rotate) % 180) === 90) {
    ImageRotation = 90;
  }
  return { X, Y, ZoomX, ZoomY, ImageRotation };
}

// src/utils/formatCropData.ts
export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Formats crop data from the cropper, rounding values and preserving scale/zoom.
 * Accepts any object with x, y, width, height, scaleX, scaleY, rotate fields.
 */
export function formatCropData(data: any): CropData {
  return {
    x: Math.round(data.x),
    y: Math.round(data.y),
    width: Math.round(data.width),
    height: Math.round(data.height),
    rotate: typeof data.rotate === 'number' ? data.rotate : 0,
    scaleX: typeof data.scaleX === 'number' ? data.scaleX : 1,
    scaleY: typeof data.scaleY === 'number' ? data.scaleY : 1,
  };
}

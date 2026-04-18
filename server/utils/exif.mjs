// exif.js - Node.js EXIF utility for backend
// This is a placeholder. Replace with real EXIF extraction logic as needed.

// ES module export for compatibility with import { extractImageMetadata } from '../utils/exif.js';
import exifr from 'exifr';

// Extracts EXIF and image metadata using exifr and maps to required fields
export async function extractImageMetadata(fileBuffer) {
  try {
    const exif = await exifr.parse(fileBuffer, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: true,
      jfif: true,
      ihdr: true,
      image: true,
      all: true,
    });

    // Fallback to sharp for width/height if missing
    let width = exif?.ImageWidth || null;
    let height = exif?.ImageHeight || null;
    if (!width || !height) {
      try {
        const sharp = (await import('sharp')).default;
        const meta = await sharp(fileBuffer).metadata();
        width = meta.width || width;
        height = meta.height || height;
      } catch (sharpErr) {
        // ignore sharp errors, fallback to null
      }
    }

    return {
      keywords: exif?.Keywords || exif?.keywords || exif?.Subject || null,
      dimensions: width && height ? `${width}x${height}` : null,
      deviceMake: exif?.Make || null,
      deviceModel: exif?.Model || null,
      colorSpace: exif?.ColorSpace || null,
      colorProfile: exif?.ICCProfileName || exif?.ProfileDescription || null,
      focalLength: exif?.FocalLength ? `${exif.FocalLength} mm` : null,
      description: exif?.ImageDescription || exif?.Description || null,
      alphaChannel: exif?.AlphaChannel !== undefined ? (exif.AlphaChannel ? 'Yes' : 'No') : null,
      redEye: exif?.RedEyeReduction !== undefined ? (exif.RedEyeReduction ? 'Yes' : 'No') : null,
      meteringMode: exif?.MeteringMode || null,
      fNumber: exif?.FNumber ? `f/${exif.FNumber}` : null,
      exposureProgram: exif?.ExposureProgram || null,
      exposureTime: exif?.ExposureTime ? `1/${Math.round(1/exif.ExposureTime)}` : null,
      headline: exif?.Headline || null,
      city: exif?.City || exif?.LocationCreated?.City || null,
      stateOrProvince: exif?.ProvinceState || exif?.LocationCreated?.ProvinceState || null,
      // Additional useful fields
      iso: exif?.ISO || exif?.ISOSetting || null,
      dateTaken: exif?.DateTimeOriginal || exif?.CreateDate || null,
      width,
      height,
      fileSize: fileBuffer?.length || null,
    };
  } catch (err) {
    return {};
  }
}

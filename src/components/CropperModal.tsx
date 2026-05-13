import { getPhotoAssetUrl } from '../utils/getPhotoAssetUrl';
import SharedCropper from './SharedCropper';
import { useCart } from '../contexts/CartContext';
import React from 'react';

export type CropperModalProps = {
  item: any;
  onClose: () => void;
};

export default function CropperModal({ item, onClose }: CropperModalProps) {
  const { updateCropData } = useCart();
  const photo = item.photo || item;
  // Use the same logic as MultiPhotoSelector for aspect ratio
  const originalWidth = Number(photo.width || 0);
  const originalHeight = Number(photo.height || 0);
  // If product size info is available, use it for aspect ratio; fallback to photo aspect
  let aspectRatio = 1;
  if (item.productSize && item.productSize.width && item.productSize.height) {
    aspectRatio = item.productSize.width / item.productSize.height;
  } else if (originalWidth && originalHeight) {
    aspectRatio = originalWidth / originalHeight;
  }

  // Use the thumbnail for cropping (faster, matches cart preview)
  const imageUrl = getPhotoAssetUrl(photo, 'thumb');

  // We'll need to know the original and thumbnail sizes
  // Assume photo.width/height is original, and thumbnail is 400x296 (from your logs)
  // Dynamically size the cropper area to match the image aspect ratio and fit modal
  let thumbWidth = 480;
  let thumbHeight = 320;
  if (originalWidth > 0 && originalHeight > 0) {
    const aspect = originalWidth / originalHeight;
    thumbWidth = 480;
    thumbHeight = Math.round(thumbWidth / aspect);
    if (thumbHeight > 400) {
      thumbHeight = 400;
      thumbWidth = Math.round(thumbHeight * aspect);
    }
  }

  // If no cropData, use the full image as the default crop in original coordinates
  let cropData = item?.cropData;
  if (!cropData && originalWidth > 0 && originalHeight > 0) {
    cropData = { x: 0, y: 0, width: originalWidth, height: originalHeight, rotate: 0, scaleX: 1, scaleY: 1 };
  }

  // Scale cropData from original to thumb size, accounting for letterboxing (objectFit: contain)
  let scaledCropData = cropData;
  if (cropData && originalWidth > 0 && originalHeight > 0) {
    // Letterboxing logic
    const thumbAspect = thumbWidth / thumbHeight;
    const photoAspect = originalWidth / originalHeight;
    let drawnW = thumbWidth;
    let drawnH = thumbHeight;
    if (photoAspect > thumbAspect) {
      drawnW = thumbWidth;
      drawnH = thumbWidth / photoAspect;
    } else {
      drawnH = thumbHeight;
      drawnW = thumbHeight * photoAspect;
    }
    const scaleX = drawnW / originalWidth;
    const scaleY = drawnH / originalHeight;
    // If full image crop, set to exactly the image area
    const isFullImageCrop = cropData.x === 0 && cropData.y === 0 && cropData.width === originalWidth && cropData.height === originalHeight;
    if (isFullImageCrop) {
      scaledCropData = {
        x: 0,
        y: 0,
        width: drawnW,
        height: drawnH,
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
      };
    } else {
      scaledCropData = {
        ...cropData,
        x: cropData.x * scaleX,
        y: cropData.y * scaleY,
        width: cropData.width * scaleX,
        height: cropData.height * scaleY,
      };
    }
  }


  // When saving, scale cropData back to original image size
  const handleSave = (cropData: any) => {
    let finalCropData = cropData;
    if (originalWidth > 0 && originalHeight > 0) {
      // cropData is in thumb coordinates, scale up to original
      const scaleX = originalWidth / thumbWidth;
      const scaleY = originalHeight / thumbHeight;
      finalCropData = {
        ...cropData,
        x: cropData.x * scaleX,
        y: cropData.y * scaleY,
        width: cropData.width * scaleX,
        height: cropData.height * scaleY,
      };
    }
    updateCropData(item.photoId, finalCropData, item.productId, item.productSizeId);
    onClose();
  };

  return (
    <div style={{
      width: thumbWidth + 32,
      maxWidth: '100vw',
      background: 'transparent',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxSizing: 'border-box',
      padding: 0
    }}>
      <div style={{
        width: thumbWidth,
        height: thumbHeight,
        background: '#181828',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16,
        boxShadow: '0 2px 16px rgba(0,0,0,0.18)'
      }}>
        <SharedCropper
          imageUrl={imageUrl}
          aspectRatio={aspectRatio}
          initialCropData={scaledCropData}
          onSave={handleSave}
          onCancel={onClose}
          className="cart-cropper-modal"
          showFullPhoto
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, width: thumbWidth, marginTop: 0 }}>
        <button onClick={onClose} className="btn btn-secondary" style={{ minWidth: 100 }}>Cancel</button>
        <button onClick={() => handleSave(scaledCropData)} className="btn btn-primary" style={{ minWidth: 120 }}>✓ Save Crop</button>
      </div>
    </div>
  );
}
      
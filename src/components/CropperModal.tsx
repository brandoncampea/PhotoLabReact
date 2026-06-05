
import React from 'react';
import { getPhotoAssetUrl } from '../utils/getPhotoAssetUrl';
import SharedCropper from './SharedCropper';
import { useCart } from '../contexts/CartContext';
import { mapCropToDisplay, mapCropToOriginal } from '../utils/mapCropToDisplay';

export type CropperModalProps = {
  item: any;
  onClose: () => void;
  displayWidth?: number;
  displayHeight?: number;
};


export default function CropperModal({ item, onClose }: CropperModalProps) {
  const { updateCropData } = useCart();
  const cropperRef = React.useRef<any>(null);
  const handleRotate = () => {
    const cropper = cropperRef.current?.cropper || cropperRef.current;
    if (cropper && typeof cropper.rotate === 'function') {
      cropper.rotate(90);
    }
  };
  const photo = item.photo || item;
  // Use the same logic as MultiPhotoSelector for aspect ratio
  const originalWidth = Number(photo.width || 0);
  const originalHeight = Number(photo.height || 0);
  // If product size info is available, use it for aspect ratio; fallback to photo aspect
  let aspectRatio = 1;
  if (item.productSize && item.productSize.width && item.productSize.height) {
    aspectRatio = item.productSize.width / item.productSize.height;
  } else if (item.productSizeName) {
    // Parse size name like "5x7", "8x10", "4x6" etc. as a fallback
    const sizeMatch = String(item.productSizeName).match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if (sizeMatch) {
      const pw = parseFloat(sizeMatch[1]);
      const ph = parseFloat(sizeMatch[2]);
      if (pw > 0 && ph > 0) {
        // Orient to match photo if dimensions are available
        if (originalWidth > 0 && originalHeight > 0 && (originalWidth > originalHeight) !== (pw > ph)) {
          aspectRatio = ph / pw;
        } else {
          aspectRatio = pw / ph;
        }
      }
    } else if (originalWidth && originalHeight) {
      aspectRatio = originalWidth / originalHeight;
    }
  } else if (originalWidth && originalHeight) {
    aspectRatio = originalWidth / originalHeight;
  }

  // Use the thumbnail for cropping (faster, matches cart preview)
  const imageUrl = getPhotoAssetUrl(photo, 'thumb');

  // We'll need to know the original and thumbnail sizes
  // Assume photo.width/height is original, and thumbnail is 400x296 (from your logs)
  // Dynamically size the cropper area to match the image aspect ratio and fit modal
  // Use passed display size if provided (from CartItem), else fallback to default
  // Use drawnSize from cart if provided, else fallback to aspect ratio logic
  // Always use 400px wide, height auto (preserve aspect ratio)
  let thumbWidth = 400;
  let thumbHeight = 400;
  if (originalWidth > 0 && originalHeight > 0) {
    const aspect = originalWidth / originalHeight;
    thumbHeight = Math.round(thumbWidth / aspect);
  }
  // Debug: log modal cropper size

  // If no cropData, use the full image as the default crop in original coordinates
  let cropData = item?.cropData;
  if (!cropData && originalWidth > 0 && originalHeight > 0) {
    cropData = { x: 0, y: 0, width: originalWidth, height: originalHeight, rotate: 0, scaleX: 1, scaleY: 1 };
  }

  // Map cropData from original image coordinates to modal cropper size
  let scaledCropData = cropData;
  if (cropData && originalWidth > 0 && originalHeight > 0) {
    scaledCropData = mapCropToDisplay({
      crop: cropData,
      originalWidth,
      originalHeight,
      displayWidth: thumbWidth,
      displayHeight: thumbHeight,
    });
    // Debug: log crop mapping in modal
    // Preserve rotate/scaleX/scaleY if present
    scaledCropData = { ...scaledCropData, rotate: cropData.rotate, scaleX: cropData.scaleX, scaleY: cropData.scaleY };
  }


  // When saving, scale cropData back to original image size
  const handleSave = (cropData: any) => {
    let finalCropData = cropData;
    if (originalWidth > 0 && originalHeight > 0) {
      finalCropData = mapCropToOriginal({
        crop: cropData,
        originalWidth,
        originalHeight,
        displayWidth: thumbWidth,
        displayHeight: thumbHeight,
      });
      // Preserve rotate/scaleX/scaleY if present
      finalCropData = { ...finalCropData, rotate: cropData.rotate, scaleX: cropData.scaleX, scaleY: cropData.scaleY };
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
          cropperRefCallback={(ref) => (cropperRef.current = ref)}
          width={thumbWidth}
          height={thumbHeight}
          cropShape={item.productSize?.cropShape}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, width: thumbWidth, marginTop: 0 }}>
        <button onClick={onClose} className="btn btn-secondary" style={{ minWidth: 100 }}>Cancel</button>
        <button onClick={handleRotate} className="btn btn-outline-secondary" style={{ minWidth: 100 }}>⟳ Rotate 90°</button>
        <button onClick={() => handleSave(scaledCropData)} className="btn btn-primary" style={{ minWidth: 120 }}>✓ Save Crop</button>
      </div>
    </div>
  );
}
      
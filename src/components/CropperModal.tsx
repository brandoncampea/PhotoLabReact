
// Example: import Cropper from 'react-easy-crop'; // Uncomment and adjust for your cropper library

import React, { useRef } from 'react';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import { useCart } from '../contexts/CartContext';

type CropperModalProps = {
  item: any;
  onClose: () => void;
};

export default function CropperModal({ item, onClose }: CropperModalProps) {
  const cropperRef = useRef<any>(null);
  const { updateCropData } = useCart();
  const photo = item.photo || item;
  const photoWidth = Number(photo.width || photo.metadata?.width || 0);
  const photoHeight = Number(photo.height || photo.metadata?.height || 0);
  const isLandscape = photoWidth > photoHeight;
  const aspect = isLandscape ? 10 / 8 : 8 / 10;

  const handleSave = () => {
    const cropper = cropperRef.current?.cropper || cropperRef.current;
    if (!cropper?.getData) return;
    const data = cropper.getData();
    updateCropData(item.photoId, {
      x: Math.round(data.x),
      y: Math.round(data.y),
      width: Math.round(data.width),
      height: Math.round(data.height),
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    }, item.productId, item.productSizeId);
    onClose();
  };

  return (
    <div className="cart-crop-modal-overlay">
      <div className="cart-crop-modal">
        <h3>Edit Crop</h3>
        <div className="cart-crop-frame">
          <Cropper
            ref={cropperRef}
            src={photo.url || photo.fullImageUrl || photo.thumbnailUrl || ''}
            crossOrigin="anonymous"
            style={{ maxHeight: 500, width: '100%' }}
            aspectRatio={aspect}
            viewMode={1}
            guides={true}
            responsive={true}
            autoCropArea={1}
            minContainerHeight={200}
            minContainerWidth={200}
            onInitialized={(cropper) => {
              cropperRef.current = cropper;
              if (item.cropData) {
                cropper.setData({
                  x: item.cropData.x,
                  y: item.cropData.y,
                  width: item.cropData.width,
                  height: item.cropData.height,
                });
              }
            }}
          />
        </div>
        <div className="cart-crop-actions">
          <button className="btn btn-secondary" onClick={() => { cropperRef.current?.reset && cropperRef.current.reset(); }}>Reset Crop</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Crop</button>
        </div>
      </div>
    </div>
  );
}
      
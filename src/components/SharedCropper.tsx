import React, { useRef, useCallback } from 'react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';

export interface SharedCropperProps {
  imageUrl: string;
  aspectRatio: number;
  initialCropData?: any;
  onSave: (cropData: any) => void;
  onCancel: () => void;
  cropLabel?: string;
  saveLabel?: string;
  cancelLabel?: string;
  className?: string;
  showFullPhoto?: boolean;
}

const SharedCropper: React.FC<SharedCropperProps> = ({
  imageUrl,
  aspectRatio,
  initialCropData,
  onSave,
  onCancel,
  cropLabel = '',
  saveLabel = '✓ Save Crop',
  cancelLabel = 'Cancel',
  className = '',
  showFullPhoto = false,
}) => {
  const cropperRef = useRef<ReactCropperElement>(null);

  // Store initial crop data in a ref so it can be applied on cropper ready
  const initialCropDataRef = useRef<any>(initialCropData);
  React.useEffect(() => {
    initialCropDataRef.current = initialCropData;
  }, [initialCropData]);

  // Handler for cropper ready event
  const handleCropperReady = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      // Log image size and crop data for debugging
      const imgData = cropper.getImageData();
      console.log('[SharedCropper] ready', {
        imageUrl,
        naturalWidth: imgData.naturalWidth,
        naturalHeight: imgData.naturalHeight,
        initialCropData: initialCropDataRef.current
      });
      if (initialCropDataRef.current) {
        cropper.setData(initialCropDataRef.current);
        // Log the crop box after setting
        setTimeout(() => {
          console.log('[SharedCropper] after setData', cropper.getData());
        }, 100);
      } else if (showFullPhoto) {
        cropper.reset();
      }
    }
  }, [showFullPhoto, imageUrl]);

  const handleSave = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      const cropData = cropper.getData();
      onSave(cropData);
    }
  };

  return (
    <div className={`shared-cropper-container ${className}`.trim()}>
      <Cropper
        ref={cropperRef}
        src={imageUrl}
        crossOrigin="anonymous"
        className="shared-cropper"
        aspectRatio={aspectRatio}
        viewMode={1}
        guides={true}
        minCropBoxHeight={10}
        minCropBoxWidth={10}
        background={false}
        responsive={true}
        autoCropArea={1}
        checkOrientation={false}
        restore={false}
        ready={handleCropperReady}
      />
      {cropLabel && <div className="shared-cropper-label">{cropLabel}</div>}
    </div>
  );
};

export default SharedCropper;

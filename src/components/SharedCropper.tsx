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
  cropperRefCallback?: (ref: ReactCropperElement | null) => void;
  width?: number;
  height?: number;
  cropShape?: 'rect' | 'circle';
}

const SharedCropper: React.FC<SharedCropperProps> = ({
  imageUrl,
  aspectRatio,
  initialCropData,
  onSave,
  onCancel: _onCancel,
  cropLabel = '',
  saveLabel: _saveLabel = '✓ Save Crop',
  cancelLabel: _cancelLabel = 'Cancel',
  className = '',
  showFullPhoto = false,
  cropperRefCallback,
  width = 240,
  height = 180,
  cropShape,
}) => {
  const cropperRef = useRef<ReactCropperElement>(null);

  // Store initial crop data in a ref so it can be applied on cropper ready
  const initialCropDataRef = useRef<any>(initialCropData);
  React.useEffect(() => {
    initialCropDataRef.current = initialCropData;
  }, [initialCropData]);
  // Expose cropper ref to parent if callback provided
  React.useEffect(() => {
    if (typeof cropperRefCallback === 'function') {
      cropperRefCallback(cropperRef.current);
    }
  }, [cropperRefCallback]);

  // Handler for cropper ready event
  const handleCropperReady = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      if (initialCropDataRef.current) {
        cropper.setData(initialCropDataRef.current);
      } else if (showFullPhoto) {
        cropper.reset();
      }
    }
  }, [showFullPhoto, imageUrl]);

  return (
    <div
      className={`shared-cropper-container ${className}${cropShape === 'circle' ? ' crop-shape-circle' : ''}`.trim()}
      style={{ width, height, maxWidth: width, maxHeight: height, overflow: 'hidden', position: 'relative' }}
    >
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
        responsive={false}
        autoCropArea={1}
        checkOrientation={false}
        restore={false}
        dragMode="none"
        cropBoxMovable={true}
        cropBoxResizable={true}
        zoomable={false}
        zoomOnWheel={false}
        zoomOnTouch={false}
        scalable={false}
        movable={false}
        toggleDragModeOnDblclick={false}
        rotatable={false}
        style={{ width, height, maxWidth: width, maxHeight: height, display: 'block' }}
        ready={handleCropperReady}
      />
      {cropLabel && <div className="shared-cropper-label">{cropLabel}</div>}
    </div>
  );
};

export default SharedCropper;

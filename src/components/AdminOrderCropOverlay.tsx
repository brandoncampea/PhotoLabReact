import React, { useRef, useState, useEffect } from 'react';

interface AdminOrderCropOverlayProps {
  photoUrl: string;
  thumbnailUrl?: string;
  photoWidth: number;
  photoHeight: number;
  cropData?: { x: number; y: number; width: number; height: number };
  whccCrop?: { X: number; Y: number; ZoomX: number; ZoomY: number };
  cropShape?: 'rect' | 'circle';
  width?: number;
}

export const AdminOrderCropOverlay: React.FC<AdminOrderCropOverlayProps> = ({
  photoUrl,
  thumbnailUrl,
  photoWidth,
  photoHeight,
  cropData,
  whccCrop,
  cropShape,
  width: widthProp,
}) => {
  // Use thumbnail if provided, else fallback to photoUrl
  const imageUrl = thumbnailUrl || photoUrl;
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const displayWidth = widthProp ?? 300;
  const [displayHeight, setDisplayHeight] = useState(0);

  // On image load, set displayHeight to auto (preserve aspect ratio)
  useEffect(() => {
    const img = imgRef.current;
    if (img) {
      const updateSize = () => {
        if (img.naturalWidth && img.naturalHeight) {
          setDisplayHeight((img.naturalHeight / img.naturalWidth) * displayWidth);
        }
      };
      if (img.complete) {
        updateSize();
      } else {
        img.onload = updateSize;
      }
    }
  }, [imageUrl]);

  // No letterboxing needed: image is always width 400, height auto (aspect ratio preserved)
  const drawnW = displayWidth;
  const drawnH = displayHeight;

  // Customer crop overlay (yellow)
  let customerRect = null;
  if (cropData && photoWidth && photoHeight && drawnW && drawnH) {
    customerRect = {
      left: (cropData.x / photoWidth) * drawnW,
      top: (cropData.y / photoHeight) * drawnH,
      width: (cropData.width / photoWidth) * drawnW,
      height: (cropData.height / photoHeight) * drawnH,
    };
  }

  // WHCC crop overlay (magenta, dashed)
  // X/Y are center percentages; ZoomX/ZoomY are the fraction of the source image kept (0-100)
  let whccRect = null;
  if (whccCrop && drawnW && drawnH) {
    const zoomX = whccCrop.ZoomX || 100;
    const zoomY = whccCrop.ZoomY || 100;
    const cropW = drawnW * (zoomX / 100);
    const cropH = drawnH * (zoomY / 100);
    const centerX = drawnW * (whccCrop.X / 100);
    const centerY = drawnH * (whccCrop.Y / 100);
    whccRect = {
      left: centerX - cropW / 2,
      top: centerY - cropH / 2,
      width: cropW,
      height: cropH,
    };
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: displayWidth,
        height: displayHeight || 'auto',
        background: '#222',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        width={displayWidth}
        height={displayHeight || undefined}
        alt="Order Photo"
        style={{ display: 'block', width: displayWidth, height: 'auto', borderRadius: 8 }}
      />
      {/* Overlay rectangles absolutely positioned over the image */}
      {customerRect && (
        <div
          style={{
            position: 'absolute',
            left: customerRect.left,
            top: customerRect.top,
            width: customerRect.width,
            height: customerRect.height,
            border: '2px solid yellow',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 2,
            borderRadius: cropShape === 'circle' ? '50%' : undefined,
          }}
          title="Customer Crop"
        />
      )}
      {whccRect && (
        <div
          style={{
            position: 'absolute',
            left: whccRect.left,
            top: whccRect.top,
            width: whccRect.width,
            height: whccRect.height,
            border: '2px dashed magenta',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 3,
            borderRadius: cropShape === 'circle' ? '50%' : undefined,
          }}
          title="WHCC Crop"
        />
      )}
    </div>
  );
};

export default AdminOrderCropOverlay;

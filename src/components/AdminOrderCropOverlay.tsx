import React, { useRef, useState, useEffect } from 'react';

interface AdminOrderCropOverlayProps {
  photoUrl: string;
  thumbnailUrl?: string;
  photoWidth: number;
  photoHeight: number;
  cropData?: { x: number; y: number; width: number; height: number };
  whccCrop?: { X: number; Y: number; ZoomX: number; ZoomY: number };
}

export const AdminOrderCropOverlay: React.FC<AdminOrderCropOverlayProps> = ({
  photoUrl,
  thumbnailUrl,
  photoWidth,
  photoHeight,
  cropData,
  whccCrop,
}) => {
  // Use thumbnail if provided, else fallback to photoUrl
  const imageUrl = thumbnailUrl || photoUrl;
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displayWidth, setDisplayWidth] = useState(400);
  const [displayHeight, setDisplayHeight] = useState(0);

  // On image load, set displayHeight to auto (preserve aspect ratio)
  useEffect(() => {
    const img = imgRef.current;
    if (img) {
      const updateSize = () => {
        if (img.naturalWidth && img.naturalHeight) {
          setDisplayHeight((img.naturalHeight / img.naturalWidth) * 400);
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
  const offsetX = 0;
  const offsetY = 0;

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
  let whccRect = null;
  if (whccCrop && photoWidth && photoHeight && drawnW && drawnH) {
    // Convert percent X/Y to px, and ZoomX/ZoomY to crop size
    const x = (whccCrop.X / 100) * photoWidth;
    const y = (whccCrop.Y / 100) * photoHeight;
    const zoomX = whccCrop.ZoomX || 100;
    const zoomY = whccCrop.ZoomY || 100;
    const w = photoWidth * (100 / zoomX);
    const h = photoHeight * (100 / zoomY);
    whccRect = {
      left: (x / photoWidth) * drawnW,
      top: (y / photoHeight) * drawnH,
      width: (w / photoWidth) * drawnW,
      height: (h / photoHeight) * drawnH,
    };
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 400,
        height: displayHeight || 'auto',
        background: '#222',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        width={400}
        height={displayHeight || undefined}
        alt="Order Photo"
        style={{ display: 'block', width: 400, height: 'auto', borderRadius: 8 }}
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
          }}
          title="WHCC Crop"
        />
      )}
      {/* Debug output for troubleshooting overlay visibility */}
      <div style={{ color: '#fff', background: 'rgba(0,0,0,0.7)', fontSize: 12, padding: 8, marginTop: 8, borderRadius: 4 }}>
        <div><b>photoWidth:</b> {photoWidth} <b>photoHeight:</b> {photoHeight}</div>
        <div><b>cropData:</b> {cropData ? JSON.stringify(cropData) : 'null'}</div>
        <div><b>whccCrop:</b> {whccCrop ? JSON.stringify(whccCrop) : 'null'}</div>
      </div>
    </div>
  );
};

export default AdminOrderCropOverlay;

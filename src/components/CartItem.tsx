import React, { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { CartItem as CartItemType } from '../types';
import { useCart } from '../contexts/CartContext';
import WatermarkedImage from './WatermarkedImage';
import { getPhotoAssetUrl } from '../utils/getPhotoAssetUrl';

interface CartItemProps {
  item: CartItemType;
  onEditCrop?: (item: CartItemType) => void;
  onOpenWhccEditor?: (item: CartItemType) => void;
  showWhccEditorButton?: boolean;
  studioId?: number;
}

const CartItem: React.FC<CartItemProps> = ({ item, onEditCrop, onOpenWhccEditor, showWhccEditorButton, studioId }) => {

  // Cart preview should always use thumbnail assets.
  let displayImageUrl = '';
  if (item?.photo?.id) {
    displayImageUrl = `/api/photos/${item.photo.id}/asset?variant=thumbnail`;
  } else if (item?.photo?.photoId) {
    displayImageUrl = `/api/photos/${item.photo.photoId}/asset?variant=thumbnail`;
  } else if (String(item?.photo?.thumbnailUrl || '').trim()) {
    displayImageUrl = String(item.photo.thumbnailUrl).trim();
  } else {
    displayImageUrl = getPhotoAssetUrl(item.photo || item, 'thumb');
  }
  const isAlbumScopeItem = String(item.digitalDownloadScope || '').trim().toLowerCase() === 'album';
  if (isAlbumScopeItem) {
    const cover = String(item.albumCoverImageUrl || '').trim();
    if (cover) {
      displayImageUrl = /^\d+$/.test(cover)
        ? `/api/photos/${cover}/asset?variant=thumbnail`
        : cover;
    }
  }

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [drawnSize, setDrawnSize] = useState({ width: 240, height: 280 });

  useLayoutEffect(() => {
    if (imageRef.current) {
      setDrawnSize({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
    }
  }, [displayImageUrl, expanded, item.cropData]);

  const { updateQuantity, removeFromCart } = useCart();

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity > 0) {
      updateQuantity(item.photoId, newQuantity, item.productId, item.productSizeId);
    }
  };

  const subtotal = item.price * item.quantity;
  const isDigitalItem = item.isDigital === true || String(item.digitalDownloadScope || '').trim().length > 0;

  // Removed unused cropDebugText variable


  // Removed unused getCropStyle function


  // ...existing code...


  // --- Overlay math matches cropper modal exactly ---
  const cropOverlayStyle = useMemo<React.CSSProperties | null>(() => {
    if (isDigitalItem || !item?.cropData) return null;

    // Use the original image size for cropData
    const naturalWidth = Number(item?.photo?.width || item?.photo?.metadata?.width || 0);
    const naturalHeight = Number(item?.photo?.height || item?.photo?.metadata?.height || 0);
    if (!(naturalWidth > 0 && naturalHeight > 0)) return null;

    // Use the actual rendered image size
    const frameW = drawnSize.width;
    const frameH = drawnSize.height;
    const frameAspect = frameW / frameH;
    const photoAspect = naturalWidth / naturalHeight;

    // Calculate how the image is drawn in the frame (objectFit: contain)
    let drawnW = frameW;
    let drawnH = frameH;
    let offsetX = 0;
    let offsetY = 0;
    if (photoAspect > frameAspect) {
      drawnW = frameW;
      drawnH = frameW / photoAspect;
      offsetY = (frameH - drawnH) / 2;
    } else {
      drawnH = frameH;
      drawnW = frameH * photoAspect;
      offsetX = (frameW - drawnW) / 2;
    }

    // Map crop coordinates (in natural/original image pixels) to drawn image in frame
    const scaleX = drawnW / naturalWidth;
    const scaleY = drawnH / naturalHeight;
    const rawX = Number(item.cropData.x || 0);
    const rawY = Number(item.cropData.y || 0);
    const rawW = Number(item.cropData.width || 0);
    const rawH = Number(item.cropData.height || 0);
    if (!(rawW > 0 && rawH > 0)) return null;

    const leftPx = offsetX + rawX * scaleX;
    const topPx = offsetY + rawY * scaleY;
    const widthPx = rawW * scaleX;
    const heightPx = rawH * scaleY;

    const overlayStyle = {
      position: 'absolute',
      left: `${leftPx}px`,
      top: `${topPx}px`,
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      border: '2px solid #7b61ff',
      boxShadow: '0 0 0 9999px rgba(10, 8, 24, 0.45)',
      borderRadius: 2,
      pointerEvents: 'none',
      zIndex: 3,
    };

    return overlayStyle;
  }, [isDigitalItem, item?.cropData, item?.photo?.width, item?.photo?.height, item?.photo?.metadata?.width, item?.photo?.metadata?.height]);

  const displayName = isAlbumScopeItem
    ? (item.albumName || 'Full Album')
    : (item.photo?.fileName || `Photo ${item.photoId}`);

  return (
    <div style={{ border: '1px solid #2a2740', borderRadius: 8, marginBottom: 16, overflow: 'hidden', background: '#0f0f16' }}>

      {/* Header with Item Number and actions */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2a2740', background: '#1a1a24' }}>
        <input type="checkbox" style={{ marginRight: 12 }} defaultChecked />
        <span style={{ fontWeight: 600, marginRight: 'auto' }}>Item {item.photoId}</span>
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', color: '#7b61ff', cursor: 'pointer' }}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button onClick={() => removeFromCart(item.photoId, item.productId, item.productSizeId)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}>Remove</button>
        </div>
      </div>

      {/* Main Content */}
      {expanded && (
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
          {/* Photo Preview Section */}
          <div>
            <div style={{ marginBottom: 12, borderRadius: 6, overflow: 'hidden', background: '#000', height: 280, position: 'relative' }}>
              {displayImageUrl ? (
                <>
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <WatermarkedImage
                      src={displayImageUrl}
                      alt={item.productName || item.photo?.fileName || 'Product'}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', outline: '2px solid #00f' }}
                      studioId={studioId}
                      showWatermark={false}
                      fill={false}
                      imageRef={imageRef}
                    />
                  </div>
                  {cropOverlayStyle ? (
                    <div style={cropOverlayStyle} />
                  ) : null}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                  No Image
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginBottom: 12 }}>
              {displayName}
            </div>
            {/* Crop debug info removed for customers; only overlay box is shown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {onEditCrop && !isDigitalItem && (
                <button 
                  onClick={() => onEditCrop(item)}
                  style={{ 
                    padding: '8px 10px', 
                    background: '#7b61ff', 
                    border: 'none', 
                    borderRadius: 4, 
                    color: '#fff', 
                    fontSize: 12, 
                    fontWeight: 600, 
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  ✏️ Edit Crop
                </button>
              )}
              {showWhccEditorButton && onOpenWhccEditor && (
                <button
                  onClick={() => onOpenWhccEditor(item)}
                  style={{
                    padding: '8px 10px',
                    background: '#1f8a70',
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  🖼️ Open WHCC Editor
                </button>
              )}
            </div>
          </div>

          {/* Product Summary Section */}
          <div>
            <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #2a2740' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.productName || 'Selected Product'}</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>{item.productSizeName || 'Selected Size'}</div>
            </div>

            {/* Pricing and Quantity */}
            <div style={{ borderTop: '1px solid #2a2740', paddingTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'center' }}>
                <div style={{ color: '#aaa', fontSize: 13 }}>Item Total</div>
                <div style={{ textAlign: 'right', fontWeight: 600 }}>${item.price.toFixed(2)}</div>
                <div style={{ textAlign: 'right', width: 40 }}>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      handleQuantityChange(parseInt(e.target.value) || 1);
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      background: '#0f0f16',
                      border: '1px solid #2a2740',
                      borderRadius: 3,
                      color: '#fff',
                      textAlign: 'center',
                      opacity: 1,
                      cursor: 'pointer',
                    }}
                  />
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>${subtotal.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartItem;

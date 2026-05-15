    function handleEditCrop() {
      // ...existing code...
    }
import React, { useMemo, useState, useRef, useLayoutEffect, useEffect } from 'react';
import { mapCropToDisplay } from '../utils/mapCropToDisplay';
import { CartItem as CartItemType } from '../types';
import { useCart } from '../contexts/CartContext';
import WatermarkedImage from './WatermarkedImage';
import { getPhotoAssetUrl } from '../utils/getPhotoAssetUrl';
import ProductAttributes from './ProductAttributes';

interface CartItemProps {
  item: CartItemType;
  photo?: any;
  onEditCrop?: (item: CartItemType, photo?: any, drawnSize?: { width: number; height: number }) => void;
  onOpenWhccEditor?: (item: CartItemType) => void;
  showWhccEditorButton?: boolean;
  studioId?: number;
}

const CartItem: React.FC<CartItemProps> = ({ item, photo, onEditCrop, onOpenWhccEditor, showWhccEditorButton, studioId }) => {

  // Cart preview should always use thumbnail assets.
  let displayImageUrl = '';
  // Use useEffect to handle side effects
  // Use a scaled, uncropped version of the original for accurate crop mapping
  if (item?.photo?.id) {
    displayImageUrl = `/api/photos/${item.photo.id}/asset?variant=thumb`;
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
        ? `/api/photos/${cover}/asset?variant=thumb`
        : cover;
    }
  }

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [expanded, setExpanded] = useState(true);
  // Dynamically size preview: fixed width, height based on image aspect ratio
  const [drawnSize, setDrawnSize] = useState<{ width: number; height: number }>({ width: 240, height: 180 });

  // Calculate aspect ratio from photo
  useEffect(() => {
    const naturalWidth = Number(item?.photo?.width || 0);
    const naturalHeight = Number(item?.photo?.height || 0);
    if (naturalWidth > 0 && naturalHeight > 0) {
      const aspect = naturalWidth / naturalHeight;
      const width = 240;
      const height = Math.round(width / aspect);
      setDrawnSize({ width, height });
    }
  }, [item?.photo?.width, item?.photo?.height]);

  // No need for useLayoutEffect to measure image; we set size by aspect ratio

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
    if (isDigitalItem || !item?.cropData) {
      return null;
    }
    const naturalWidth = Number(item?.photo?.width || 0);
    const naturalHeight = Number(item?.photo?.height || 0);
    if (!(naturalWidth > 0 && naturalHeight > 0)) return null;
    const mapped = mapCropToDisplay({
      crop: item.cropData,
      originalWidth: naturalWidth,
      originalHeight: naturalHeight,
      displayWidth: drawnSize.width,
      displayHeight: drawnSize.height,
    });
    return {
      position: 'absolute',
      left: `${mapped.x}px`,
      top: `${mapped.y}px`,
      width: `${mapped.width}px`,
      height: `${mapped.height}px`,
      border: '2px solid #ffe066',
      boxShadow: '0 0 0 9999px rgba(10, 8, 24, 0.45)',
      borderRadius: 2,
      pointerEvents: 'none' as React.CSSProperties['pointerEvents'],
      zIndex: 3,
    };
  }, [isDigitalItem, item?.cropData, item?.photo?.width, item?.photo?.height, drawnSize.width, drawnSize.height]);

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
            <div style={{ marginBottom: 12, borderRadius: 6, overflow: 'hidden', background: '#000', width: drawnSize.width, height: drawnSize.height, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {displayImageUrl ? (
                <>
                  <div style={{ width: drawnSize.width, height: drawnSize.height, position: 'relative' }}>
                    <WatermarkedImage
                      src={displayImageUrl}
                      alt={item.productName || item.photo?.fileName || 'Product'}
                      style={{ width: drawnSize.width, height: drawnSize.height, objectFit: 'contain', border: '3px dashed #ff0', background: '#222', display: 'block' }}
                      studioId={studioId}
                      showWatermark={false}
                      fill={false}
                      imageRef={imageRef}
                    />
                    {cropOverlayStyle ? (
                      <div style={{
                        ...cropOverlayStyle,
                        background: 'rgba(123, 97, 255, 0.18)',
                        border: '3px solid #ff0',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }} />
                    ) : null}
                  </div>
                </>
              ) : (
                <div style={{ width: drawnSize.width, height: drawnSize.height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
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
                  onClick={() => onEditCrop(item, photo, drawnSize)}
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
              <ProductAttributes attributes={item.attributes} />
            </div>

            {/* Pricing and Quantity */}
            <div style={{ borderTop: '1px solid #2a2740', paddingTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'center' }}>
                <div style={{ color: '#aaa', fontSize: 13 }}>Item Total</div>
                <div style={{ textAlign: 'right', fontWeight: 600 }}>${item.price.toFixed(2)}</div>
                <div style={{ textAlign: 'right', width: 40 }}>
                  {isDigitalItem ? (
                    <input
                      type="number"
                      min={1}
                      value={1}
                      disabled
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        background: '#181828',
                        border: '1px solid #2a2740',
                        borderRadius: 3,
                        color: '#aaa',
                        textAlign: 'center',
                        opacity: 0.7,
                        cursor: 'not-allowed',
                      }}
                    />
                  ) : (
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
                  )}
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

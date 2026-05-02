import React, { useMemo, useState } from 'react';
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
  const { updateQuantity, removeFromCart } = useCart();
  const [expanded, setExpanded] = useState(true);

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity > 0) {
      updateQuantity(item.photoId, newQuantity, item.productId, item.productSizeId);
    }
  };

  const subtotal = item.price * item.quantity;
  const isAlbumScopeItem = String(item.digitalDownloadScope || '').trim().toLowerCase() === 'album';
  const isDigitalItem = item.isDigital === true || String(item.digitalDownloadScope || '').trim().length > 0;

  // Removed unused cropDebugText variable


  // Removed unused getCropStyle function


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
  if (isAlbumScopeItem) {
    const cover = String(item.albumCoverImageUrl || '').trim();
    if (cover) {
      displayImageUrl = /^\d+$/.test(cover)
        ? `/api/photos/${cover}/asset?variant=thumbnail`
        : cover;
    }
  }

  const cropOverlayStyle = useMemo<React.CSSProperties | null>(() => {
    if (isDigitalItem || !item?.cropData) return null;

    const photoWidth = Number(item?.photo?.width || item?.photo?.metadata?.width || 0);
    const photoHeight = Number(item?.photo?.height || item?.photo?.metadata?.height || 0);
    if (!(photoWidth > 0 && photoHeight > 0)) return null;

    const rawX = Number(item.cropData.x || 0);
    const rawY = Number(item.cropData.y || 0);
    const rawW = Number(item.cropData.width || 0);
    const rawH = Number(item.cropData.height || 0);
    if (!(rawW > 0 && rawH > 0)) return null;

    const x = Math.max(0, Math.min(rawX, photoWidth));
    const y = Math.max(0, Math.min(rawY, photoHeight));
    const width = Math.max(1, Math.min(rawW, photoWidth - x));
    const height = Math.max(1, Math.min(rawH, photoHeight - y));

    // Preview frame in this component is fixed at 240x280.
    const frameW = 240;
    const frameH = 280;
    const frameAspect = frameW / frameH;
    const photoAspect = photoWidth / photoHeight;

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

    const leftPx = offsetX + (x / photoWidth) * drawnW;
    const topPx = offsetY + (y / photoHeight) * drawnH;
    const widthPx = (width / photoWidth) * drawnW;
    const heightPx = (height / photoHeight) * drawnH;

    return {
      position: 'absolute',
      left: `${(leftPx / frameW) * 100}%`,
      top: `${(topPx / frameH) * 100}%`,
      width: `${(widthPx / frameW) * 100}%`,
      height: `${(heightPx / frameH) * 100}%`,
      border: '2px solid #7b61ff',
      boxShadow: '0 0 0 9999px rgba(10, 8, 24, 0.45)',
      borderRadius: 2,
      pointerEvents: 'none',
      zIndex: 3,
    };
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
                  <WatermarkedImage
                    src={displayImageUrl}
                    alt={item.productName || item.photo?.fileName || 'Product'}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    studioId={studioId}
                    showWatermark={false}
                  />
                  {cropOverlayStyle ? <div style={cropOverlayStyle} /> : null}
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

import React, { useState } from 'react';
import { CartItem as CartItemType } from '../types';
import { useCart } from '../contexts/CartContext';
import WatermarkedImage from './WatermarkedImage';

interface CartItemProps {
  item: CartItemType;
  onEditCrop?: (item: CartItemType) => void;
  onOpenWhccEditor?: (item: CartItemType) => void;
  showWhccEditorButton?: boolean;
}

const CartItem: React.FC<CartItemProps> = ({ item, onEditCrop, onOpenWhccEditor, showWhccEditorButton }) => {
  const { updateQuantity, removeFromCart } = useCart();
  const [expanded, setExpanded] = useState(true);

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity > 0) {
      updateQuantity(item.photoId, newQuantity, item.productId, item.productSizeId);
    }
  };

  const subtotal = item.price * item.quantity;

  // Removed unused cropDebugText variable

  // Calculate crop preview overlay position (as percentage of image)
  const getCropStyle = () => {
    if (!item.cropData) return null;
    const { x, y, width, height } = item.cropData;
    const naturalWidth = Number(item.photo?.width || item.photo?.metadata?.width || 0);
    const naturalHeight = Number(item.photo?.height || item.photo?.metadata?.height || 0);
    if (naturalWidth === 0 || naturalHeight === 0) return null;

    // Always treat cropData as pixel values and convert to percent for overlay
    const left = (x / naturalWidth) * 100;
    const top = (y / naturalHeight) * 100;
    const boxWidth = (width / naturalWidth) * 100;
    const boxHeight = (height / naturalHeight) * 100;

    return {
      position: 'absolute' as const,
      left: `${left}%`,
      top: `${top}%`,
      width: `${boxWidth}%`,
      height: `${boxHeight}%`,
      border: '2px solid #7b61ff',
      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
      pointerEvents: 'none' as const,
    };
  };

  // Determine which image to show: product > category > photo > placeholder
  let displayImageUrl = (item as any).productImageUrl || (item as any).categoryImageUrl || item.photo?.fullImageUrl || item.photo?.thumbnailUrl;

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
                  />
                  {item.cropData && <div style={getCropStyle()!} />}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                  No Image
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginBottom: 12 }}>
              {item.photo?.fileName || `Photo ${item.photoId}`}
            </div>
            {/* Crop debug info removed for customers; only overlay box is shown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {onEditCrop && (
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

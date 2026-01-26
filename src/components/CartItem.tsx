import React from 'react';
import { CartItem as CartItemType } from '../types';
import { useCart } from '../contexts/CartContext';
import WatermarkedImage from './WatermarkedImage';

interface CartItemProps {
  item: CartItemType;
  onEditCrop?: (item: CartItemType) => void;
}

const CartItem: React.FC<CartItemProps> = ({ item, onEditCrop }) => {
  const { updateQuantity, removeFromCart } = useCart();

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity > 0) {
      updateQuantity(item.photoId, newQuantity);
    }
  };

  const subtotal = item.price * item.quantity;

  // Calculate crop preview overlay position (as percentage of image)
  const getCropStyle = () => {
    if (!item.cropData) return null;
    
    const { x, y, width, height } = item.cropData;
    
    return {
      position: 'absolute' as const,
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      height: `${height}%`,
      border: '2px solid #3b82f6',
      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
      pointerEvents: 'none' as const,
    };
  };

  return (
    <div className="cart-item">
      <div className="cart-item-image" style={{ width: '100px', height: '100px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
        {item.photo ? (
          <>
            <WatermarkedImage 
              src={item.photo.thumbnailUrl} 
              alt={item.photo.fileName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {item.cropData && <div style={getCropStyle()!} />}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#9ca3af' }}>Loading...</span>
          </div>
        )}
      </div>
      
      <div className="cart-item-details">
        {item.photo ? (
          <>
            <h3>{item.photo.fileName}</h3>
            {item.photo.description && <p>{item.photo.description}</p>}
          </>
        ) : (
          <h3>Photo {item.photoId}</h3>
        )}
        {item.cropData && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="badge">Custom Crop</span>
            {onEditCrop && (
              <button 
                onClick={() => onEditCrop(item)}
                className="btn-edit-crop"
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                Edit Crop
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="cart-item-quantity">
        <button
          onClick={() => handleQuantityChange(item.quantity - 1)}
          className="quantity-btn"
        >
          -
        </button>
        <span className="quantity-value">{item.quantity}</span>
        <button
          onClick={() => handleQuantityChange(item.quantity + 1)}
          className="quantity-btn"
        >
          +
        </button>
      </div>
      
      <div className="cart-item-price">
        <p className="price-label">
          ${item.price.toFixed(2)} × {item.quantity}
        </p>
        <p className="price-total">${subtotal.toFixed(2)}</p>
      </div>
      
      <button
        onClick={() => removeFromCart(item.photoId)}
        className="btn-remove"
        aria-label="Remove item"
      >
        ×
      </button>
    </div>
  );
};

export default CartItem;

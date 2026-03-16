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
    <div className="cart-item dark-card">
      <div className="cart-item-image cart-img-abs">
        {item.photos && item.photos.length > 1 ? (
          // Multi-photo grid display
          <div className={`cart-multi-photo-grid grid-cols-${item.photos.length}`}>
            {item.photos.slice(0, 4).map((photoItem, idx) => (
              <div key={idx} style={{ position: 'relative', overflow: 'hidden' }}>
                <WatermarkedImage 
                  src={photoItem.photo.thumbnailUrl} 
                  alt={`Photo ${photoItem.position}`}
                  className="cart-photo-img"
                />
                <div className="cart-photo-pos-badge">#{photoItem.position}</div>
              </div>
            ))}
            {item.photos.length > 4 && (
              <div className="cart-photo-more-badge">+{item.photos.length - 4}</div>
            )}
          </div>
        ) : item.photo ? (
          // Single photo display
          <>
            <WatermarkedImage 
              src={item.photo.thumbnailUrl} 
              alt={item.photo.fileName}
              className="cart-photo-img"
            />
            {item.cropData && <div style={getCropStyle()!} />}
          </>
        ) : (
          <div className="cart-photo-loading">
            <span className="cart-photo-loading-text">Loading...</span>
          </div>
        )}
      </div>
      
      <div className="cart-item-details">
        {item.photos && item.photos.length > 1 ? (
          <>
            <h3>Multi-Photo Product</h3>
            <p className="cart-photo-count">📸 {item.photos.length} photos included</p>
          </>
        ) : item.photo ? (
          <>
            <h3>{item.photo.fileName}</h3>
            {item.photo.description && <p>{item.photo.description}</p>}
          </>
        ) : (
          <h3>Photo {item.photoId}</h3>
        )}
        {item.cropData && (
          <div className="cart-crop-row">
            <span className="badge">Custom Crop</span>
            {onEditCrop && (
              <button 
                onClick={() => onEditCrop(item)}
                className="btn-edit-crop btn-crop-action"
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

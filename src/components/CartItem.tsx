import React from 'react';
import { CartItem as CartItemType } from '../types';
import { useCart } from '../contexts/CartContext';

interface CartItemProps {
  item: CartItemType;
}

const CartItem: React.FC<CartItemProps> = ({ item }) => {
  const { updateQuantity, removeFromCart } = useCart();

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity > 0) {
      updateQuantity(item.photoId, newQuantity);
    }
  };

  const subtotal = item.photo.price * item.quantity;

  return (
    <div className="cart-item">
      <img src={item.photo.thumbnailUrl} alt={item.photo.fileName} className="cart-item-image" />
      
      <div className="cart-item-details">
        <h3>{item.photo.fileName}</h3>
        {item.photo.description && <p>{item.photo.description}</p>}
        {item.cropData && <span className="badge">Custom Crop</span>}
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
          ${item.photo.price.toFixed(2)} × {item.quantity}
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

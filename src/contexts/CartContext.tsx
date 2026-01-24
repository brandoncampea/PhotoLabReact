import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Photo, CropData } from '../types';
import { productService } from '../services/productService';

interface CartContextType {
  items: CartItem[];
  addToCart: (photo: Photo, quantity?: number, cropData?: CropData, productId?: number, productSizeId?: number) => Promise<void>;
  removeFromCart: (photoId: number) => void;
  updateQuantity: (photoId: number, quantity: number) => void;
  updateCropData: (photoId: number, cropData: CropData) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      setItems(JSON.parse(savedCart));
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  const addToCart = async (photo: Photo, quantity = 1, cropData?: CropData, productId?: number, productSizeId?: number) => {
    // Calculate price from product and size
    let price = 0;
    if (productId && productSizeId) {
      try {
        const products = await productService.getActiveProducts();
        const product = products.find(p => p.id === productId);
        const size = product?.sizes.find(s => s.id === productSizeId);
        if (product && size) {
          price = product.basePrice + size.priceModifier;
        }
      } catch (error) {
        console.error('Error fetching product price:', error);
      }
    }

    setItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.photoId === photo.id);
      
      if (existingItem) {
        return prevItems.map((item) =>
          item.photoId === photo.id
            ? { ...item, quantity: item.quantity + quantity, cropData: cropData || item.cropData, productId, productSizeId, price: price || item.price }
            : item
        );
      }
      
      return [...prevItems, { photoId: photo.id, photo, quantity, cropData, productId, productSizeId, price }];
    });
  };

  const removeFromCart = (photoId: number) => {
    setItems((prevItems) => prevItems.filter((item) => item.photoId !== photoId));
  };

  const updateQuantity = (photoId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(photoId);
      return;
    }
    
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.photoId === photoId ? { ...item, quantity } : item
      )
    );
  };

  const updateCropData = (photoId: number, cropData: CropData) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.photoId === photoId ? { ...item, cropData } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const getTotalItems = () => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalPrice = () => {
    return items.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        updateCropData,
        clearCart,
        getTotalItems,
        getTotalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

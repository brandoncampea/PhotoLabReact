import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Photo, CropData } from '../types';
import { productService } from '../services/productService';
import { photoService } from '../services/photoService';
import api from '../services/api';

interface CartContextType {
  items: CartItem[];
  addToCart: (photo: Photo, quantity?: number, cropData?: CropData, productId?: number, productSizeId?: number, additionalPhotos?: Photo[]) => Promise<void>;
  removeFromCart: (photoId: number) => void;
  updateQuantity: (photoId: number, quantity: number) => void;
  updateCropData: (photoId: number, cropData: CropData) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const saveCartToApi = async (items: CartItem[]) => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).id : null;
    if (!userId) {
      // No logged-in user: persist locally only
      localStorage.setItem('cart', JSON.stringify(items));
      return;
    }
    await api.post('/cart', { items });
  } catch (error) {
    console.warn('Failed to sync cart to backend:', error);
    // Fallback to localStorage if API fails
    localStorage.setItem('cart', JSON.stringify(items));
  }
};

const loadCartFromApi = async () => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).id : null;
    if (!userId) {
      const saved = localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    }
    const response = await api.get('/cart');
    let items = response.data || [];
    
    // Fetch full photo data for each item (API may return only IDs)
    items = await Promise.all(
      items.map(async (item: any) => {
        try {
          const photoIds: number[] = Array.isArray(item.photoIds)
            ? item.photoIds
            : item.photoId
            ? [item.photoId]
            : item.photo && item.photo.id
            ? [item.photo.id]
            : [];

          // Start with any photos already present
          const existingPhotos: Photo[] = Array.isArray(item.photos) ? item.photos : [];
          const existingMap = new Map(existingPhotos.map(p => [p.id, p]));
          const missingIds = photoIds.filter(id => !existingMap.has(id));

          const fetchedPhotos = await Promise.all(
            missingIds.map(async (id) => {
              try {
                return await photoService.getPhoto(id);
              } catch (err) {
                console.warn(`Failed to load photo ${id}:`, err);
                return null;
              }
            })
          );

          const photos = [...existingPhotos, ...fetchedPhotos.filter(Boolean)];
          const primaryPhoto = photos.find(p => p.id === photoIds[0]) || photos[0] || item.photo;

          return {
            ...item,
            photoIds,
            photos,
            photo: primaryPhoto,
          };
        } catch (err) {
          console.warn(`Failed to load photos for item`, err);
          return item; // Return item even if photo fetch fails
        }
      })
    );
    
    return items;
  } catch (error) {
    console.warn('Failed to load cart from backend, using localStorage:', error);
    // Fallback to localStorage
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  }
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from API on mount
  useEffect(() => {
    loadCartFromApi().then(cart => setItems(cart || []));
  }, []);

  // Save cart to API whenever it changes
  useEffect(() => {
    if (items.length > 0 || localStorage.getItem('cart')) {
      saveCartToApi(items);
    }
  }, [items]);

  const addToCart = async (photo: Photo, quantity = 1, cropData?: CropData, productId?: number, productSizeId?: number, additionalPhotos?: Photo[]) => {
    // Require crop data, product, and size
    if (!cropData || !productId || !productSizeId) {
      console.error('Cannot add to cart: Missing required crop data, product, or size');
      throw new Error('Photo must be cropped with a selected product and size before adding to cart');
    }

    // Calculate price from product and size
    let price = 0;
    try {
      const products = await productService.getActiveProducts();
      const product = products.find(p => p.id === productId);
      const size = product?.sizes.find(s => s.id === productSizeId);
      if (product && size) {
        price = size.price;
      } else {
        throw new Error('Invalid product or size');
      }
    } catch (error) {
      console.error('Error fetching product price:', error);
      throw error;
    }

    const additionalPhotoIds = additionalPhotos?.map(p => p.id) ?? [];
    const photoIds = [photo.id, ...additionalPhotoIds];
    const photos = [photo, ...(additionalPhotos ?? [])];

    setItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.photoId === photo.id);
      
      if (existingItem) {
        return prevItems.map((item) =>
          item.photoId === photo.id
            ? { ...item, quantity: item.quantity + quantity, cropData, productId, productSizeId, price, photoIds, photos }
            : item
        );
      }
      return [...prevItems, { photoId: photo.id, photo, photoIds, photos, quantity, cropData, productId, productSizeId, price }];
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

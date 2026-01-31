import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Photo, CropData, Package, Product, ProductSize } from '../types';
import { photoService } from '../services/photoService';
import api from '../services/api';

interface CartContextType {
  items: CartItem[];
  addToCart: (photo: Photo, cropData: CropData, product: Product, size: ProductSize, quantity?: number, photoIds?: number[], photos?: { photo: Photo; cropData: CropData; position: number }[]) => Promise<void>;
  addPackageToCart: (pkg: Package, photo: Photo, cropData: CropData) => Promise<void>;
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
    // Always save to localStorage as a backup
    localStorage.setItem('cart', JSON.stringify(items));
    
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).id : null;
    if (!userId) {
      // No logged-in user: already persisted locally
      return;
    }
    await api.post('/cart', { items });
  } catch (error) {
    console.warn('Failed to sync cart to backend:', error);
    // Already saved to localStorage above
  }
};

const loadCartFromApi = async () => {
  try {
    const user = localStorage.getItem('user');
    const userId = user ? JSON.parse(user).id : null;
    
    // First try localStorage (works for both logged-in and guest users)
    const saved = localStorage.getItem('cart');
    const localCart = saved ? JSON.parse(saved) : [];
    
    // If we have items in localStorage, return them directly
    // They already have full photo data embedded
    if (localCart.length > 0) {
      return localCart;
    }
    
    // If no local cart and user is logged in, try to fetch from backend
    if (!userId) {
      return [];
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
          const primaryPhoto = photos.find(p => p && p.id === photoIds[0]) || photos[0] || item.photo;

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
    console.warn('Failed to load cart from backend:', error);
    // Fallback to localStorage
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  }
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from API/localStorage on mount
  useEffect(() => {
    loadCartFromApi().then(cart => {
      setItems(cart || []);
      setIsLoaded(true);
    });
  }, []);

  // Save cart to API/localStorage whenever it changes (only after initial load)
  useEffect(() => {
    if (isLoaded) {
      saveCartToApi(items);
    }
  }, [items, isLoaded]);

  const addToCart = async (
    photo: Photo,
    cropData: CropData,
    product: Product,
    size: ProductSize,
    quantity = 1,
    photoIds?: number[],
    photos?: { photo: Photo; cropData: CropData; position: number }[]
  ) => {
    const price = size.price;
    const allPhotoIds = photoIds || [photo.id];
    const allPhotos = photos || [{ photo, cropData, position: 1 }];

    setItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.photoId === photo.id && item.productId === product.id && item.productSizeId === size.id);
      
      if (existingItem) {
        return prevItems.map((item) =>
          item.photoId === photo.id && item.productId === product.id && item.productSizeId === size.id
            ? { ...item, quantity: item.quantity + quantity, cropData, price, photoIds: allPhotoIds, photos: allPhotos }
            : item
        );
      }
      return [...prevItems, { 
        photoId: photo.id, 
        photo, 
        photoIds: allPhotoIds, 
        photos: allPhotos, 
        quantity, 
        cropData, 
        productId: product.id, 
        productSizeId: size.id, 
        price 
      }];
    });
  };

  const addPackageToCart = async (pkg: Package, photo: Photo, cropData: CropData) => {
    if (!pkg.items || pkg.items.length === 0) {
      throw new Error('Package has no items');
    }

    // Expand package into individual cart items
    // Each package item becomes a separate cart item with the same photo and crop data
    const newItems: CartItem[] = [];

    for (const pkgItem of pkg.items) {
      if (!pkgItem.productId || !pkgItem.productSizeId) {
        console.warn('Skipping package item with missing product/size:', pkgItem);
        continue;
      }

      // Use the productSize price from the package item (already loaded)
      const price = pkgItem.productSize?.price || 0;

      newItems.push({
        photoId: photo.id,
        photo,
        photoIds: [photo.id],
        photos: [{ photo, cropData, position: 1 }],
        quantity: pkgItem.quantity,
        cropData,
        productId: pkgItem.productId,
        productSizeId: pkgItem.productSizeId,
        price,
      });
    }

    if (newItems.length === 0) {
      throw new Error('No valid items in package');
    }

    // Add all package items to cart
    setItems((prevItems) => [...prevItems, ...newItems]);
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
        addPackageToCart,
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

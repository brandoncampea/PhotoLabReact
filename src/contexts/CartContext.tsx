import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Photo, CropData, Package, Product, ProductSize } from '../types';
import { photoService } from '../services/photoService';
import api from '../services/api';

interface CartContextType {
  items: CartItem[];
  addToCart: (
    photo: Photo,
    cropData: CropData,
    product: Product,
    size: ProductSize,
    quantity?: number,
    photoIds?: number[],
    photos?: { photo: Photo; cropData: CropData; position: number }[],
    options?: { albumId?: number; albumName?: string; albumCoverImageUrl?: string; digitalDownloadScope?: 'photo' | 'album'; productOptions?: Record<string, any> }
  ) => Promise<void>;
  addPackageToCart: (pkg: Package, photo: Photo, cropData: CropData) => Promise<void>;
  removeFromCart: (photoId: number, productId?: number, productSizeId?: number) => void;
  updateQuantity: (photoId: number, quantity: number, productId?: number, productSizeId?: number) => void;
  updateCropData: (photoId: number, cropData: CropData, productId?: number, productSizeId?: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  saveList: (name: string) => void;
  loadList: (name: string) => void;
  getSavedLists: () => string[];
}
// Save cart list to localStorage under a named key
const saveListToLocal = (name: string, items: CartItem[]) => {
  const lists = JSON.parse(localStorage.getItem('savedLists') || '{}');
  lists[name] = items;
  localStorage.setItem('savedLists', JSON.stringify(lists));
};

// Load cart list from localStorage by name
const loadListFromLocal = (name: string): CartItem[] => {
  const lists = JSON.parse(localStorage.getItem('savedLists') || '{}');
  return lists[name] || [];
};

const getSavedListsFromLocal = (): string[] => {
  const lists = JSON.parse(localStorage.getItem('savedLists') || '{}');
  return Object.keys(lists);
};

export const CartContext = createContext<CartContextType | undefined>(undefined);

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
    photos?: { photo: Photo; cropData: CropData; position: number }[],
    options?: { albumId?: number; albumName?: string; albumCoverImageUrl?: string; digitalDownloadScope?: 'photo' | 'album'; productOptions?: Record<string, any> }
  ) => {
    const price = size.price;
    const allPhotoIds = photoIds || [photo.id];
    const allPhotos = photos || [{ photo, cropData, position: 1 }];
    const selectedVariantId = Number(options?.productOptions?.whccSelectedVariantId || 0) || 0;
    const selectedVariantLocalId = String(options?.productOptions?.whccSelectedVariantLocalId || '').trim();

    const getItemVariantKey = (item: CartItem): string => {
      const id = Number(item?.productOptions?.whccSelectedVariantId || 0) || 0;
      const localId = String(item?.productOptions?.whccSelectedVariantLocalId || '').trim();
      return `${id}|${localId}`;
    };

    const newItemVariantKey = `${selectedVariantId}|${selectedVariantLocalId}`;


    // Patch: ensure whccSelectedVariantItemAttributeUIDs is always copied to whccItemAttributeUIDs for backend compatibility
    let patchedProductOptions = options?.productOptions ? { ...options.productOptions } : undefined;
    if (patchedProductOptions && Array.isArray(patchedProductOptions.whccSelectedVariantItemAttributeUIDs)) {
      patchedProductOptions.whccItemAttributeUIDs = patchedProductOptions.whccSelectedVariantItemAttributeUIDs;
    }

    // Extract attributes from productOptions (e.g., surface, finish, display name, etc.)
    // Extract selected attribute UIDs from productOptions (for WHCC)
    const extractAttributeUIDs = (opts?: Record<string, any>): number[] => {
      if (!opts) return [];
      // Look for whccItemAttributeUIDs (array of selected UIDs)
      if (Array.isArray(opts.whccItemAttributeUIDs) && opts.whccItemAttributeUIDs.length > 0) {
        // Coerce all UIDs to numbers
        const coerced = opts.whccItemAttributeUIDs.map((x: any) => Number(x)).filter((x: any) => !isNaN(x));
        console.log('[CartContext][DEBUG] Extracted whccItemAttributeUIDs:', opts.whccItemAttributeUIDs, 'Coerced:', coerced);
        return coerced;
      }
      // Fallback: try to infer from selected option keys (for legacy/other products)
      const possibleUIDs: number[] = [];
      const keys = Object.keys(opts);
      for (const k of keys) {
        if (/uid$/i.test(k) && (typeof opts[k] === 'number' || (typeof opts[k] === 'string' && !isNaN(Number(opts[k]))))) {
          possibleUIDs.push(Number(opts[k]));
        }
        // If value is object with uid
        if (opts[k] && typeof opts[k] === 'object' && (typeof opts[k].uid === 'number' || (typeof opts[k].uid === 'string' && !isNaN(Number(opts[k].uid))))) {
          possibleUIDs.push(Number(opts[k].uid));
        }
      }
      console.log('[CartContext][DEBUG] Fallback attributeUIDs:', possibleUIDs, 'from opts:', opts);
      return possibleUIDs;
    };
    const attributeUIDs = extractAttributeUIDs(patchedProductOptions);
    // Patch: fallback to whccFinish or whccSelectedVariantItemAttributeUIDs if attributeUIDs is empty
    let finalAttributeUIDs = attributeUIDs;
    if ((!finalAttributeUIDs || finalAttributeUIDs.length === 0) && patchedProductOptions) {
      if (Array.isArray(patchedProductOptions.whccSelectedVariantItemAttributeUIDs) && patchedProductOptions.whccSelectedVariantItemAttributeUIDs.length > 0) {
        finalAttributeUIDs = patchedProductOptions.whccSelectedVariantItemAttributeUIDs.map(Number).filter(x => !isNaN(x));
      } else if (patchedProductOptions.whccFinish) {
        const finishNum = Number(patchedProductOptions.whccFinish);
        if (!isNaN(finishNum)) finalAttributeUIDs = [finishNum];
      }
    }

    const isDigital = !!(product.isDigital || options?.digitalDownloadScope || product.editorProvider === 'digital');
    setItems((prevItems) => {
      // Debug: log cart item attributes and productOptions before updating cart
      console.log('[CartContext][DEBUG] Adding to cart:', {
        photoId: photo.id,
        productId: product.id,
        productSizeId: size.id,
        attributeUIDs,
        finalAttributeUIDs,
        productOptions: patchedProductOptions,
        allOptions: options
      });
      const existingItem = prevItems.find((item) => (
        item.photoId === photo.id
        && item.productId === product.id
        && item.productSizeId === size.id
        && getItemVariantKey(item) === newItemVariantKey
      ));
      if (isDigital) {
        // For digital products, only allow quantity 1 per photo/product/size/variant
        if (existingItem) {
          // Replace with quantity 1 and update other fields
          return prevItems.map((item) =>
            item.photoId === photo.id
            && item.productId === product.id
            && item.productSizeId === size.id
            && getItemVariantKey(item) === newItemVariantKey
              ? {
                  ...item,
                  quantity: 1,
                  cropData,
                  price,
                  photoIds: allPhotoIds,
                  photos: allPhotos,
                  productName: product.name,
                  productSizeName: size.name,
                  albumId: options?.albumId ?? item.albumId,
                  albumName: options?.albumName ?? item.albumName,
                  albumCoverImageUrl: options?.albumCoverImageUrl ?? item.albumCoverImageUrl,
                  digitalDownloadScope: options?.digitalDownloadScope ?? item.digitalDownloadScope,
                  editorProvider: product.editorProvider ?? item.editorProvider,
                  requiresWhccEditor: product.requiresWhccEditor ?? item.requiresWhccEditor,
                  whccEditorProductId: product.whccEditorProductId ?? item.whccEditorProductId,
                  whccEditorDesignId: product.whccEditorDesignId ?? item.whccEditorDesignId,
                  productOptions: patchedProductOptions ?? item.productOptions,
                  attributes: finalAttributeUIDs.length ? finalAttributeUIDs : item.attributes,
                }
              : item
          );
        }
        // Not in cart yet, add with quantity 1
        return [...prevItems, {
          photoId: photo.id,
          photo,
          albumId: options?.albumId,
          albumName: options?.albumName,
          albumCoverImageUrl: options?.albumCoverImageUrl,
          photoIds: allPhotoIds,
          photos: allPhotos,
          quantity: 1,
          cropData,
          productId: product.id,
          productSizeId: size.id,
          productName: product.name,
          productSizeName: size.name,
          editorProvider: product.editorProvider,
          requiresWhccEditor: product.requiresWhccEditor,
          whccEditorProductId: product.whccEditorProductId,
          whccEditorDesignId: product.whccEditorDesignId,
          digitalDownloadScope: options?.digitalDownloadScope,
          productOptions: patchedProductOptions,
          attributes: finalAttributeUIDs,
          price
        }];
      }
      // Physical products: allow incrementing quantity
      if (existingItem) {
        return prevItems.map((item) =>
          item.photoId === photo.id
          && item.productId === product.id
          && item.productSizeId === size.id
          && getItemVariantKey(item) === newItemVariantKey
            ? {
                ...item,
                quantity: item.quantity + quantity,
                cropData,
                price,
                photoIds: allPhotoIds,
                photos: allPhotos,
                productName: product.name,
                productSizeName: size.name,
                albumId: options?.albumId ?? item.albumId,
                albumName: options?.albumName ?? item.albumName,
                albumCoverImageUrl: options?.albumCoverImageUrl ?? item.albumCoverImageUrl,
                digitalDownloadScope: options?.digitalDownloadScope ?? item.digitalDownloadScope,
                editorProvider: product.editorProvider ?? item.editorProvider,
                requiresWhccEditor: product.requiresWhccEditor ?? item.requiresWhccEditor,
                whccEditorProductId: product.whccEditorProductId ?? item.whccEditorProductId,
                whccEditorDesignId: product.whccEditorDesignId ?? item.whccEditorDesignId,
                productOptions: patchedProductOptions ?? item.productOptions,
                attributes: attributeUIDs.length ? attributeUIDs : item.attributes,
              }
            : item
        );
      }
      return [...prevItems, { 
        photoId: photo.id, 
        photo, 
        albumId: options?.albumId,
        albumName: options?.albumName,
        albumCoverImageUrl: options?.albumCoverImageUrl,
        photoIds: allPhotoIds, 
        photos: allPhotos, 
        quantity, 
        cropData, 
        productId: product.id, 
        productSizeId: size.id, 
        productName: product.name,
        productSizeName: size.name,
        editorProvider: product.editorProvider,
        requiresWhccEditor: product.requiresWhccEditor,
        whccEditorProductId: product.whccEditorProductId,
        whccEditorDesignId: product.whccEditorDesignId,
        digitalDownloadScope: options?.digitalDownloadScope,
        productOptions: patchedProductOptions,
        attributes: attributeUIDs,
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
        productName: pkgItem.product?.name,
        productSizeName: pkgItem.productSize?.name,
        price,
      });
    }

    if (newItems.length === 0) {
      throw new Error('No valid items in package');
    }

    // Add all package items to cart
    setItems((prevItems) => [...prevItems, ...newItems]);
  };

  const removeFromCart = (photoId: number, productId?: number, productSizeId?: number) => {
    setItems((prevItems) => prevItems.filter((item) => {
      if (item.photoId !== photoId) return true;
      if (productId == null && productSizeId == null) return false;
      return !(Number(item.productId || 0) === Number(productId || 0) && Number(item.productSizeId || 0) === Number(productSizeId || 0));
    }));
  };

  const updateQuantity = (photoId: number, quantity: number, productId?: number, productSizeId?: number) => {
    if (quantity <= 0) {
      removeFromCart(photoId, productId, productSizeId);
      return;
    }
    
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.photoId === photoId &&
        (productId == null || Number(item.productId || 0) === Number(productId || 0)) &&
        (productSizeId == null || Number(item.productSizeId || 0) === Number(productSizeId || 0))
          ? { ...item, quantity }
          : item
      )
    );
  };

  // Patch: Always force update, even if cropData is unchanged, to guarantee re-render
  const updateCropData = (photoId: number, cropData: CropData, productId?: number, productSizeId?: number) => {
    console.log('[CartContext] updateCropData - saving cropData:', cropData, 'for photoId:', photoId, 'productId:', productId, 'productSizeId:', productSizeId);
    setItems((prevItems) => {
      let changed = false;
      const next = prevItems.map((item) => {
        const matchPhoto = String(item.photoId) === String(photoId);
        const matchProduct = productId == null || String(item.productId ?? '') === String(productId ?? '');
        const matchSize = productSizeId == null || String(item.productSizeId ?? '') === String(productSizeId ?? '');
        if (matchPhoto && matchProduct && matchSize) {
          changed = true;
          const updated = { ...item, cropData: { ...cropData } };
          console.log('[CartContext] updateCropData: updating item', { item, updated });
          return updated;
        }
        return item;
      });
      if (changed) {
        console.log('[CartContext] updateCropData: new cart state', next);
        return next;
      } else {
        console.log('[CartContext] updateCropData: no change, returning copy', next);
        return [...next];
      }
    });
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

  // Save current cart as a named list
  const saveList = (name: string) => {
    saveListToLocal(name, items);
  };

  // Load a named list into the cart
  const loadList = (name: string) => {
    const loaded = loadListFromLocal(name);
    setItems(loaded);
  };

  const getSavedLists = () => {
    return getSavedListsFromLocal();
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
        saveList,
        loadList,
        getSavedLists,
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

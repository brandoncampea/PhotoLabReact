import { LoginCredentials, RegisterData, AuthResponse, Album, Photo, Order, CartItem, User, ShippingAddress } from '../types';

// Mock users storage
let mockUsers: User[] = [
  {
    id: 1,
    email: 'demo@example.com',
    firstName: 'Demo',
    lastName: 'User',
    role: 'customer',
    isActive: true,
  },
  {
    id: 2,
    email: 'admin@photolab.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true,
  },
];

const mockToken = 'mock-jwt-token-12345';

// Initialize albums from localStorage or use defaults
const initAlbums = (): Album[] => {
  const stored = localStorage.getItem('mockAlbums');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Only use stored data if it has items, otherwise use defaults
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      } else if (Array.isArray(parsed) && parsed.length === 0) {
        // Clear empty array from localStorage
        localStorage.removeItem('mockAlbums');
      }
    } catch (e) {
      console.error('Failed to parse stored albums:', e);
      localStorage.removeItem('mockAlbums');
    }
  }
  return [
    {
      id: 1,
      name: 'Summer Vacation 2025',
      description: 'Beautiful moments from our summer trip',
      coverImageUrl: 'https://picsum.photos/seed/album1/400/300',
      photoCount: 12,
      createdDate: '2025-07-15T00:00:00Z',
      isPasswordProtected: false,
      password: '',
      passwordHint: '',
    },
    {
      id: 2,
      name: 'Family Portraits',
      description: 'Professional family photos',
      coverImageUrl: 'https://picsum.photos/seed/album2/400/300',
      photoCount: 8,
      createdDate: '2025-09-20T00:00:00Z',
      isPasswordProtected: false,
      password: '',
      passwordHint: '',
    },
    {
      id: 3,
      name: 'Nature Photography',
      description: 'Stunning landscapes and wildlife',
      coverImageUrl: 'https://picsum.photos/seed/album3/400/300',
      photoCount: 15,
      createdDate: '2025-10-10T00:00:00Z',
      isPasswordProtected: false,
      password: '',
      passwordHint: '',
    },
  ];
};

let mockAlbums: Album[] = initAlbums();

// Emergency reset: if mockAlbums is empty, force load defaults
if (mockAlbums.length === 0) {
  console.warn('mockAlbums initialized as empty, reloading defaults');
  localStorage.removeItem('mockAlbums');
  mockAlbums = [
    {
      id: 1,
      name: 'Summer Vacation 2025',
      description: 'Beautiful moments from our summer trip',
      coverImageUrl: 'https://picsum.photos/seed/album1/400/300',
      photoCount: 12,
      createdDate: '2025-07-15T00:00:00Z',
      isPasswordProtected: false,
      password: '',
      passwordHint: '',
    },
    {
      id: 2,
      name: 'Family Portraits',
      description: 'Professional family photos',
      coverImageUrl: 'https://picsum.photos/seed/album2/400/300',
      photoCount: 8,
      createdDate: '2025-09-20T00:00:00Z',
      isPasswordProtected: false,
      password: '',
      passwordHint: '',
    },
    {
      id: 3,
      name: 'Nature Photography',
      description: 'Stunning landscapes and wildlife',
      coverImageUrl: 'https://picsum.photos/seed/album3/400/300',
      photoCount: 15,
      createdDate: '2025-10-10T00:00:00Z',
      isPasswordProtected: false,
      password: '',
      passwordHint: '',
    },
  ];
  persistAlbums();
}

// Initialize photos from localStorage or use defaults
const initPhotos = (): Record<number, Photo[]> => {
  const stored = localStorage.getItem('mockPhotos');
  if (stored) {
    try {
      const parsedPhotos = JSON.parse(stored) as Record<number, Photo[]>;
      // Filter out photos with blob URLs that are no longer valid
      const cleanedPhotos: Record<number, Photo[]> = {};
      for (const [albumIdStr, photos] of Object.entries(parsedPhotos)) {
        const albumIdNum = Number(albumIdStr);
        if (Number.isNaN(albumIdNum)) continue;
        cleanedPhotos[albumIdNum] = photos.filter((photo: Photo) => {
          // Keep photos that don't use blob URLs or use valid data URLs
          return !photo.thumbnailUrl.startsWith('blob:') && !photo.fullImageUrl.startsWith('blob:');
        });
      }
      // Only return parsed photos if we have at least some valid photos
      const hasValidPhotos = Object.values(cleanedPhotos).some(photos => photos.length > 0);
      if (hasValidPhotos) {
        // Update album photo counts to match cleaned photos
        mockAlbums = mockAlbums.map(album => ({
          ...album,
          photoCount: cleanedPhotos[album.id]?.length || 0
        }));
        localStorage.setItem('mockAlbums', JSON.stringify(mockAlbums));
        localStorage.setItem('mockPhotos', JSON.stringify(cleanedPhotos));
        return cleanedPhotos;
      }
    } catch (e) {
      console.error('Failed to parse stored photos:', e);
    }
  }
  return {
    1: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      albumId: 1,
      fileName: `summer-photo-${i + 1}.jpg`,
      thumbnailUrl: `https://picsum.photos/seed/photo1-${i}/300/300`,
      fullImageUrl: `https://picsum.photos/seed/photo1-${i}/1200/900`,
      description: `Beautiful summer photo #${i + 1}`,
    })),
    2: Array.from({ length: 8 }, (_, i) => ({
      id: i + 13,
      albumId: 2,
      fileName: `family-photo-${i + 1}.jpg`,
      thumbnailUrl: `https://picsum.photos/seed/photo2-${i}/300/300`,
      fullImageUrl: `https://picsum.photos/seed/photo2-${i}/1200/900`,
      description: `Family portrait #${i + 1}`,
    })),
    3: Array.from({ length: 15 }, (_, i) => ({
      id: i + 21,
      albumId: 3,
      fileName: `nature-photo-${i + 1}.jpg`,
      thumbnailUrl: `https://picsum.photos/seed/photo3-${i}/300/300`,
      fullImageUrl: `https://picsum.photos/seed/photo3-${i}/1200/900`,
      description: `Nature shot #${i + 1}`,
    })),
  };
};

let mockPhotos: Record<number, Photo[]> = initPhotos();

const mockOrders: Order[] = [];

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function persistAlbums() {
  try {
    localStorage.setItem('mockAlbums', JSON.stringify(mockAlbums));
  } catch (error) {
    if (error instanceof Error && error.message.includes('QuotaExceededError')) {
      console.warn('localStorage quota exceeded for mockAlbums. Data may be lost on refresh.');
      // Don't throw - let the operation continue with in-memory data
    } else {
      throw error;
    }
  }
}

// Persist photos cautiously to avoid localStorage quota issues with large data URLs
const MAX_DATA_URL_LENGTH = 150000; // ~150KB per string to keep storage reasonable
let photosPersistenceDisabled = false;

const sanitizePhotosForStorage = (): Record<number, Photo[]> => {
  const sanitized: Record<number, Photo[]> = {};
  for (const [albumIdStr, photos] of Object.entries(mockPhotos)) {
    const albumIdNum = Number(albumIdStr);
    if (Number.isNaN(albumIdNum)) continue;
    sanitized[albumIdNum] = photos.map((photo) => {
      const trimmed: Photo = { ...photo };
      const placeholderThumb = `https://picsum.photos/seed/photo-${photo.id || albumIdNum}/300/300`;
      const placeholderFull = `https://picsum.photos/seed/photo-${photo.id || albumIdNum}/1200/900`;
      const trimDataUrl = (value?: string): string => {
        if (!value) return '';
        const isDataUrl = value.startsWith('data:');
        const isBlob = value.startsWith('blob:');
        if ((isDataUrl && value.length > MAX_DATA_URL_LENGTH) || isBlob) {
          return '';
        }
        return value;
      };
      trimmed.thumbnailUrl = trimDataUrl(trimmed.thumbnailUrl);
      trimmed.fullImageUrl = trimDataUrl(trimmed.fullImageUrl);
      if (!trimmed.thumbnailUrl) trimmed.thumbnailUrl = placeholderThumb;
      if (!trimmed.fullImageUrl) trimmed.fullImageUrl = placeholderFull;
      return trimmed;
    });
  }
  return sanitized;
};

const persistPhotos = () => {
  if (photosPersistenceDisabled) return;
  try {
    const sanitized = sanitizePhotosForStorage();
    localStorage.setItem('mockPhotos', JSON.stringify(sanitized));
  } catch (error) {
    console.warn('Failed to persist photos to localStorage; using in-memory only.', error);
    photosPersistenceDisabled = true;
    try {
      localStorage.removeItem('mockPhotos');
    } catch (e) {
      // ignore secondary failures
    }
  }
};

// Admin functions to modify mock data
export const addMockAlbum = (album: Album) => {
  const normalized: Album = {
    ...album,
    isPasswordProtected: !!album.isPasswordProtected,
    password: album.isPasswordProtected ? album.password || '' : '',
    passwordHint: album.isPasswordProtected ? album.passwordHint || '' : '',
  };
  mockAlbums.push(normalized);
  console.log('Album added to mockAlbums:', normalized);
  console.log('Total albums now:', mockAlbums.length, mockAlbums);
  persistAlbums();
};

export const updateMockAlbum = (id: number, data: Partial<Album>) => {
  const index = mockAlbums.findIndex(a => a.id === id);
  if (index !== -1) {
    const isPasswordProtected = data.isPasswordProtected ?? mockAlbums[index].isPasswordProtected;
    mockAlbums[index] = {
      ...mockAlbums[index],
      ...data,
      isPasswordProtected,
      password: isPasswordProtected ? (data.password ?? mockAlbums[index].password ?? '') : '',
      passwordHint: isPasswordProtected ? (data.passwordHint ?? mockAlbums[index].passwordHint ?? '') : '',
    };
    persistAlbums();
    return mockAlbums[index];
  }
  return null;
};

export const deleteMockAlbum = (id: number) => {
  const index = mockAlbums.findIndex(a => a.id === id);
  if (index !== -1) {
    mockAlbums.splice(index, 1);
    persistAlbums();
    return true;
  }
  return false;
};

export const addMockPhotos = (albumId: number, photos: Photo[]) => {
  if (!mockPhotos[albumId]) {
    mockPhotos[albumId] = [];
  }
  mockPhotos[albumId].push(...photos);
  
  // Update album photo count
  const album = mockAlbums.find(a => a.id === albumId);
  if (album) {
    album.photoCount = mockPhotos[albumId].length;
    persistAlbums();
  }
  persistPhotos();
};

export const updateMockPhoto = (id: number, data: Partial<Photo>) => {
  for (const [albumIdStr, photos] of Object.entries(mockPhotos)) {
    const albumIdNum = Number(albumIdStr);
    if (Number.isNaN(albumIdNum)) continue;
    const index = photos.findIndex(p => p.id === id);
    if (index !== -1) {
      mockPhotos[albumIdNum][index] = { ...mockPhotos[albumIdNum][index], ...data };
      persistPhotos();
      return mockPhotos[albumIdNum][index];
    }
  }
  return null;
};

export const deleteMockPhoto = (id: number) => {
  for (const [albumIdStr, photos] of Object.entries(mockPhotos)) {
    const albumIdNum = Number(albumIdStr);
    if (Number.isNaN(albumIdNum)) continue;
    const index = photos.findIndex(p => p.id === id);
    if (index !== -1) {
      mockPhotos[albumIdNum].splice(index, 1);
      
      // Update album photo count
      const album = mockAlbums.find(a => a.id === albumIdNum);
      if (album) {
        persistAlbums();
      }
      persistPhotos();
      
      return true;
    }
  }
  return false;
};

export const mockApi = {
  auth: {
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
      await delay(500);
      console.log('Mock API: Login with', credentials.email);
      
      const user = mockUsers.find(u => u.email === credentials.email);
      if (user && user.isActive) {
        return {
          user,
          token: mockToken,
        };
      }
      
      if (user && !user.isActive) {
        throw new Error('Account is deactivated');
      }
      
      throw new Error('Invalid credentials');
    },

    async register(data: RegisterData): Promise<AuthResponse> {
      await delay(500);
      console.log('Mock API: Register user', data.email);
      
      const newUser: User = {
        id: mockUsers.length + 1,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'customer',
        isActive: true,
      };
      
      mockUsers.push(newUser);
      
      return {
        user: newUser,
        token: mockToken,
      };
    },
  },

  albums: {
    async getAlbums(): Promise<Album[]> {
      await delay(300);
      // If mockAlbums is empty but localStorage has data, try to reload from defaults
      if (mockAlbums.length === 0) {
        const stored = localStorage.getItem('mockAlbums');
        if (stored === '[]' || stored === null) {
          localStorage.removeItem('mockAlbums');
          // Reload default albums
          mockAlbums = [
            {
              id: 1,
              name: 'Summer Vacation 2025',
              description: 'Beautiful moments from our summer trip',
              coverImageUrl: 'https://picsum.photos/seed/album1/400/300',
              photoCount: 12,
              createdDate: '2025-07-15T00:00:00Z',
              isPasswordProtected: false,
              password: '',
              passwordHint: '',
            },
            {
              id: 2,
              name: 'Family Portraits',
              description: 'Professional family photos',
              coverImageUrl: 'https://picsum.photos/seed/album2/400/300',
              photoCount: 8,
              createdDate: '2025-09-20T00:00:00Z',
              isPasswordProtected: false,
              password: '',
              passwordHint: '',
            },
            {
              id: 3,
              name: 'Nature Photography',
              description: 'Stunning landscapes and wildlife',
              coverImageUrl: 'https://picsum.photos/seed/album3/400/300',
              photoCount: 15,
              createdDate: '2025-10-10T00:00:00Z',
              isPasswordProtected: false,
              password: '',
              passwordHint: '',
            },
          ];
          persistAlbums();
        }
      }
      console.log('Mock API: Fetching albums', mockAlbums.length, 'albums:', mockAlbums);
      return mockAlbums;
    },

    async getAlbum(id: number): Promise<Album> {
      await delay(200);
      console.log('Mock API: Fetching album', id);
      const album = mockAlbums.find(a => a.id === id);
      if (!album) throw new Error('Album not found');
      return album;
    },
  },

  photos: {
    async getPhotosByAlbum(albumId: number): Promise<Photo[]> {
      await delay(400);
      console.log('Mock API: Fetching photos for album', albumId);
      const hasAnyPhotos = Object.values(mockPhotos).some(arr => arr && arr.length > 0);
      if ((!mockPhotos[albumId] || mockPhotos[albumId].length === 0) && !hasAnyPhotos) {
        console.warn('mockPhotos empty; reloading default photos');
        mockPhotos = initPhotos();
      }
      // Sync album photo counts with current photos
      const album = mockAlbums.find(a => a.id === albumId);
      if (album) {
        album.photoCount = mockPhotos[albumId]?.length || 0;
        persistAlbums();
      }
      persistPhotos();
      const photos = mockPhotos[albumId] || [];
      // Ensure thumbnails/full URLs are present (in case storage trimming removed them)
      return photos.map((photo) => {
        const placeholderThumb = `https://picsum.photos/seed/photo-${photo.id || albumId}/300/300`;
        const placeholderFull = `https://picsum.photos/seed/photo-${photo.id || albumId}/1200/900`;
        return {
          ...photo,
          thumbnailUrl: photo.thumbnailUrl || placeholderThumb,
          fullImageUrl: photo.fullImageUrl || placeholderFull,
        };
      });
    },

    async getPhoto(id: number): Promise<Photo> {
      await delay(200);
      console.log('Mock API: Fetching photo', id);
      const allPhotos = Object.values(mockPhotos).flat();
      const photo = allPhotos.find(p => p.id === id);
      if (!photo) throw new Error('Photo not found');
      return photo;
    },
  },

  orders: {
    async createOrder(
      items: CartItem[], 
      shippingAddress: ShippingAddress,
      shippingOption: 'batch' | 'direct' | 'none',
      shippingCost: number,
      discountCode?: string
    ): Promise<Order> {
      await delay(600);
      console.log('Mock API: Creating order with', items.length, 'items');
      console.log('Shipping Address:', shippingAddress);
      console.log('Shipping Option:', shippingOption, 'Cost:', shippingCost);
      if (discountCode) console.log('Discount Code:', discountCode);
      
      const order: Order = {
        id: mockOrders.length + 1,
        userId: mockUsers[0]?.id || 1,
        orderDate: new Date().toISOString(),
        totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0) + shippingCost,
        status: 'Processing',
        shippingOption,
        shippingCost,
        shippingAddress,
        items: items.map((item, index) => ({
          id: index + 1,
          photoId: item.photoId,
          photo: item.photo,
          quantity: item.quantity,
          price: item.price,
          cropData: item.cropData,
        })),
      };
      mockOrders.push(order);
      
      // Log email receipt simulation
      console.log('\ud83d\udce7 Email Receipt Sent:');
      console.log('  To:', shippingAddress.email);
      console.log('  Order #:', `ORD-${order.id}`);
      console.log('  Total:', `$${order.totalAmount.toFixed(2)}`);
      console.log('  Items:', items.length);
      
      return order;
    },

    async getOrders(): Promise<Order[]> {
      await delay(300);
      console.log('Mock API: Fetching orders');
      return mockOrders;
    },

    async getOrder(id: number): Promise<Order> {
      await delay(200);
      console.log('Mock API: Fetching order', id);
      const order = mockOrders.find(o => o.id === id);
      if (!order) throw new Error('Order not found');
      return order;
    },
  },
};

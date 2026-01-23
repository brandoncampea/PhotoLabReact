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

const mockAlbums: Album[] = [
  {
    id: 1,
    name: 'Summer Vacation 2025',
    description: 'Beautiful moments from our summer trip',
    coverImageUrl: 'https://picsum.photos/seed/album1/400/300',
    photoCount: 12,
    createdDate: '2025-07-15T00:00:00Z',
  },
  {
    id: 2,
    name: 'Family Portraits',
    description: 'Professional family photos',
    coverImageUrl: 'https://picsum.photos/seed/album2/400/300',
    photoCount: 8,
    createdDate: '2025-09-20T00:00:00Z',
  },
  {
    id: 3,
    name: 'Nature Photography',
    description: 'Stunning landscapes and wildlife',
    coverImageUrl: 'https://picsum.photos/seed/album3/400/300',
    photoCount: 15,
    createdDate: '2025-10-10T00:00:00Z',
  },
];

const mockPhotos: Record<number, Photo[]> = {
  1: Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    albumId: 1,
    fileName: `summer-photo-${i + 1}.jpg`,
    thumbnailUrl: `https://picsum.photos/seed/photo1-${i}/300/300`,
    fullImageUrl: `https://picsum.photos/seed/photo1-${i}/1200/900`,
    price: 9.99 + (i % 3),
    description: `Beautiful summer photo #${i + 1}`,
  })),
  2: Array.from({ length: 8 }, (_, i) => ({
    id: i + 13,
    albumId: 2,
    fileName: `family-photo-${i + 1}.jpg`,
    thumbnailUrl: `https://picsum.photos/seed/photo2-${i}/300/300`,
    fullImageUrl: `https://picsum.photos/seed/photo2-${i}/1200/900`,
    price: 14.99 + (i % 2),
    description: `Family portrait #${i + 1}`,
  })),
  3: Array.from({ length: 15 }, (_, i) => ({
    id: i + 21,
    albumId: 3,
    fileName: `nature-photo-${i + 1}.jpg`,
    thumbnailUrl: `https://picsum.photos/seed/photo3-${i}/300/300`,
    fullImageUrl: `https://picsum.photos/seed/photo3-${i}/1200/900`,
    price: 12.99 + (i % 4),
    description: `Nature shot #${i + 1}`,
  })),
};

const mockOrders: Order[] = [];

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
      console.log('Mock API: Fetching albums');
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
      return mockPhotos[albumId] || [];
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
        totalAmount: items.reduce((sum, item) => sum + item.photo.price * item.quantity, 0) + shippingCost,
        status: 'Processing',
        shippingOption,
        shippingCost,
        shippingAddress,
        items: items.map((item, index) => ({
          id: index + 1,
          photoId: item.photoId,
          photo: item.photo,
          quantity: item.quantity,
          price: item.photo.price,
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

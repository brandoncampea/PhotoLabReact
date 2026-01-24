import { AdminUser, Watermark, Customer, DashboardStats, Album, Photo, Order, ShippingConfig, StripeConfig, UserAccount, Package, PackageItem, Product, DiscountCode, ProfileConfig, PriceList } from '../types';
import { addMockAlbum, updateMockAlbum, deleteMockAlbum, addMockPhotos, updateMockPhoto, deleteMockPhoto } from './mockApi';

// Mock admin user
const mockAdminUser: AdminUser = {
  id: 1,
  email: 'admin@photolab.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
};

const mockAdminToken = 'mock-admin-jwt-token-67890';

// Mock shipping configuration
let mockShippingConfig: ShippingConfig = {
  id: 1,
  batchDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  directShippingCharge: 15.00,
  isActive: true,
};

// Mock Stripe configuration
let mockStripeConfig: StripeConfig = {
  id: 1,
  publishableKey: 'pk_test_51ExamplePublishableKey',
  secretKey: 'sk_test_51ExampleSecretKey',
  isLiveMode: false,
  isActive: true,
  webhookSecret: 'whsec_example_webhook_secret',
};

// Mock Profile configuration
let mockProfileConfig: ProfileConfig = {
  id: 1,
  ownerName: 'John Smith',
  businessName: 'PhotoLab Studio',
  email: 'admin@photolab.com',
  receiveOrderNotifications: true,
  logoUrl: '',
};

// Mock album categories
let mockCategories: string[] = ['Weddings', 'Portraits', 'Events', 'Nature'];

// Mock products
let mockProducts: Product[] = [
  {
    id: 1,
    name: 'Standard Print',
    description: 'High quality photo print',
    sizes: [
      { id: 1, name: '4x6', width: 4, height: 6, price: 9.99 },
      { id: 2, name: '5x7', width: 5, height: 7, price: 11.99 },
      { id: 3, name: '8x10', width: 8, height: 10, price: 14.99 },
    ],
    isActive: true,
    popularity: 100,
    isDigital: false,
  },
  {
    id: 2,
    name: 'Canvas Print',
    description: 'Museum quality canvas',
    sizes: [
      { id: 4, name: '12x16', width: 12, height: 16, price: 29.99 },
      { id: 5, name: '16x20', width: 16, height: 20, price: 39.99 },
      { id: 6, name: '24x36', width: 24, height: 36, price: 59.99 },
    ],
    isActive: true,
    popularity: 75,
    isDigital: false,
  },
  {
    id: 3,
    name: 'Digital Download',
    description: 'High-resolution digital file',
    sizes: [
      { id: 7, name: 'Original', width: 0, height: 0, price: 4.99 },
      { id: 8, name: '4K', width: 3840, height: 2160, price: 6.99 },
      { id: 9, name: '8K', width: 7680, height: 4320, price: 9.99 },
    ],
    isActive: true,
    popularity: 90,
    isDigital: true,
  },
];

// Mock watermarks
let mockWatermarks: Watermark[] = [
  {
    id: 1,
    name: 'Photo Lab Logo',
    imageUrl: 'https://picsum.photos/seed/watermark1/200/80',
    position: 'bottom-right',
    opacity: 0.5,
    isDefault: true,
    tiled: false,
  },
  {
    id: 2,
    name: 'Copyright',
    imageUrl: 'https://picsum.photos/seed/watermark2/150/50',
    position: 'bottom-left',
    opacity: 0.3,
    isDefault: false,
    tiled: false,
  },
  {
    id: 3,
    name: 'Pattern Watermark',
    imageUrl: 'https://picsum.photos/seed/watermark3/100/100',
    position: 'center',
    opacity: 0.2,
    isDefault: false,
    tiled: true,
  },
];

// Mock user accounts
let mockUserAccounts: UserAccount[] = [
  {
    id: 1,
    email: 'demo@example.com',
    firstName: 'Demo',
    lastName: 'User',
    role: 'customer',
    registeredDate: '2025-01-15T00:00:00Z',
    totalOrders: 3,
    totalSpent: 127.85,
    isActive: true,
    lastLoginDate: '2026-01-20T10:30:00Z',
  },
  {
    id: 2,
    email: 'admin@photolab.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    registeredDate: '2024-12-01T00:00:00Z',
    totalOrders: 0,
    totalSpent: 0,
    isActive: true,
    lastLoginDate: '2026-01-23T08:15:00Z',
  },
  {
    id: 3,
    email: 'customer1@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'customer',
    registeredDate: '2025-02-20T00:00:00Z',
    totalOrders: 1,
    totalSpent: 45.99,
    isActive: true,
    lastLoginDate: '2026-01-22T14:20:00Z',
  },
];

// Mock packages
let mockPackages: Package[] = [
  {
    id: 1,
    name: 'Starter Package',
    description: '10 standard prints at a discounted rate',
    packagePrice: 79.99,
    items: [
      { productId: 1, productSizeId: 1, quantity: 10 },
    ],
    isActive: true,
    createdDate: '2025-12-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Family Package',
    description: 'Mix of prints and canvas for the whole family',
    packagePrice: 149.99,
    items: [
      { productId: 1, productSizeId: 3, quantity: 5 },
      { productId: 2, productSizeId: 4, quantity: 2 },
      { productId: 3, productSizeId: 7, quantity: 10 },
    ],
    isActive: true,
    createdDate: '2025-12-15T00:00:00Z',
  },
  {
    id: 3,
    name: 'Premium Package',
    description: 'Best value - large format prints and digitals',
    packagePrice: 299.99,
    items: [
      { productId: 1, productSizeId: 3, quantity: 10 },
      { productId: 2, productSizeId: 5, quantity: 5 },
      { productId: 2, productSizeId: 6, quantity: 2 },
      { productId: 3, productSizeId: 8, quantity: 20 },
    ],
    isActive: true,
    createdDate: '2025-11-20T00:00:00Z',
  },
];

// Mock discount codes
let mockDiscountCodes: DiscountCode[] = [
  {
    id: 1,
    code: 'WELCOME10',
    description: '10% off entire order for new customers',
    discountType: 'percentage',
    discountValue: 10,
    applicationType: 'entire-order',
    applicableProductIds: [],
    expirationDate: '2026-12-31T23:59:59Z',
    isOneTimeUse: true,
    usageCount: 0,
    maxUsages: undefined,
    isActive: true,
    createdDate: '2025-12-01T00:00:00Z',
  },
  {
    id: 2,
    code: 'CANVAS20',
    description: '$20 off canvas prints',
    discountType: 'fixed',
    discountValue: 20,
    applicationType: 'specific-products',
    applicableProductIds: [2],
    expirationDate: '2026-06-30T23:59:59Z',
    isOneTimeUse: false,
    usageCount: 15,
    maxUsages: 100,
    isActive: true,
    createdDate: '2025-11-15T00:00:00Z',
  },
  {
    id: 3,
    code: 'SAVE50',
    description: '$50 off orders over $200',
    discountType: 'fixed',
    discountValue: 50,
    applicationType: 'entire-order',
    applicableProductIds: [],
    expirationDate: '2026-03-31T23:59:59Z',
    isOneTimeUse: false,
    usageCount: 8,
    maxUsages: 50,
    isActive: true,
    createdDate: '2026-01-01T00:00:00Z',
  },
];

// Mock customers
let mockCustomers: Customer[] = [
  {
    id: 1,
    email: 'demo@example.com',
    firstName: 'Demo',
    lastName: 'User',
    registeredDate: '2025-01-15T00:00:00Z',
    totalOrders: 3,
    totalSpent: 127.85,
    isActive: true,
  },
  {
    id: 2,
    email: 'customer1@example.com',
    firstName: 'John',
    lastName: 'Doe',
    registeredDate: '2025-02-20T00:00:00Z',
    totalOrders: 1,
    totalSpent: 45.99,
    isActive: true,
  },
];

// Mock price lists (now containing products and their pricing)
let mockPriceLists: PriceList[] = [
  {
    id: 1,
    name: 'Standard Pricing',
    description: 'Default pricing for all products',
    isActive: true,
    createdDate: '2025-12-01T00:00:00Z',
    products: [
      {
        id: 1,
        priceListId: 1,
        name: 'Standard Print',
        description: 'High quality photo print',
        isDigital: false,
        sizes: [
          { id: 1, productId: 1, name: '4x6', width: 4, height: 6, price: 9.99, cost: 3.50 },
          { id: 2, productId: 1, name: '5x7', width: 5, height: 7, price: 11.99, cost: 4.25 },
          { id: 3, productId: 1, name: '8x10', width: 8, height: 10, price: 14.99, cost: 5.50 },
        ],
      },
      {
        id: 2,
        priceListId: 1,
        name: 'Canvas Print',
        description: 'Museum quality canvas',
        isDigital: false,
        sizes: [
          { id: 4, productId: 2, name: '12x16', width: 12, height: 16, price: 29.99, cost: 12.00 },
          { id: 5, productId: 2, name: '16x20', width: 16, height: 20, price: 39.99, cost: 16.00 },
          { id: 6, productId: 2, name: '24x36', width: 24, height: 36, price: 59.99, cost: 24.00 },
        ],
      },
      {
        id: 3,
        priceListId: 1,
        name: 'Digital Download',
        description: 'High-resolution digital file',
        isDigital: true,
        sizes: [
          { id: 7, productId: 3, name: 'Original', width: 0, height: 0, price: 4.99, cost: 0.50 },
          { id: 8, productId: 3, name: '4K', width: 3840, height: 2160, price: 6.99, cost: 0.75 },
          { id: 9, productId: 3, name: '8K', width: 7680, height: 4320, price: 9.99, cost: 1.00 },
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'Discount Pricing',
    description: 'Special pricing for volume orders',
    isActive: true,
    createdDate: '2025-12-15T00:00:00Z',
    products: [
      {
        id: 1,
        priceListId: 2,
        name: 'Standard Print',
        description: 'High quality photo print',
        isDigital: false,
        sizes: [
          { id: 1, productId: 1, name: '4x6', width: 4, height: 6, price: 8.99, cost: 3.50 },
          { id: 2, productId: 1, name: '5x7', width: 5, height: 7, price: 10.99, cost: 4.25 },
          { id: 3, productId: 1, name: '8x10', width: 8, height: 10, price: 13.99, cost: 5.50 },
        ],
      },
      {
        id: 2,
        priceListId: 2,
        name: 'Canvas Print',
        description: 'Museum quality canvas',
        isDigital: false,
        sizes: [
          { id: 4, productId: 2, name: '12x16', width: 12, height: 16, price: 27.99, cost: 12.00 },
          { id: 5, productId: 2, name: '16x20', width: 16, height: 20, price: 36.99, cost: 16.00 },
          { id: 6, productId: 2, name: '24x36', width: 24, height: 36, price: 54.99, cost: 24.00 },
        ],
      },
    ],
  },
];


























































































































































































































































































































// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const adminMockApi = {
  auth: {
    async login(email: string, _password: string): Promise<{ user: AdminUser; token: string }> {
      await delay(500);
      console.log('Admin Mock API: Login with', email);
      if (email.includes('admin')) {
        return {
          user: mockAdminUser,
          token: mockAdminToken,
        };
      }
      throw new Error('Invalid admin credentials');
    },
  },

  dashboard: {
    async getStats(): Promise<DashboardStats> {
      await delay(400);
      console.log('Admin Mock API: Fetching dashboard stats');
      return {
        totalOrders: 24,
        totalRevenue: 2456.78,
        totalCustomers: mockCustomers.length,
        pendingOrders: 3,
        recentOrders: [],
        topAlbums: [],
      };
    },
  },

  albums: {
    async create(data: Partial<Album>): Promise<Album> {
      await delay(500);
      console.log('Admin Mock API: Creating album', data);
      const newAlbum: Album = {
        id: Math.floor(Math.random() * 10000) + 1000,
        name: data.name || '',
        description: data.description || '',
        coverImageUrl: data.coverImageUrl || 'https://picsum.photos/seed/nocover/400/300',
        photoCount: 0,
        createdDate: new Date().toISOString(),
        category: data.category,
      };
      addMockAlbum(newAlbum);
      return newAlbum;
    },

    async update(id: number, data: Partial<Album>): Promise<Album> {
      await delay(400);
      console.log('Admin Mock API: Updating album', id, data);
      const updated = updateMockAlbum(id, data);
      if (updated) {
        return updated;
      }
      // Fallback if album not found
      return {
        id,
        name: data.name || '',
        description: data.description || '',
        coverImageUrl: data.coverImageUrl || 'https://picsum.photos/seed/nocover/400/300',
        photoCount: data.photoCount || 0,
        createdDate: new Date().toISOString(),
        category: data.category,
      };
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting album', id);
      deleteMockAlbum(id);
    },

    async getCategories(): Promise<string[]> {
      await delay(200);
      console.log('Admin Mock API: Fetching categories');
      return [...mockCategories];
    },

    async addCategory(category: string): Promise<string[]> {
      await delay(300);
      console.log('Admin Mock API: Adding category', category);
      if (!mockCategories.includes(category)) {
        mockCategories.push(category);
      }
      return [...mockCategories];
    },
  },

  photos: {
    async upload(albumId: number, filesWithMetadata: Array<{ file: File; metadata: any }>): Promise<Photo[]> {
      await delay(1000);
      console.log('Admin Mock API: Uploading', filesWithMetadata.length, 'photos with metadata to album', albumId);
      
      // Convert files to data URLs for persistence
      const photoPromises = filesWithMetadata.map(async ({ file, metadata }) => {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        return {
          id: Math.floor(Math.random() * 100000) + 10000,
          albumId,
          fileName: file.name,
          thumbnailUrl: dataUrl,
          fullImageUrl: dataUrl,
          description: '',
          metadata,
        };
      });
      
      const newPhotos = await Promise.all(photoPromises);
      addMockPhotos(albumId, newPhotos);
      return newPhotos;
    },

    async update(id: number, data: Partial<Photo>): Promise<Photo> {
      await delay(400);
      console.log('Admin Mock API: Updating photo', id, data);
      const updated = updateMockPhoto(id, data);
      if (updated) {
        return updated;
      }
      // Fallback if photo not found
      return {
        id,
        albumId: data.albumId || 1,
        fileName: data.fileName || '',
        thumbnailUrl: data.thumbnailUrl || '',
        fullImageUrl: data.fullImageUrl || '',
        description: data.description,
        metadata: data.metadata,
      };
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting photo', id);
      deleteMockPhoto(id);
    },
  },

  products: {
    // Products are now managed within price lists
    // This section provides compatibility API for getting all products across all price lists
    async getAll() {
      await delay(300);
      console.log('Admin Mock API: Fetching all products across price lists');
      const allProducts: any[] = [];
      const seenIds = new Set<number>();
      
      mockPriceLists.forEach(priceList => {
        priceList.products.forEach(product => {
          if (!seenIds.has(product.id)) {
            seenIds.add(product.id);
            allProducts.push(product);
          }
        });
      });
      
      return allProducts;
    },

    async create() {
      throw new Error('Products must be created within a price list. Use priceLists.addProduct() instead.');
    },

    async update() {
      throw new Error('Products must be updated within a price list. Use priceLists.updateProduct() instead.');
    },

    async delete() {
      throw new Error('Products must be deleted within a price list. Use priceLists.removeProduct() instead.');
    },
  },

  watermarks: {
    async getAll(): Promise<Watermark[]> {
      await delay(300);
      console.log('Admin Mock API: Fetching watermarks');
      return mockWatermarks;
    },

    async create(data: Partial<Watermark>): Promise<Watermark> {
      await delay(400);
      console.log('Admin Mock API: Creating watermark', data);
      const watermark: Watermark = {
        id: mockWatermarks.length + 1,
        name: data.name || '',
        imageUrl: data.imageUrl || '',
        position: data.position || 'bottom-right',
        opacity: data.opacity || 0.5,
        isDefault: data.isDefault || false,        tiled: data.tiled ?? false,      };
      mockWatermarks.push(watermark);
      return watermark;
    },

    async update(id: number, data: Partial<Watermark>): Promise<Watermark> {
      await delay(400);
      console.log('Admin Mock API: Updating watermark', id, data);
      const index = mockWatermarks.findIndex(w => w.id === id);
      if (index !== -1) {
        mockWatermarks[index] = { ...mockWatermarks[index], ...data };
        return mockWatermarks[index];
      }
      throw new Error('Watermark not found');
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting watermark', id);
      mockWatermarks = mockWatermarks.filter(w => w.id !== id);
    },
  },

  orders: {
    async getAll(): Promise<Order[]> {
      await delay(400);
      console.log('Admin Mock API: Fetching all orders');
      return [];
    },

    async updateStatus(id: number, status: string): Promise<Order> {
      await delay(400);
      console.log('Admin Mock API: Updating order status', id, status);
      return {
        id,
        userId: 1,
        orderDate: new Date().toISOString(),
        totalAmount: 0,
        status,
        items: [],
        shippingOption: 'batch',
        shippingCost: 0,
        shippingAddress: {
          fullName: 'Mock User',
          addressLine1: '123 Main St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'United States',
          email: 'test@example.com'
        }
      };
    },
  },

  customers: {
    async getAll(): Promise<Customer[]> {
      await delay(400);
      console.log('Admin Mock API: Fetching customers');
      return mockCustomers;
    },

    async update(id: number, data: Partial<Customer>): Promise<Customer> {
      await delay(400);
      console.log('Admin Mock API: Updating customer', id, data);
      const index = mockCustomers.findIndex(c => c.id === id);
      if (index !== -1) {
        mockCustomers[index] = { ...mockCustomers[index], ...data };
        return mockCustomers[index];
      }
      throw new Error('Customer not found');
    },

    async toggleActive(id: number): Promise<Customer> {
      await delay(300);
      console.log('Admin Mock API: Toggling customer active status', id);
      const index = mockCustomers.findIndex(c => c.id === id);
      if (index !== -1) {
        mockCustomers[index].isActive = !mockCustomers[index].isActive;
        return mockCustomers[index];
      }
      throw new Error('Customer not found');
    },
  },

  shipping: {
    async getConfig(): Promise<ShippingConfig> {
      await delay(300);
      console.log('Admin Mock API: Fetching shipping config');
      return mockShippingConfig;
    },

    async updateConfig(data: Partial<ShippingConfig>): Promise<ShippingConfig> {
      await delay(400);
      console.log('Admin Mock API: Updating shipping config', data);
      mockShippingConfig = { ...mockShippingConfig, ...data };
      return mockShippingConfig;
    },
  },

  stripe: {
    async getConfig(): Promise<StripeConfig> {
      await delay(300);
      console.log('Admin Mock API: Fetching Stripe config');
      return mockStripeConfig;
    },

    async updateConfig(data: Partial<StripeConfig>): Promise<StripeConfig> {
      await delay(400);
      console.log('Admin Mock API: Updating Stripe config', data);
      mockStripeConfig = { ...mockStripeConfig, ...data };
      return mockStripeConfig;
    },
  },

  profile: {
    async getConfig(): Promise<ProfileConfig> {
      await delay(300);
      console.log('Admin Mock API: Fetching profile config');
      return mockProfileConfig;
    },

    async updateConfig(data: Partial<ProfileConfig>): Promise<ProfileConfig> {
      await delay(400);
      console.log('Admin Mock API: Updating profile config', data);
      mockProfileConfig = { ...mockProfileConfig, ...data };
      return mockProfileConfig;
    },
  },

  users: {
    async getAll(): Promise<UserAccount[]> {
      await delay(400);
      console.log('Admin Mock API: Fetching all user accounts');
      return mockUserAccounts;
    },

    async update(id: number, data: Partial<UserAccount>): Promise<UserAccount> {
      await delay(400);
      console.log('Admin Mock API: Updating user account', id, data);
      const index = mockUserAccounts.findIndex(u => u.id === id);
      if (index !== -1) {
        mockUserAccounts[index] = { ...mockUserAccounts[index], ...data };
        return mockUserAccounts[index];
      }
      throw new Error('User not found');
    },

    async toggleActive(id: number): Promise<UserAccount> {
      await delay(300);
      console.log('Admin Mock API: Toggling user active status', id);
      const index = mockUserAccounts.findIndex(u => u.id === id);
      if (index !== -1) {
        mockUserAccounts[index].isActive = !mockUserAccounts[index].isActive;
        return mockUserAccounts[index];
      }
      throw new Error('User not found');
    },

    async changeRole(id: number, role: 'customer' | 'admin'): Promise<UserAccount> {
      await delay(400);
      console.log('Admin Mock API: Changing user role', id, role);
      const index = mockUserAccounts.findIndex(u => u.id === id);
      if (index !== -1) {
        mockUserAccounts[index].role = role;
        return mockUserAccounts[index];
      }
      throw new Error('User not found');
    },
  },

  packages: {
    async getAll(): Promise<Package[]> {
      await delay(300);
      console.log('Admin Mock API: Fetching packages');
      return mockPackages.map(pkg => ({
        ...pkg,
        items: pkg.items.map((item: PackageItem) => {
          const product = mockProducts.find(p => p.id === item.productId);
          const productSize = product?.sizes.find((s: any) => s.id === item.productSizeId);
          return {
            ...item,
            product,
            productSize,
          };
        }),
      }));
    },

    async getById(id: number): Promise<Package> {
      await delay(200);
      console.log('Admin Mock API: Fetching package', id);
      const pkg = mockPackages.find(p => p.id === id);
      if (!pkg) throw new Error('Package not found');
      return {
        ...pkg,
        items: pkg.items.map((item: PackageItem) => {
          const product = mockProducts.find(p => p.id === item.productId);
          const productSize = product?.sizes.find((s: any) => s.id === item.productSizeId);
          return {
            ...item,
            product,
            productSize,
          };
        }),
      };
    },

    async create(data: Partial<Package>): Promise<Package> {
      await delay(400);
      console.log('Admin Mock API: Creating package', data);
      const newPackage: Package = {
        id: mockPackages.length + 1,
        name: data.name || '',
        description: data.description || '',
        packagePrice: data.packagePrice || 0,
        items: data.items || [],
        isActive: data.isActive ?? true,
        createdDate: new Date().toISOString(),
      };
      mockPackages.push(newPackage);
      return newPackage;
    },

    async update(id: number, data: Partial<Package>): Promise<Package> {
      await delay(400);
      console.log('Admin Mock API: Updating package', id, data);
      const index = mockPackages.findIndex(p => p.id === id);
      if (index !== -1) {
        mockPackages[index] = { ...mockPackages[index], ...data };
        return mockPackages[index];
      }
      throw new Error('Package not found');
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting package', id);
      const index = mockPackages.findIndex(p => p.id === id);
      if (index !== -1) {
        mockPackages.splice(index, 1);
      }
    },
  },

  discountCodes: {
    async getAll(): Promise<DiscountCode[]> {
      await delay(300);
      console.log('Admin Mock API: Fetching discount codes');
      return mockDiscountCodes;
    },

    async getById(id: number): Promise<DiscountCode> {
      await delay(200);
      console.log('Admin Mock API: Fetching discount code', id);
      const code = mockDiscountCodes.find(c => c.id === id);
      if (!code) throw new Error('Discount code not found');
      return code;
    },

    async getByCode(code: string): Promise<DiscountCode | null> {
      await delay(200);
      console.log('Admin Mock API: Validating discount code', code);
      const discountCode = mockDiscountCodes.find(
        c => c.code.toLowerCase() === code.toLowerCase() && c.isActive
      );
      
      if (!discountCode) return null;
      
      // Check if expired
      if (new Date(discountCode.expirationDate) < new Date()) {
        return null;
      }
      
      // Check if max usages reached
      if (discountCode.maxUsages && discountCode.usageCount >= discountCode.maxUsages) {
        return null;
      }
      
      return discountCode;
    },

    async create(data: Partial<DiscountCode>): Promise<DiscountCode> {
      await delay(400);
      console.log('Admin Mock API: Creating discount code', data);
      const newCode: DiscountCode = {
        id: mockDiscountCodes.length + 1,
        code: data.code || '',
        description: data.description || '',
        discountType: data.discountType || 'percentage',
        discountValue: data.discountValue || 0,
        applicationType: data.applicationType || 'entire-order',
        applicableProductIds: data.applicableProductIds || [],
        expirationDate: data.expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isOneTimeUse: data.isOneTimeUse ?? false,
        usageCount: 0,
        maxUsages: data.maxUsages,
        isActive: data.isActive ?? true,
        createdDate: new Date().toISOString(),
      };
      mockDiscountCodes.push(newCode);
      return newCode;
    },

    async update(id: number, data: Partial<DiscountCode>): Promise<DiscountCode> {
      await delay(400);
      console.log('Admin Mock API: Updating discount code', id, data);
      const index = mockDiscountCodes.findIndex(c => c.id === id);
      if (index !== -1) {
        mockDiscountCodes[index] = { ...mockDiscountCodes[index], ...data };
        return mockDiscountCodes[index];
      }
      throw new Error('Discount code not found');
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting discount code', id);
      const index = mockDiscountCodes.findIndex(c => c.id === id);
      if (index !== -1) {
        mockDiscountCodes.splice(index, 1);
      }
    },

    async incrementUsage(id: number): Promise<void> {
      await delay(200);
      console.log('Admin Mock API: Incrementing discount code usage', id);
      const index = mockDiscountCodes.findIndex(c => c.id === id);
      if (index !== -1) {
        mockDiscountCodes[index].usageCount++;
      }
    },
  },

  priceLists: {
    async getAll(): Promise<PriceList[]> {
      await delay(300);
      console.log('Admin Mock API: Fetching price lists');
      return mockPriceLists;
    },

    async getById(id: number): Promise<PriceList> {
      await delay(200);
      console.log('Admin Mock API: Fetching price list', id);
      const priceList = mockPriceLists.find(pl => pl.id === id);
      if (!priceList) throw new Error('Price list not found');
      return priceList;
    },

    async create(data: Partial<PriceList>): Promise<PriceList> {
      await delay(400);
      console.log('Admin Mock API: Creating price list', data);
      const newPriceList: PriceList = {
        id: Math.max(...mockPriceLists.map(pl => pl.id), 0) + 1,
        name: data.name || '',
        description: data.description,
        products: data.products || [],
        isActive: data.isActive ?? true,
        createdDate: new Date().toISOString(),
      };
      mockPriceLists.push(newPriceList);
      return newPriceList;
    },

    async update(id: number, data: Partial<PriceList>): Promise<PriceList> {
      await delay(400);
      console.log('Admin Mock API: Updating price list', id, data);
      const index = mockPriceLists.findIndex(pl => pl.id === id);
      if (index !== -1) {
        mockPriceLists[index] = { 
          ...mockPriceLists[index], 
          ...data,
          updatedDate: new Date().toISOString()
        };
        return mockPriceLists[index];
      }
      throw new Error('Price list not found');
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting price list', id);
      const index = mockPriceLists.findIndex(pl => pl.id === id);
      if (index !== -1) {
        mockPriceLists.splice(index, 1);
      }
    },

    async addProduct(priceListId: number, product: any) {
      await delay(300);
      console.log('Admin Mock API: Adding product to price list', priceListId, product);
      const priceList = mockPriceLists.find(pl => pl.id === priceListId);
      if (!priceList) throw new Error('Price list not found');
      
      const newProduct = {
        id: Math.max(...priceList.products.map(p => p.id), 0) + 1,
        priceListId,
        name: product.name || '',
        description: product.description || '',
        isDigital: product.isDigital ?? false,
        sizes: product.sizes || [],
      };
      priceList.products.push(newProduct);
      return newProduct;
    },

    async updateProduct(priceListId: number, productId: number, data: any) {
      await delay(300);
      console.log('Admin Mock API: Updating product in price list', priceListId, productId, data);
      const priceList = mockPriceLists.find(pl => pl.id === priceListId);
      if (!priceList) throw new Error('Price list not found');
      
      const product = priceList.products.find(p => p.id === productId);
      if (!product) throw new Error('Product not found in price list');
      
      Object.assign(product, data);
      return product;
    },

    async removeProduct(priceListId: number, productId: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Removing product from price list', priceListId, productId);
      const priceList = mockPriceLists.find(pl => pl.id === priceListId);
      if (!priceList) throw new Error('Price list not found');
      
      const index = priceList.products.findIndex(p => p.id === productId);
      if (index !== -1) {
        priceList.products.splice(index, 1);
      }
    },

    async addSize(priceListId: number, productId: number, size: any) {
      await delay(300);
      console.log('Admin Mock API: Adding size to product', priceListId, productId, size);
      const priceList = mockPriceLists.find(pl => pl.id === priceListId);
      if (!priceList) throw new Error('Price list not found');
      
      const product = priceList.products.find(p => p.id === productId);
      if (!product) throw new Error('Product not found');
      
      const newSize = {
        id: Math.max(...product.sizes.map(s => s.id), 0) + 1,
        productId,
        name: size.name || '',
        width: size.width ?? 0,
        height: size.height ?? 0,
        price: size.price || 0,
        cost: size.cost ?? 0,
      };
      product.sizes.push(newSize);
      return newSize;
    },

    async updateSize(priceListId: number, productId: number, sizeId: number, data: any) {
      await delay(300);
      console.log('Admin Mock API: Updating size', priceListId, productId, sizeId, data);
      const priceList = mockPriceLists.find(pl => pl.id === priceListId);
      if (!priceList) throw new Error('Price list not found');
      
      const product = priceList.products.find(p => p.id === productId);
      if (!product) throw new Error('Product not found');
      
      const size = product.sizes.find(s => s.id === sizeId);
      if (!size) throw new Error('Size not found');
      
      Object.assign(size, data);
      return size;
    },

    async removeSize(priceListId: number, productId: number, sizeId: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Removing size', priceListId, productId, sizeId);
      const priceList = mockPriceLists.find(pl => pl.id === priceListId);
      if (!priceList) throw new Error('Price list not found');
      
      const product = priceList.products.find(p => p.id === productId);
      if (!product) throw new Error('Product not found');
      
      const index = product.sizes.findIndex(s => s.id === sizeId);
      if (index !== -1) {
        product.sizes.splice(index, 1);
      }
    },
  },
};
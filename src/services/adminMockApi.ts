import { AdminUser, Product, Watermark, Customer, DashboardStats, Album, Photo, Order, ShippingConfig, StripeConfig, UserAccount, Package, DiscountCode } from '../types';

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

// Mock products
let mockProducts: Product[] = [
  {
    id: 1,
    name: 'Standard Print',
    description: 'High quality photo print',
    basePrice: 9.99,
    sizes: [
      { id: 1, name: '4x6', width: 4, height: 6, priceModifier: 0 },
      { id: 2, name: '5x7', width: 5, height: 7, priceModifier: 2 },
      { id: 3, name: '8x10', width: 8, height: 10, priceModifier: 5 },
    ],
    isActive: true,
    popularity: 100,
    isDigital: false,
  },
  {
    id: 2,
    name: 'Canvas Print',
    description: 'Museum quality canvas',
    basePrice: 29.99,
    sizes: [
      { id: 4, name: '12x16', width: 12, height: 16, priceModifier: 0 },
      { id: 5, name: '16x20', width: 16, height: 20, priceModifier: 10 },
      { id: 6, name: '24x36', width: 24, height: 36, priceModifier: 30 },
    ],
    isActive: true,
    popularity: 75,
    isDigital: false,
  },
  {
    id: 3,
    name: 'Digital Download',
    description: 'High-resolution digital file',
    basePrice: 4.99,
    sizes: [
      { id: 7, name: 'Original', width: 0, height: 0, priceModifier: 0 },
      { id: 8, name: '4K', width: 3840, height: 2160, priceModifier: 2 },
      { id: 9, name: '8K', width: 7680, height: 4320, priceModifier: 5 },
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
    imageUrl: 'https://via.placeholder.com/200x80/4169E1/ffffff?text=PhotoLab',
    position: 'bottom-right',
    opacity: 0.5,
    isDefault: true,
    tiled: false,
  },
  {
    id: 2,
    name: 'Copyright',
    imageUrl: 'https://via.placeholder.com/150x50/333333/ffffff?text=©',
    position: 'bottom-left',
    opacity: 0.3,
    isDefault: false,
    tiled: false,
  },
  {
    id: 3,
    name: 'Pattern Watermark',
    imageUrl: 'https://via.placeholder.com/100x100/888888/ffffff?text=©PHOTO',
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
      return {
        id: Math.floor(Math.random() * 1000),
        name: data.name || '',
        description: data.description || '',
        coverImageUrl: data.coverImageUrl || '',
        photoCount: 0,
        createdDate: new Date().toISOString(),
      };
    },

    async update(id: number, data: Partial<Album>): Promise<Album> {
      await delay(400);
      console.log('Admin Mock API: Updating album', id, data);
      return {
        id,
        name: data.name || '',
        description: data.description || '',
        coverImageUrl: data.coverImageUrl || '',
        photoCount: data.photoCount || 0,
        createdDate: new Date().toISOString(),
      };
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting album', id);
    },
  },

  photos: {
    async upload(albumId: number, files: File[]): Promise<Photo[]> {
      await delay(1000);
      console.log('Admin Mock API: Uploading', files.length, 'photos to album', albumId);
      return files.map((file) => ({
        id: Math.floor(Math.random() * 10000),
        albumId,
        fileName: file.name,
        thumbnailUrl: URL.createObjectURL(file),
        fullImageUrl: URL.createObjectURL(file),
        price: 9.99,
        description: '',
      }));
    },

    async update(id: number, data: Partial<Photo>): Promise<Photo> {
      await delay(400);
      console.log('Admin Mock API: Updating photo', id, data);
      return {
        id,
        albumId: data.albumId || 1,
        fileName: data.fileName || '',
        thumbnailUrl: data.thumbnailUrl || '',
        fullImageUrl: data.fullImageUrl || '',
        price: data.price || 9.99,
        description: data.description,
      };
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting photo', id);
    },
  },

  products: {
    async getAll(): Promise<Product[]> {
      await delay(300);
      console.log('Admin Mock API: Fetching products');
      return mockProducts;
    },

    async create(data: Partial<Product>): Promise<Product> {
      await delay(400);
      console.log('Admin Mock API: Creating product', data);
      const product: Product = {
        id: mockProducts.length + 1,
        name: data.name || '',
        description: data.description || '',
        basePrice: data.basePrice || 0,
        sizes: data.sizes || [],
        isActive: data.isActive ?? true,
        popularity: 0,
        isDigital: data.isDigital ?? false,
      };
      mockProducts.push(product);
      return product;
    },

    async update(id: number, data: Partial<Product>): Promise<Product> {
      await delay(400);
      console.log('Admin Mock API: Updating product', id, data);
      const index = mockProducts.findIndex(p => p.id === id);
      if (index !== -1) {
        mockProducts[index] = { ...mockProducts[index], ...data };
        return mockProducts[index];
      }
      throw new Error('Product not found');
    },

    async delete(id: number): Promise<void> {
      await delay(300);
      console.log('Admin Mock API: Deleting product', id);
      mockProducts = mockProducts.filter(p => p.id !== id);
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
        items: pkg.items.map(item => {
          const product = mockProducts.find(p => p.id === item.productId);
          const productSize = product?.sizes.find(s => s.id === item.productSizeId);
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
        items: pkg.items.map(item => {
          const product = mockProducts.find(p => p.id === item.productId);
          const productSize = product?.sizes.find(s => s.id === item.productSizeId);
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
  },};
// Type definitions for the application

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin' | 'super_admin' | 'studio_admin';
  isActive: boolean;
  studioId?: number;
  token?: string;
}

export interface Album {
  id: number;
  name: string;
  description: string;
  coverImageUrl?: string;
  coverPhotoId?: number;
  photoCount: number;
  createdDate: string;
  category?: string;
  priceListId?: number;
  isPasswordProtected?: boolean;
  password?: string;
  passwordHint?: string;
}

export interface Photo {
  id: number;
  albumId: number;
  fileName: string;
  thumbnailUrl: string;
  fullImageUrl: string;
  description?: string;
  metadata?: PhotoMetadata;
  playerNames?: string;
  width?: number;
  height?: number;
}

export interface PhotoMetadata {
  cameraMake?: string;
  cameraModel?: string;
  dateTaken?: string;
  iso?: string;
  aperture?: string;
  shutterSpeed?: string;
  focalLength?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export interface CartItem {
  photoId: number; // primary photo id (for legacy compatibility)
  photo: Photo; // primary photo object
  photoIds?: number[]; // all photos included in the product (multi-photo products)
  photos?: Array<{ photo: Photo; cropData: CropData; position: number }>; // full photo objects with crop data for multi-photo products
  quantity: number;
  price: number;
  cropData?: CropData;
  productId?: number;
  productSizeId?: number;
}

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
}

export interface Order {
  id: number;
  userId: number;
  orderDate: string;
  totalAmount: number;
  status: string;
  shippingOption: 'batch' | 'direct' | 'none';
  shippingCost: number;
  items: OrderItem[];
  downloadUrls?: DownloadUrl[];
  shippingAddress: ShippingAddress;
  isBatch?: boolean; // True if order is for batch shipping
  batchShippingAddress?: ShippingAddress; // Batch address set by admin
  labSubmitted?: boolean; // True if batch order has been submitted to lab
  labSubmittedAt?: string; // Timestamp when submitted to lab
  taxAmount?: number; // Tax calculated based on shipping address
  taxRate?: number; // Tax rate percentage applied
  subtotal?: number; // Total before tax and shipping
}

export interface ShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  email: string;
  phone?: string;
}

export interface DownloadUrl {
  photoId: number;
  productId: number;
  url: string;
  expiresAt: string;
  downloads: number;
  maxDownloads: number;
}

export interface OrderItem {
  id: number;
  photoId: number;
  photo: Photo;
  photoIds?: number[];
  photos?: Photo[];
  quantity: number;
  price: number;
  cost?: number;
  cropData?: CropData;
  productId?: number;
  productSizeId?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

// Admin types
export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'superadmin';
  token?: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  sizes: ProductSize[];
  isActive: boolean;
  popularity: number;
  isDigital: boolean;
  minPhotos?: number; // Minimum photos required for multi-photo products
  maxPhotos?: number; // Maximum photos allowed for multi-photo products
}

export interface ProductSize {
  id: number;
  name: string;
  width: number;
  height: number;
  price: number;
}

export interface Watermark {
  id: number;
  name: string;
  imageUrl: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  isDefault: boolean;
  tiled: boolean;
}

export interface Customer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  registeredDate: string;
  totalOrders: number;
  totalSpent: number;
  isActive: boolean;
}

export interface UserAccount {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin';
  registeredDate: string;
  totalOrders: number;
  totalSpent: number;
  isActive: boolean;
  lastLoginDate?: string;
}

export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  pendingOrders: number;
  recentOrders: Order[];
  topAlbums: { album: Album; orderCount: number }[];
}

export interface ShippingConfig {
  id: number;
  batchDeadline: string;
  directShippingCharge: number;
  isActive: boolean;
}

export interface StripeConfig {
  id: number;
  publishableKey: string;
  secretKey: string;
  isLiveMode: boolean;
  isActive: boolean;
  webhookSecret?: string;
}

export interface ProfileConfig {
  id: number;
  ownerName: string;
  businessName: string;
  email: string;
  receiveOrderNotifications: boolean;
  logoUrl?: string;
}

export interface AnalyticsData {
  totalVisitors: number;
  totalPageViews: number;
  albumViews: AlbumViewStats[];
  photoViews: PhotoViewStats[];
  recentActivity: ActivityLog[];
}

export interface AlbumViewStats {
  albumId: number;
  albumName: string;
  views: number;
  lastViewed: string;
}

export interface PhotoViewStats {
  photoId: number;
  photoFileName: string;
  albumId: number;
  albumName: string;
  views: number;
  lastViewed: string;
}

export interface ActivityLog {
  id: number;
  type: 'visit' | 'album_view' | 'photo_view';
  timestamp: string;
  albumId?: number;
  albumName?: string;
  photoId?: number;
  photoFileName?: string;
  userAgent?: string;
}

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: string;
}
export interface Package {
  id: number;
  priceListId: number;
  name: string;
  description: string;
  packagePrice: number;
  items: PackageItem[];
  isActive: boolean;
  createdDate: string;
}

export interface PackageItem {
  productId: number;
  productSizeId: number;
  quantity: number;
  product?: PriceListProduct;
  productSize?: PriceListProductSize;
}

export interface DiscountCode {
  id: number;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  applicationType: 'entire-order' | 'specific-products';
  applicableProductIds: number[];
  expirationDate: string;
  isOneTimeUse: boolean;
  usageCount: number;
  maxUsages?: number;
  isActive: boolean;
  createdDate: string;
}

export interface DiscountCodeUsage {
  id: number;
  discountCodeId: number;
  userId: number;
  orderId: number;
  usedDate: string;
}

export interface PriceList {
  id: number;
  name: string;
  description?: string;
  products: PriceListProduct[];
  isActive: boolean;
  createdDate: string;
  isDefault?: boolean;
  updatedDate?: string;
}

export interface PriceListProduct {
  id: number;
  priceListId: number;
  name: string;
  description?: string;
  isDigital: boolean;
  sizes: PriceListProductSize[];
}

export interface PriceListProductSize {
  id: number;
  productId: number;
  name: string;
  width: number;
  height: number;
  price: number;
  cost: number;
}

export interface PriceListItem {
  id: number;
  priceListId: number;
  productId: number;
  productSizeId: number;
  price: number;
  product?: PriceListProduct;
  productSize?: PriceListProductSize;
}

export interface ImportedPriceData {
  productName: string;
  sizeName: string;
  width?: number;
  height?: number;
  price: number;
  cost?: number;
  description?: string;
}

export interface PriceGroupMapping {
  productName: string;
  productId: number;
  items: {
    sizeName: string;
    width?: number;
    height?: number;
    price: number;
  }[];
}
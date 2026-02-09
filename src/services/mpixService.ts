/**
 * Mpix API Integration Service
 * https://devapi.mpix.com/
 *
 * Mpix is a professional photo printing service that provides an API for
 * submitting print orders. This service handles authentication, order submission,
 * and product catalog retrieval.
 */

import api from './api';
import { siteConfigService } from './siteConfigService';

interface MpixConfig {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
  shipFromName?: string;
  shipFromPhone?: string;
  shipFromEmail?: string;
}

class MpixService {
  /**
   * Get Mpix configuration from localStorage
   */
  getConfig(): MpixConfig {
    if (typeof window === 'undefined') {
      return {
        enabled: false,
        apiKey: '',
        apiSecret: '',
        environment: 'sandbox',
      };
    }

    try {
      const stored = localStorage.getItem('mpixConfig');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load Mpix config:', error);
    }

    return {
      enabled: false,
      apiKey: '',
      apiSecret: '',
      environment: 'sandbox',
    };
  }

  /**
   * Save Mpix configuration to localStorage
   */
  saveConfig(config: MpixConfig): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem('mpixConfig', JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save Mpix config:', error);
    }
  }

  /**
   * Check if Mpix is enabled
   */
  isEnabled(): boolean {
    return siteConfigService.isSiteEnabled('mpix');
  }

  /**
   * Get the appropriate API base URL based on environment
   */
  private getApiUrl(): string {
    const config = this.getConfig();
    if (config.environment === 'production') {
      return 'https://api.mpix.com';
    }
    return 'https://devapi.mpix.com';
  }

  /**
   * Test connection to Mpix API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const config = this.getConfig();
      if (!config.apiKey || !config.apiSecret) {
        return {
          success: false,
          message: 'API Key and Secret are required',
        };
      }

      // Basic auth header (typical for Mpix API)
      const auth = btoa(`${config.apiKey}:${config.apiSecret}`);

      const response = await api.get(`${this.getApiUrl()}/Account`, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 200) {
        return {
          success: true,
          message: 'Successfully connected to Mpix API',
        };
      }

      return {
        success: false,
        message: `Unexpected response status: ${response.status}`,
      };
    } catch (error) {
      console.error('Mpix connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Convert cart items to Mpix order format
   */
  convertCartToMpixOrder(cartItems: any[], shippingAddress: any = {}): any {
    const config = this.getConfig();

    const orderLineItems = cartItems.map((item) => ({
      ProductId: item.productId || 1, // Mpix product ID
      Sku: item.sku || `${item.width}x${item.height}`,
      Quantity: item.quantity || 1,
      UnitPrice: item.price,
      ImageFilename: item.fileName || item.imageUrl,
      ImageUrl: item.imageUrl,
    }));

    return {
      Order: {
        OrderLineItems: orderLineItems,
        ShipTo: {
          FullName: shippingAddress.fullName || config.shipFromName || 'Customer',
          Address1: shippingAddress.address1 || '',
          Address2: shippingAddress.address2 || '',
          City: shippingAddress.city || '',
          StateProvinceCode: shippingAddress.state || '',
          PostalCode: shippingAddress.zipCode || '',
          CountryCode: shippingAddress.country || 'US',
          Phone: shippingAddress.phone || config.shipFromPhone || '',
          Email: shippingAddress.email || config.shipFromEmail || '',
        },
        Currency: 'USD',
        Promo: shippingAddress.promoCode || '',
      },
    };
  }

  /**
   * Submit order to Mpix
   */
  async submitOrder(orderData: any): Promise<{ success: boolean; orderId?: string; message: string }> {
    try {
      const config = this.getConfig();
      if (!config.apiKey || !config.apiSecret) {
        return {
          success: false,
          message: 'Mpix API credentials not configured',
        };
      }

      if (!config.enabled) {
        return {
          success: false,
          message: 'Mpix is not enabled',
        };
      }

      const auth = btoa(`${config.apiKey}:${config.apiSecret}`);

      const response = await api.post(`${this.getApiUrl()}/Order`, orderData, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data && response.data.OrderId) {
        this.logEvent('order_submitted', {
          orderId: response.data.OrderId,
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          orderId: response.data.OrderId,
          message: `Order submitted successfully. Order ID: ${response.data.OrderId}`,
        };
      }

      return {
        success: false,
        message: 'Order submitted but no Order ID returned',
      };
    } catch (error) {
      console.error('Mpix order submission failed:', error);
      return {
        success: false,
        message: `Order submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Submit a complete order workflow
   */
  async submitCompleteOrder(cartItems: any[], shippingAddress: any = {}): Promise<any> {
    try {
      const orderData = this.convertCartToMpixOrder(cartItems, shippingAddress);
      const result = await this.submitOrder(orderData);

      return {
        success: result.success,
        provider: 'mpix',
        orderId: result.orderId,
        message: result.message,
      };
    } catch (error) {
      console.error('Mpix order workflow failed:', error);
      return {
        success: false,
        provider: 'mpix',
        message: `Order failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get Mpix Product Catalog
   * Retrieves list of products available from Mpix
   */
  async getProductCatalog(): Promise<any> {
    try {
      // Fetch from backend proxy to avoid CORS
      const response = await api.get('/mpix/products');
      if (response.data && response.data.Products) {
        return {
          products: response.data.Products,
        };
      }
      return this.getDefaultProductCatalog();
    } catch (error) {
      console.error('Failed to fetch Mpix product catalog:', error);
      return this.getDefaultProductCatalog();
    }
  }

  /**
   * Default Mpix product catalog
   * Based on Mpix's common products and services
   */
  private getDefaultProductCatalog(): any {
    return {
      products: [
        // Photographic Prints - Standard
        {
          productUID: 1,
          productId: 1,
          name: '4x6 Print',
          description: 'Professional 4x6 photographic print',
          width: 4,
          height: 6,
          basePrice: 0.59,
          category: 'prints',
        },
        {
          productUID: 2,
          productId: 2,
          name: '5x7 Print',
          description: 'Professional 5x7 photographic print',
          width: 5,
          height: 7,
          basePrice: 0.85,
          category: 'prints',
        },
        {
          productUID: 3,
          productId: 3,
          name: '8x10 Print',
          description: 'Professional 8x10 photographic print',
          width: 8,
          height: 10,
          basePrice: 1.65,
          category: 'prints',
        },
        {
          productUID: 4,
          productId: 4,
          name: '11x14 Print',
          description: 'Professional 11x14 photographic print',
          width: 11,
          height: 14,
          basePrice: 3.25,
          category: 'prints',
        },
        {
          productUID: 5,
          productId: 5,
          name: '16x20 Print',
          description: 'Professional 16x20 photographic print',
          width: 16,
          height: 20,
          basePrice: 6.50,
          category: 'prints',
        },
        // Fine Art Prints
        {
          productUID: 20,
          productId: 20,
          name: '8x10 Fine Art Print',
          description: 'Archival fine art print 8x10',
          width: 8,
          height: 10,
          basePrice: 3.99,
          category: 'fine-art',
        },
        {
          productUID: 21,
          productId: 21,
          name: '11x14 Fine Art Print',
          description: 'Archival fine art print 11x14',
          width: 11,
          height: 14,
          basePrice: 6.99,
          category: 'fine-art',
        },
        {
          productUID: 22,
          productId: 22,
          name: '16x20 Fine Art Print',
          description: 'Archival fine art print 16x20',
          width: 16,
          height: 20,
          basePrice: 12.99,
          category: 'fine-art',
        },
        // Metal Prints
        {
          productUID: 30,
          productId: 30,
          name: '8x10 Metal Print',
          description: 'Modern metal print 8x10',
          width: 8,
          height: 10,
          basePrice: 19.99,
          category: 'metal',
        },
        {
          productUID: 31,
          productId: 31,
          name: '11x14 Metal Print',
          description: 'Modern metal print 11x14',
          width: 11,
          height: 14,
          basePrice: 29.99,
          category: 'metal',
        },
        {
          productUID: 32,
          productId: 32,
          name: '16x20 Metal Print',
          description: 'Modern metal print 16x20',
          width: 16,
          height: 20,
          basePrice: 49.99,
          category: 'metal',
        },
        // Canvas Prints
        {
          productUID: 40,
          productId: 40,
          name: '8x10 Canvas',
          description: 'Gallery wrapped canvas 8x10',
          width: 8,
          height: 10,
          basePrice: 14.99,
          category: 'canvas',
        },
        {
          productUID: 41,
          productId: 41,
          name: '11x14 Canvas',
          description: 'Gallery wrapped canvas 11x14',
          width: 11,
          height: 14,
          basePrice: 24.99,
          category: 'canvas',
        },
        {
          productUID: 42,
          productId: 42,
          name: '16x20 Canvas',
          description: 'Gallery wrapped canvas 16x20',
          width: 16,
          height: 20,
          basePrice: 39.99,
          category: 'canvas',
        },
        // Acrylic Prints
        {
          productUID: 50,
          productId: 50,
          name: '8x10 Acrylic',
          description: 'Acrylic face mount print 8x10',
          width: 8,
          height: 10,
          basePrice: 24.99,
          category: 'acrylic',
        },
        {
          productUID: 51,
          productId: 51,
          name: '11x14 Acrylic',
          description: 'Acrylic face mount print 11x14',
          width: 11,
          height: 14,
          basePrice: 39.99,
          category: 'acrylic',
        },
        {
          productUID: 52,
          productId: 52,
          name: '16x20 Acrylic',
          description: 'Acrylic face mount print 16x20',
          width: 16,
          height: 20,
          basePrice: 59.99,
          category: 'acrylic',
        },
        // Wood Prints
        {
          productUID: 60,
          productId: 60,
          name: '8x10 Wood Print',
          description: 'Premium wood mounted print 8x10',
          width: 8,
          height: 10,
          basePrice: 12.99,
          category: 'wood',
        },
        {
          productUID: 61,
          productId: 61,
          name: '11x14 Wood Print',
          description: 'Premium wood mounted print 11x14',
          width: 11,
          height: 14,
          basePrice: 19.99,
          category: 'wood',
        },
        // Photo Books
        {
          productUID: 70,
          productId: 70,
          name: 'Softcover Photo Book 8x8',
          description: '8x8 softcover photo book',
          width: 8,
          height: 8,
          basePrice: 4.99,
          category: 'books',
        },
        {
          productUID: 71,
          productId: 71,
          name: 'Hardcover Photo Book 8x8',
          description: '8x8 hardcover photo book',
          width: 8,
          height: 8,
          basePrice: 9.99,
          category: 'books',
        },
        {
          productUID: 72,
          productId: 72,
          name: 'Hardcover Photo Book 11x14',
          description: '11x14 hardcover photo book',
          width: 11,
          height: 14,
          basePrice: 24.99,
          category: 'books',
        },
        // Cards
        {
          productUID: 80,
          productId: 80,
          name: 'Greeting Cards 5x7',
          description: 'Custom greeting cards (set of 50)',
          width: 5,
          height: 7,
          basePrice: 49.99,
          category: 'stationery',
        },
        {
          productUID: 81,
          productId: 81,
          name: 'Holiday Cards 5x7',
          description: 'Custom holiday cards (set of 50)',
          width: 5,
          height: 7,
          basePrice: 59.99,
          category: 'stationery',
        },
        // Calendars
        {
          productUID: 90,
          productId: 90,
          name: 'Wall Calendar 11x14',
          description: '12-month wall calendar',
          width: 11,
          height: 14,
          basePrice: 6.99,
          category: 'stationery',
        },
        // Posters
        {
          productUID: 100,
          productId: 100,
          name: 'Poster 18x24',
          description: 'Matte finish poster 18x24',
          width: 18,
          height: 24,
          basePrice: 2.99,
          category: 'poster',
        },
        {
          productUID: 101,
          productId: 101,
          name: 'Poster 24x36',
          description: 'Matte finish poster 24x36',
          width: 24,
          height: 36,
          basePrice: 4.99,
          category: 'poster',
        },
        // Additional Photo Print Sizes
        {
          productUID: 2,
          productId: 2,
          name: '3x5 Print',
          description: 'Premium photo print 3x5',
          width: 3,
          height: 5,
          basePrice: 0.29,
          category: 'prints',
        },
        {
          productUID: 3,
          productId: 3,
          name: '4x6 Print',
          description: 'Premium photo print 4x6',
          width: 4,
          height: 6,
          basePrice: 0.39,
          category: 'prints',
        },
        {
          productUID: 4,
          productId: 4,
          name: '5x7 Print',
          description: 'Premium photo print 5x7',
          width: 5,
          height: 7,
          basePrice: 0.99,
          category: 'prints',
        },
        {
          productUID: 5,
          productId: 5,
          name: '6x8 Print',
          description: 'Premium photo print 6x8',
          width: 6,
          height: 8,
          basePrice: 1.19,
          category: 'prints',
        },
        {
          productUID: 6,
          productId: 6,
          name: '8x10 Print',
          description: 'Premium photo print 8x10',
          width: 8,
          height: 10,
          basePrice: 1.99,
          category: 'prints',
        },
        {
          productUID: 7,
          productId: 7,
          name: '11x14 Print',
          description: 'Premium photo print 11x14',
          width: 11,
          height: 14,
          basePrice: 3.99,
          category: 'prints',
        },
        {
          productUID: 8,
          productId: 8,
          name: '12x18 Print',
          description: 'Premium photo print 12x18',
          width: 12,
          height: 18,
          basePrice: 4.99,
          category: 'prints',
        },
        {
          productUID: 9,
          productId: 9,
          name: '16x20 Print',
          description: 'Premium photo print 16x20',
          width: 16,
          height: 20,
          basePrice: 7.99,
          category: 'prints',
        },
        {
          productUID: 10,
          productId: 10,
          name: '20x24 Print',
          description: 'Premium photo print 20x24',
          width: 20,
          height: 24,
          basePrice: 12.99,
          category: 'prints',
        },
        // Panoramic Prints
        {
          productUID: 110,
          productId: 110,
          name: '4x12 Panoramic Print',
          description: 'Panoramic photo print 4x12',
          width: 4,
          height: 12,
          basePrice: 1.99,
          category: 'prints',
        },
        {
          productUID: 111,
          productId: 111,
          name: '8x24 Panoramic Print',
          description: 'Panoramic photo print 8x24',
          width: 8,
          height: 24,
          basePrice: 4.99,
          category: 'prints',
        },
        // Giclee Prints
        {
          productUID: 120,
          productId: 120,
          name: '11x14 Giclee Print',
          description: 'Fine art giclee print 11x14',
          width: 11,
          height: 14,
          basePrice: 14.99,
          category: 'prints',
        },
        {
          productUID: 121,
          productId: 121,
          name: '16x20 Giclee Print',
          description: 'Fine art giclee print 16x20',
          width: 16,
          height: 20,
          basePrice: 24.99,
          category: 'prints',
        },
        // Wallet Prints
        {
          productUID: 130,
          productId: 130,
          name: 'Wallet Prints (100)',
          description: 'Wallet size prints (set of 100)',
          width: 2,
          height: 3,
          basePrice: 2.99,
          category: 'prints',
        },
        // Metal Prints - Additional sizes
        {
          productUID: 201,
          productId: 201,
          name: '8x10 Metal Print',
          description: 'Premium metal photo print 8x10',
          width: 8,
          height: 10,
          basePrice: 16.99,
          category: 'metal',
        },
        {
          productUID: 202,
          productId: 202,
          name: '11x14 Metal Print',
          description: 'Premium metal photo print 11x14',
          width: 11,
          height: 14,
          basePrice: 27.99,
          category: 'metal',
        },
        {
          productUID: 203,
          productId: 203,
          name: '16x20 Metal Print',
          description: 'Premium metal photo print 16x20',
          width: 16,
          height: 20,
          basePrice: 44.99,
          category: 'metal',
        },
        // Framed Prints
        {
          productUID: 210,
          productId: 210,
          name: '8x10 Framed Print',
          description: 'Framed photo print 8x10',
          width: 8,
          height: 10,
          basePrice: 14.99,
          category: 'framed',
        },
        {
          productUID: 211,
          productId: 211,
          name: '11x14 Framed Print',
          description: 'Framed photo print 11x14',
          width: 11,
          height: 14,
          basePrice: 24.99,
          category: 'framed',
        },
        // Glass Prints
        {
          productUID: 220,
          productId: 220,
          name: '8x10 Glass Print',
          description: 'Premium glass mounted print 8x10',
          width: 8,
          height: 10,
          basePrice: 19.99,
          category: 'glass',
        },
        {
          productUID: 221,
          productId: 221,
          name: '11x14 Glass Print',
          description: 'Premium glass mounted print 11x14',
          width: 11,
          height: 14,
          basePrice: 34.99,
          category: 'glass',
        },
        // Canvas - Additional sizes
        {
          productUID: 43,
          productId: 43,
          name: '8x8 Canvas',
          description: 'Gallery wrapped canvas 8x8',
          width: 8,
          height: 8,
          basePrice: 9.99,
          category: 'canvas',
        },
        // Panoramic Canvas
        {
          productUID: 230,
          productId: 230,
          name: '12x36 Canvas',
          description: 'Gallery wrapped panoramic canvas 12x36',
          width: 12,
          height: 36,
          basePrice: 34.99,
          category: 'canvas',
        },
        // Acrylic - Additional sizes
        {
          productUID: 53,
          productId: 53,
          name: '5x7 Acrylic',
          description: 'Acrylic face mount print 5x7',
          width: 5,
          height: 7,
          basePrice: 11.99,
          category: 'acrylic',
        },
        // Wood Prints - Additional sizes
        {
          productUID: 62,
          productId: 62,
          name: '16x20 Wood Print',
          description: 'Premium wood mounted print 16x20',
          width: 16,
          height: 20,
          basePrice: 34.99,
          category: 'wood',
        },
        {
          productUID: 63,
          productId: 63,
          name: '4x6 Wood Print',
          description: 'Premium wood mounted print 4x6',
          width: 4,
          height: 6,
          basePrice: 5.99,
          category: 'wood',
        },
        // Photo Books - Additional sizes
        {
          productUID: 73,
          productId: 73,
          name: 'Softcover Photo Book 11x14',
          description: '11x14 softcover photo book',
          width: 11,
          height: 14,
          basePrice: 12.99,
          category: 'books',
        },
        {
          productUID: 74,
          productId: 74,
          name: 'Signature Leather Album',
          description: 'Handcrafted leather bound album',
          width: 8,
          height: 10,
          basePrice: 49.99,
          category: 'books',
        },
        // Photo Gifts
        {
          productUID: 140,
          productId: 140,
          name: 'Photo Mug',
          description: 'Ceramic photo mug with custom image',
          width: 3,
          height: 4,
          basePrice: 7.99,
          category: 'gifts',
        },
        {
          productUID: 141,
          productId: 141,
          name: 'Photo Blanket',
          description: 'Fleece photo blanket 50x60',
          width: 50,
          height: 60,
          basePrice: 39.99,
          category: 'gifts',
        },
        {
          productUID: 142,
          productId: 142,
          name: 'Photo Puzzle',
          description: 'Custom 500-piece photo puzzle',
          width: 18,
          height: 24,
          basePrice: 14.99,
          category: 'gifts',
        },
        {
          productUID: 143,
          productId: 143,
          name: 'Acrylic Block',
          description: 'Acrylic photo block display',
          width: 4,
          height: 6,
          basePrice: 8.99,
          category: 'gifts',
        },
        {
          productUID: 144,
          productId: 144,
          name: 'Birch Photo Block',
          description: 'Wood block photo display',
          width: 5,
          height: 7,
          basePrice: 6.99,
          category: 'gifts',
        },
        {
          productUID: 145,
          productId: 145,
          name: 'Photo Ornament',
          description: 'Custom holiday photo ornament',
          width: 3,
          height: 3,
          basePrice: 9.99,
          category: 'gifts',
        },
        {
          productUID: 146,
          productId: 146,
          name: 'Photo Statuette',
          description: 'Custom traced statuette',
          width: 4,
          height: 6,
          basePrice: 34.99,
          category: 'gifts',
        },
        // Stationery - Additional products
        {
          productUID: 82,
          productId: 82,
          name: 'Wedding Cards 5x7',
          description: 'Wedding announcement cards (set of 50)',
          width: 5,
          height: 7,
          basePrice: 69.99,
          category: 'stationery',
        },
        {
          productUID: 83,
          productId: 83,
          name: 'Graduation Cards 5x7',
          description: 'Graduation announcement cards (set of 50)',
          width: 5,
          height: 7,
          basePrice: 59.99,
          category: 'stationery',
        },
        {
          productUID: 84,
          productId: 84,
          name: 'Birth Announcement Cards',
          description: 'Birth announcement cards (set of 50)',
          width: 5,
          height: 7,
          basePrice: 49.99,
          category: 'stationery',
        },
        {
          productUID: 91,
          productId: 91,
          name: 'Desk Calendar',
          description: '12-month desk calendar',
          width: 5,
          height: 7,
          basePrice: 9.99,
          category: 'stationery',
        },
        // Additional Posters
        {
          productUID: 102,
          productId: 102,
          name: 'Poster 12x18',
          description: 'Matte finish poster 12x18',
          width: 12,
          height: 18,
          basePrice: 1.99,
          category: 'poster',
        },
        {
          productUID: 103,
          productId: 103,
          name: 'Poster 16x20',
          description: 'Matte finish poster 16x20',
          width: 16,
          height: 20,
          basePrice: 3.99,
          category: 'poster',
        },
      ],
    };
  }

  /**
   * Log Mpix integration event for debugging
   */
  logEvent(eventName: string, data: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[Mpix ${timestamp}] ${eventName}:`, data);
  }
}

export const mpixService = new MpixService();

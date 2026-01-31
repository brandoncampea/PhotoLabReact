import api from './api';
import { siteConfigService } from './siteConfigService';

export interface WhccConfig {
  consumerKey: string;
  consumerSecret: string;
  isSandbox: boolean;
  enabled: boolean;
  shipFromAddress?: {
    name: string;
    addr1: string;
    addr2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
  };
}

export interface WhccAccessToken {
  ClientId: string;
  ConsumerKey: string;
  EffectiveDate: string;
  ExpirationDate: string;
  Token: string;
}

export interface WhccOrderItem {
  ProductUID: number;
  Quantity: number;
  LineItemID?: string;
  ItemAssets: Array<{
    ProductNodeID: number;
    AssetPath: string;
    ImageHash: string;
    PrintedFileName: string;
    AutoRotate: boolean;
    AssetEnhancement?: string;
    X?: number;
    Y?: number;
    ZoomX?: number;
    ZoomY?: number;
  }>;
  ItemAttributes: Array<{
    AttributeUID: number;
  }>;
}

export interface WhccOrderRequest {
  EntryId: string;
  Orders: Array<{
    SequenceNumber: number;
    Reference?: string;
    Instructions?: string;
    SendNotificationEmailAddress?: string;
    SendNotificationEmailToAccount: boolean;
    ShipToAddress: {
      Name: string;
      Attn?: string;
      Addr1: string;
      Addr2?: string;
      City: string;
      State: string;
      Zip: string;
      Country: string;
      Phone?: string;
    };
    ShipFromAddress: {
      Name: string;
      Addr1: string;
      Addr2?: string;
      City: string;
      State: string;
      Zip: string;
      Country: string;
      Phone?: string;
    };
    OrderAttributes: Array<{
      AttributeUID: number;
    }>;
    OrderItems: WhccOrderItem[];
  }>;
}

export interface WhccOrderResponse {
  Account: string;
  ConfirmationID: string;
  EntryID: string;
  Key: string;
  NumberOfOrders: number;
  Orders: Array<{
    LineItems: any[];
    Note: string;
    Products: Array<{
      Price: string;
      ProductDescription: string;
      Quantity: number;
    }>;
    SequenceNumber: string;
    SubTotal: string;
    Tax: string;
    Total: string;
  }>;
  Received: string;
}

class WhccService {
  private baseUrl = 'https://apps.whcc.com';
  private sandboxUrl = 'https://sandbox.apps.whcc.com';
  private tokenCache: Map<string, WhccAccessToken & { expiresAt: number }> = new Map();

  /**
   * Get WHCC configuration from localStorage
   */
  getConfig(): WhccConfig | null {
    try {
      const stored = localStorage.getItem('whccConfig');
      if (stored) {
        const config = JSON.parse(stored);
        return config;
      }
      return null;
    } catch (error) {
      console.error('Failed to parse WHCC config:', error);
      return null;
    }
  }

  /**
   * Check if WHCC is enabled
   */
  isEnabled(): boolean {
    return siteConfigService.isSiteEnabled('whcc');
  }

  /**
   * Get API base URL based on environment
   */
  getApiUrl(): string {
    const config = this.getConfig();
    return config?.isSandbox ? this.sandboxUrl : this.baseUrl;
  }

  /**
   * Request access token from WHCC
   */
  async getAccessToken(): Promise<string> {
    const config = this.getConfig();
    if (!config?.consumerKey || !config?.consumerSecret) {
      throw new Error('WHCC credentials not configured');
    }

    const cacheKey = `${config.consumerKey}:${config.isSandbox ? 'sandbox' : 'prod'}`;
    const cached = this.tokenCache.get(cacheKey);

    // Return cached token if still valid (with 5 min buffer)
    if (cached && cached.expiresAt > Date.now() + 300000) {
      return cached.Token;
    }

    try {
      const response = await api.get(
        `${this.getApiUrl()}/api/AccessToken`,
        {
          params: {
            grant_type: 'consumer_credentials',
            consumer_key: config.consumerKey,
            consumer_secret: config.consumerSecret,
          },
        }
      );

      const token = response.data as WhccAccessToken;

      // Parse expiration date and cache
      const expiresAt = new Date(token.ExpirationDate).getTime();
      this.tokenCache.set(cacheKey, {
        ...token,
        expiresAt,
      });

      return token.Token;
    } catch (error) {
      console.error('Failed to get WHCC access token:', error);
      throw new Error('WHCC authentication failed. Check credentials.');
    }
  }

  /**
   * Convert app cart items to WHCC order format
   * This is a template - customize based on your product mapping
   */
  convertCartToWhccOrder(
    cartItems: any[],
    customer: any,
    orderId: string
  ): WhccOrderRequest {
    const config = this.getConfig();

    // Default ship from address (customize this)
    const shipFromAddress = config?.shipFromAddress || {
      name: 'Returns Department',
      addr1: '3432 Denmark Ave',
      addr2: 'Suite 390',
      city: 'Eagan',
      state: 'MN',
      zip: '55123',
      country: 'US',
      phone: '8002525234',
    };

    return {
      EntryId: orderId,
      Orders: [
        {
          SequenceNumber: 1,
          Reference: `Order-${orderId}`,
          SendNotificationEmailToAccount: true,
          SendNotificationEmailAddress: customer.email,
          ShipToAddress: {
            Name: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim(),
            Addr1: customer.address?.addr1 || '123 Main St',
            Addr2: customer.address?.addr2,
            City: customer.address?.city || 'Unknown',
            State: customer.address?.state || 'MN',
            Zip: customer.address?.zip || '55401',
            Country: customer.address?.country || 'US',
            Phone: customer.phone?.replace(/[^\d]/g, ''),
          },
          ShipFromAddress: {
            Name: shipFromAddress.name,
            Addr1: shipFromAddress.addr1,
            Addr2: shipFromAddress.addr2,
            City: shipFromAddress.city,
            State: shipFromAddress.state,
            Zip: shipFromAddress.zip,
            Country: shipFromAddress.country,
            Phone: shipFromAddress.phone,
          },
          // Shipping method + packaging (required)
          OrderAttributes: [
            {
              AttributeUID: 96, // Economy Shipping example
            },
            {
              AttributeUID: 545, // Standard Packaging example
            },
          ],
          // Convert cart items
          OrderItems: cartItems.map((item, idx) => ({
            ProductUID: item.whccProductUID || 2, // Default to 5x7 print if not specified
            Quantity: item.quantity || 1,
            LineItemID: item.id || `item-${idx}`,
            ItemAssets: [
              {
                ProductNodeID: 10000, // Default node ID for main image
                AssetPath: item.imageUrl || 'https://placeholder.com/image.jpg',
                ImageHash: item.imageHash || this.generateMd5Hash(item.imageUrl || ''),
                PrintedFileName: item.imageName || 'image.jpg',
                AutoRotate: true,
                X: item.cropX || 0,
                Y: item.cropY || 0,
                ZoomX: item.zoomX || 100,
                ZoomY: item.zoomY || 100,
              },
            ],
            ItemAttributes: [
              {
                AttributeUID: item.whccPaperType || 1, // Photo paper type
              },
              {
                AttributeUID: item.whccFinish || 5, // Glossy finish
              },
            ],
          })),
        },
      ],
    };
  }

  /**
   * Generate MD5 hash for image (simple version - use crypto-js in production)
   * For production, calculate actual MD5 of the image file
   */
  private generateMd5Hash(_input: string): string {
    // This is a placeholder - in production, calculate actual MD5 of the image
    // You can use crypto-js or node-forge for this
    return 'a9825bb0836325e07ccfed16751b1d07'; // Example hash
  }

  /**
   * Import order to WHCC (step 1)
   */
  async importOrder(orderRequest: WhccOrderRequest): Promise<WhccOrderResponse> {
    try {
      const token = await this.getAccessToken();

      const response = await api.post(
        `${this.getApiUrl()}/api/OrderImport`,
        orderRequest,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data as WhccOrderResponse;
    } catch (error) {
      console.error('Failed to import order to WHCC:', error);
      throw error;
    }
  }

  /**
   * Submit order to WHCC (step 2)
   */
  async submitOrder(confirmationId: string): Promise<any> {
    try {
      const token = await this.getAccessToken();

      const response = await api.post(
        `${this.getApiUrl()}/api/OrderImport/Submit/${confirmationId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': '0',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to submit order to WHCC:', error);
      throw error;
    }
  }

  /**
   * Complete WHCC order submission (import + submit)
   */
  async submitCompleteOrder(
    cartItems: any[],
    customer: any,
    orderId: string
  ): Promise<any> {
    // Step 1: Convert to WHCC format
    const orderRequest = this.convertCartToWhccOrder(cartItems, customer, orderId);

    // Step 2: Import order
    const importResponse = await this.importOrder(orderRequest);
    console.log('Order imported:', importResponse);

    // Step 3: Submit order
    const submitResponse = await this.submitOrder(importResponse.ConfirmationID);
    console.log('Order submitted:', submitResponse);

    return {
      confirmationId: importResponse.ConfirmationID,
      account: importResponse.Account,
      total: importResponse.Orders[0]?.Total,
      ...submitResponse,
    };
  }

  /**
   * Test WHCC connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      return !!token;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get WHCC Product Catalog
   * Returns list of products, attributes, and UIDs
   * IMPORTANT: This requires access to WHCC's product catalog API
   * For production, you may need to manually fetch and cache the catalog
   */
  async getProductCatalog(): Promise<any> {
    try {
      const token = await this.getAccessToken();

      // Note: WHCC's product catalog endpoint may vary
      // This endpoint structure is based on their API documentation
      // You may need to adjust based on actual WHCC API response
      const response = await api.get(
        `${this.getApiUrl()}/api/ProductCatalog`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to fetch WHCC product catalog:', error);
      // Fallback to default WHCC product data (can be cached manually)
      return this.getDefaultProductCatalog();
    }
  }

  /**
   * Default/cached WHCC product catalog
   * Based on WHCC's common products
   * Update this with actual product UIDs from your WHCC account
   */
  private getDefaultProductCatalog(): any {
    return {
      products: [
        // Prints - Standard Sizes
        {
          productUID: 1,
          name: '2x3 Print',
          description: 'Standard 2x3 Photograph',
          width: 2,
          height: 3,
          basePrice: 0.29,
          category: 'prints',
        },
        {
          productUID: 2,
          name: '4x6 Print',
          description: 'Glossy 4x6 Photograph',
          width: 4,
          height: 6,
          basePrice: 0.49,
          category: 'prints',
        },
        {
          productUID: 3,
          name: '5x7 Print',
          description: 'Glossy 5x7 Photograph',
          width: 5,
          height: 7,
          basePrice: 0.65,
          category: 'prints',
        },
        {
          productUID: 4,
          name: '8x10 Print',
          description: 'Glossy 8x10 Photograph',
          width: 8,
          height: 10,
          basePrice: 1.45,
          category: 'prints',
        },
        {
          productUID: 5,
          name: '11x14 Print',
          description: 'Glossy 11x14 Photograph',
          width: 11,
          height: 14,
          basePrice: 2.99,
          category: 'prints',
        },
        {
          productUID: 6,
          name: '16x20 Print',
          description: 'Glossy 16x20 Photograph',
          width: 16,
          height: 20,
          basePrice: 5.99,
          category: 'prints',
        },
        // Canvas Prints
        {
          productUID: 20,
          name: '8x10 Canvas',
          description: 'Gallery wrap canvas 8x10',
          width: 8,
          height: 10,
          basePrice: 12.99,
          category: 'canvas',
        },
        {
          productUID: 21,
          name: '11x14 Canvas',
          description: 'Gallery wrap canvas 11x14',
          width: 11,
          height: 14,
          basePrice: 18.99,
          category: 'canvas',
        },
        {
          productUID: 22,
          name: '16x20 Canvas',
          description: 'Gallery wrap canvas 16x20',
          width: 16,
          height: 20,
          basePrice: 29.99,
          category: 'canvas',
        },
        {
          productUID: 23,
          name: '20x24 Canvas',
          description: 'Gallery wrap canvas 20x24',
          width: 20,
          height: 24,
          basePrice: 39.99,
          category: 'canvas',
        },
        // Posters
        {
          productUID: 30,
          name: '11x17 Poster',
          description: 'Matte finish poster 11x17',
          width: 11,
          height: 17,
          basePrice: 1.99,
          category: 'poster',
        },
        {
          productUID: 31,
          name: '16x20 Poster',
          description: 'Matte finish poster 16x20',
          width: 16,
          height: 20,
          basePrice: 3.49,
          category: 'poster',
        },
        {
          productUID: 32,
          name: '18x24 Poster',
          description: 'Matte finish poster 18x24',
          width: 18,
          height: 24,
          basePrice: 4.99,
          category: 'poster',
        },
        // Framed Prints
        {
          productUID: 40,
          name: '5x7 Wood Frame',
          description: 'Wood frame with mat 5x7',
          width: 5,
          height: 7,
          basePrice: 8.99,
          category: 'framed',
        },
        {
          productUID: 41,
          name: '8x10 Wood Frame',
          description: 'Wood frame with mat 8x10',
          width: 8,
          height: 10,
          basePrice: 14.99,
          category: 'framed',
        },
        {
          productUID: 42,
          name: '11x14 Wood Frame',
          description: 'Wood frame with mat 11x14',
          width: 11,
          height: 14,
          basePrice: 24.99,
          category: 'framed',
        },
        // Mugs
        {
          productUID: 50,
          name: 'Photo Mug 11oz',
          description: 'Ceramic mug with photo wrap',
          width: 0,
          height: 0,
          basePrice: 3.99,
          category: 'drinkware',
        },
        {
          productUID: 51,
          name: 'Photo Mug 15oz',
          description: 'Large ceramic mug with photo wrap',
          width: 0,
          height: 0,
          basePrice: 4.99,
          category: 'drinkware',
        },
        // Coasters
        {
          productUID: 60,
          name: 'Photo Coaster Single',
          description: 'Single ceramic photo coaster',
          width: 0,
          height: 0,
          basePrice: 1.49,
          category: 'home-decor',
        },
        {
          productUID: 61,
          name: 'Photo Coaster Set (4)',
          description: 'Set of 4 ceramic photo coasters',
          width: 0,
          height: 0,
          basePrice: 4.99,
          category: 'home-decor',
        },
        // Throw Pillows
        {
          productUID: 70,
          name: 'Throw Pillow 12x12',
          description: 'Square throw pillow with photo',
          width: 12,
          height: 12,
          basePrice: 7.99,
          category: 'home-decor',
        },
        {
          productUID: 71,
          name: 'Throw Pillow 14x14',
          description: 'Square throw pillow with photo',
          width: 14,
          height: 14,
          basePrice: 8.99,
          category: 'home-decor',
        },
        {
          productUID: 72,
          name: 'Throw Pillow 16x16',
          description: 'Square throw pillow with photo',
          width: 16,
          height: 16,
          basePrice: 9.99,
          category: 'home-decor',
        },
        // Blankets
        {
          productUID: 80,
          name: 'Fleece Blanket 50x60',
          description: 'Soft fleece blanket',
          width: 50,
          height: 60,
          basePrice: 14.99,
          category: 'textiles',
        },
        {
          productUID: 81,
          name: 'Fleece Blanket 60x80',
          description: 'Large fleece blanket',
          width: 60,
          height: 80,
          basePrice: 22.99,
          category: 'textiles',
        },
        // Phone Cases
        {
          productUID: 90,
          name: 'Phone Case iPhone 13',
          description: 'Custom photo phone case',
          width: 0,
          height: 0,
          basePrice: 5.99,
          category: 'tech',
        },
        {
          productUID: 91,
          name: 'Phone Case iPhone 14',
          description: 'Custom photo phone case',
          width: 0,
          height: 0,
          basePrice: 5.99,
          category: 'tech',
        },
        // Photo Books
        {
          productUID: 100,
          name: 'Softcover Photo Book 8x8',
          description: '8x8 softcover photo book',
          width: 8,
          height: 8,
          basePrice: 3.99,
          category: 'books',
        },
        {
          productUID: 101,
          name: 'Hardcover Photo Book 8x8',
          description: '8x8 hardcover photo book',
          width: 8,
          height: 8,
          basePrice: 7.99,
          category: 'books',
        },
        {
          productUID: 102,
          name: 'Hardcover Photo Book 11x14',
          description: '11x14 hardcover photo book',
          width: 11,
          height: 14,
          basePrice: 19.99,
          category: 'books',
        },
        // Calendars
        {
          productUID: 110,
          name: 'Wall Calendar 11x14',
          description: '12-month wall calendar',
          width: 11,
          height: 14,
          basePrice: 5.99,
          category: 'stationery',
        },
        {
          productUID: 111,
          name: 'Desk Calendar 5x7',
          description: 'Desk calendar with easel',
          width: 5,
          height: 7,
          basePrice: 2.99,
          category: 'stationery',
        },
      ],
      attributes: {
        paperTypes: [
          { attributeUID: 1, name: 'Photo Paper' },
          { attributeUID: 2, name: 'Lustre Paper' },
          { attributeUID: 3, name: 'Matte Paper' },
        ],
        finishes: [
          { attributeUID: 5, name: 'Glossy' },
          { attributeUID: 6, name: 'Matte' },
          { attributeUID: 7, name: 'Lustre' },
        ],
        shipping: [
          { attributeUID: 96, name: 'Economy', price: 3.48 },
          { attributeUID: 97, name: 'Standard', price: 5.98 },
          { attributeUID: 98, name: 'Priority', price: 9.98 },
        ],
      },
    };
  }

  /**
   * Log WHCC integration event for debugging
   */
  logEvent(eventName: string, data: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[WHCC ${timestamp}] ${eventName}:`, data);
  }
}

export const whccService = new WhccService();

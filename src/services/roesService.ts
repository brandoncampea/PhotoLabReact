// ROES Web Components integration service
import api from './api';
import { siteConfigService } from './siteConfigService';

export interface RoesConfig {
  apiKey: string;
  configId: string;
  enabled: boolean;
}

export interface RoesOrderItem {
  _id: string;
  quantity: number;
  options?: Record<string, any>;
  nodes?: any[];
  [key: string]: any;
}

export interface RoesOrderPayload {
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  items: RoesOrderItem[];
  totalPrice?: number;
  notes?: string;
  [key: string]: any;
}

class RoesService {
  /**
   * Get ROES configuration from localStorage
   */
  getConfig(): RoesConfig | null {
    try {
      const stored = localStorage.getItem('roesConfig');
      if (stored) {
        const config = JSON.parse(stored);
        return config;
      }
      return null;
    } catch (error) {
      console.error('Failed to parse ROES config:', error);
      return null;
    }
  }

  /**
   * Check if ROES is enabled
   */
  isEnabled(): boolean {
    return siteConfigService.isSiteEnabled('roes');
  }

  /**
   * Convert cart item to ROES order item format
   * Customize this based on your cart structure
   */
  convertCartToRoesOrder(cartItems: any[], customer: any): RoesOrderPayload {
    return {
      customer: {
        name: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim(),
        email: customer.email || '',
        phone: customer.phone,
      },
      items: cartItems.map((item) => ({
        _id: item.id || item.productId,
        quantity: item.quantity || 1,
        options: item.options || {},
        nodes: item.nodes || [],
        ...item, // Spread any additional ROES-specific properties
      })),
      totalPrice: cartItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0),
    };
  }

  /**
   * Submit order through ROES Web Components event bus
   * This triggers the ROES backend to process the order
   */
  submitOrderThroughRoesEventBus(payload: RoesOrderPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!window.$roes?.EventBus) {
          reject(new Error('ROES Web Components not initialized'));
          return;
        }

        // Emit the order submission event
        window.$roes.EventBus.emit('submit_order', payload);

        // Listen for response (timeout after 10s)
        const timeout = setTimeout(() => {
          window.$roes?.EventBus.off?.('order_submitted', handler);
          reject(new Error('ROES order submission timeout'));
        }, 10000);

        const handler = (response: any) => {
          clearTimeout(timeout);
          window.$roes?.EventBus.off?.('order_submitted', handler);
          if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'ROES order submission failed'));
          }
        };

        window.$roes.EventBus.on('order_submitted', handler);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Submit order through your backend API (which can then forward to ROES)
   * This is safer and allows you to process the order locally first
   */
  async submitOrderThroughBackend(payload: RoesOrderPayload): Promise<any> {
    try {
      const response = await api.post('/orders/roes-submit', {
        roesOrder: payload,
        timestamp: new Date().toISOString(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to submit order through backend:', error);
      throw error;
    }
  }

  /**
   * Get ROES order status/history from your backend
   */
  async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await api.get(`/orders/roes-status/${orderId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get ROES order status:', error);
      throw error;
    }
  }

  /**
   * Log ROES integration event for debugging
   */
  logEvent(eventName: string, data: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[ROES ${timestamp}] ${eventName}:`, data);
    // Optionally send to your backend for logging
    // apiClient.post('/logs/roes-event', { event: eventName, data, timestamp });
  }
}

export const roesService = new RoesService();

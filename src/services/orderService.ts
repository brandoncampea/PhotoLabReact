import api from './api';
// import { mockApi } from './mockApi'; // Removed: unused
import { Order, CartItem, ShippingAddress, BatchQueueSummary } from '../types';
import { taxService } from './taxService';

export const orderService = {
  async createOrder(
    items: CartItem[], 
    shippingAddress: ShippingAddress,
    shippingOption: 'batch' | 'direct' | 'none',
    shippingCost: number,
    discountCode?: string,
    studioFeeType?: string,
    studioFeeValue?: number,
    paymentIntentId?: string
  ): Promise<Order> {
    // Calculate subtotal with studio fees applied to each item
    let itemsTotal = items.reduce((sum, item) => {
      let itemPrice = item.price * item.quantity;
      
      // Apply studio fees to each item
      if (studioFeeType && studioFeeValue !== undefined) {
        if (studioFeeType === 'percentage') {
          const feeAmount = (itemPrice * studioFeeValue) / 100;
          itemPrice += feeAmount;
        } else if (studioFeeType === 'fixed') {
          itemPrice += studioFeeValue * item.quantity; // Add fixed fee per item
        }
      }
      
      return sum + itemPrice;
    }, 0);
    
    const subtotal = itemsTotal + shippingCost;
    const { taxAmount, taxRate, total } = taxService.calculateTotal(subtotal, shippingAddress);
    
    const response = await api.post<Order>('/orders', {
      items: items.map(item => {
        let price = item.price;
        
        // Apply studio fees
        if (studioFeeType && studioFeeValue !== undefined) {
          if (studioFeeType === 'percentage') {
            const feeAmount = (price * studioFeeValue) / 100;
            price += feeAmount;
          } else if (studioFeeType === 'fixed') {
            price += studioFeeValue;
          }
        }
        
        return {
          photoId: item.photoId,
          photoIds: item.photoIds,
          quantity: item.quantity,
          cropData: item.cropData,
          productId: item.productId,
          productSizeId: item.productSizeId,
          price: price,
        };
      }),
      subtotal,
      taxAmount,
      taxRate,
      total,
      shippingAddress,
      shippingOption,
      shippingCost,
      discountCode,
      paymentIntentId,
      isBatch: shippingOption === 'batch',
      labSubmitted: false
    });
    return response.data;
  },

  async getOrders(options?: { includeItems?: boolean; limit?: number }): Promise<Order[]> {
    const params = new URLSearchParams();
    if (options?.includeItems) {
      params.set('includeItems', '1');
    }
    if (typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
      params.set('limit', String(Math.floor(options.limit)));
    }
    const query = params.toString();
    const response = await api.get<Order[]>(`/orders${query ? `?${query}` : ''}`);
    return response.data;
  },

  async getOrderDetails(orderId: number): Promise<Order> {
    const response = await api.get<Order>(`/orders/details/${orderId}`);
    return response.data;
  },

  async getAdminOrders(options?: { includeItems?: boolean; limit?: number }): Promise<Order[]> {
    const params = new URLSearchParams();
    if (options?.includeItems) {
      params.set('includeItems', '1');
    }
    if (typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
      params.set('limit', String(Math.floor(options.limit)));
    }
    const query = params.toString();
    const response = await api.get<Order[]>(`/orders/admin/all-orders${query ? `?${query}` : ''}`);
    return response.data;
  },

  async getAdminOrderDetails(orderId: number): Promise<Order> {
    const response = await api.get<Order>(`/orders/admin/order-details/${orderId}`);
    return response.data;
  },

  async getOrder(id: number): Promise<Order> {
    const response = await api.get<Order>(`/orders/${id}`);
    return response.data;
  },

  async getBatchQueue(): Promise<BatchQueueSummary> {
    const response = await api.get<BatchQueueSummary>('/orders/admin/batch-queue');
    return response.data;
  },

  async submitBatch(orderIds: number[], batchAddress: ShippingAddress, selectedLab?: string): Promise<{ success: boolean; updatedCount: number; notReadyCount: number; failedCount?: number; selectedLab: string; }> {
    const response = await api.post('/orders/admin/submit-batch', {
      orderIds,
      batchAddress,
      ...(selectedLab ? { selectedLab } : {}),
    });
    return response.data;
  },

  async whccRetry(orderId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post(`/orders/admin/whcc-retry/${orderId}`);
      return response.data;
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        throw error;
      }

      const fallbackResponse = await api.post(`/orders/admin/${orderId}/whcc-retry`);
      return fallbackResponse.data;
    }
  },

  async resendDigitalDownload(orderId: number): Promise<{ success: boolean; message: string; digitalItemCount: number; recipientEmail: string; }> {
    const response = await api.post(`/orders/admin/${orderId}/resend-digital-download`);
    return response.data;
  },
};

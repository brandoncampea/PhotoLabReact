import api from './api';
import { Order, CartItem, ShippingAddress, BatchQueueSummary, WhccPriceAuditReport } from '../types';

export const orderService = {
  async batchUpdateStatus(orderIds: number[], status: string, message: string): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
    const response = await api.post('/orders/admin/batch-update-status', {
      orderIds,
      status,
      message,
    });
    return response.data;
  },
  async cancelOrder(orderId: number, cancelReason: string, refund: boolean): Promise<{ success: boolean; message?: string }> {
    const response = await api.patch(`/orders/admin/${orderId}/status`, {
      status: 'cancelled',
      cancelReason,
      refund,
    });
    return response.data;
  },
  async createOrder(
    items: CartItem[],
    shippingAddress: ShippingAddress,
    shippingOption: 'batch' | 'direct' | 'none',
    shippingCost: number,
    discountCode?: string,
    studioFeeType?: string,
    studioFeeValue?: number,
    paymentIntentId?: string,
    pricing?: {
      taxAmount: number;
      taxRate: number;
      total: number;
      subtotalBeforeDiscount?: number;
    },
    suppressEmail?: boolean,
    studioShippingCost?: number,
    shippingMargin?: number,
    refCode?: string
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

    const subtotal = pricing?.subtotalBeforeDiscount ?? itemsTotal;
    const taxAmount = pricing?.taxAmount ?? 0;
    const taxRate = pricing?.taxRate ?? 0;
    const total = pricing?.total ?? subtotal + taxAmount;
    
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
          albumId: item.albumId,
          quantity: item.quantity,
          cropData: item.cropData,
          productId: item.productId,
          productSizeId: item.productSizeId,
          digitalDownloadScope: item.digitalDownloadScope,
          productOptions: item.productOptions,
          price: price,
          attributes: item.attributes,
          packageGroupId: item.packageGroupId,
          packagePrice: item.packagePrice,
          packageName: item.packageName,
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
      labSubmitted: false,
      ...(suppressEmail ? { suppressEmail: true } : {}),
      ...(typeof studioShippingCost === 'number' ? { studioShippingCost } : {}),
      ...(typeof shippingMargin === 'number' ? { shippingMargin } : {}),
      ...(refCode ? { refCode } : {}),
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

  async getAdminOrders(options?: { includeItems?: boolean; page?: number; pageSize?: number }): Promise<{ total: number; page: number; pageSize: number; orders: Order[] }> {
    const params = new URLSearchParams();
    if (options?.includeItems) {
      params.set('includeItems', '1');
    }
    if (typeof options?.page === 'number' && Number.isFinite(options.page) && options.page > 0) {
      params.set('page', String(Math.floor(options.page)));
    }
    if (typeof options?.pageSize === 'number' && Number.isFinite(options.pageSize) && options.pageSize > 0) {
      params.set('pageSize', String(Math.floor(options.pageSize)));
    }
    const query = params.toString();
    const response = await api.get(`/orders/admin/all-orders${query ? `?${query}` : ''}`);
    return response.data;
  },

  async getAdminOrderDetails(orderId: number): Promise<Order> {
    const response = await api.get<Order>(`/orders/admin/order-details/${orderId}`);
    return response.data;
  },

  async getWhccPriceAuditReport(options?: { limit?: number; search?: string }): Promise<WhccPriceAuditReport> {
    const params = new URLSearchParams();
    if (typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
      params.set('limit', String(Math.floor(options.limit)));
    }
    if (options?.search && String(options.search).trim()) {
      params.set('search', String(options.search).trim());
    }
    const query = params.toString();
    const response = await api.get<WhccPriceAuditReport>(`/orders/admin/whcc-price-audit-report${query ? `?${query}` : ''}`);
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

  async submitBatch(orderIds: number[], batchAddress: ShippingAddress, selectedLab?: string, specialInstructions?: string): Promise<{ success: boolean; updatedCount: number; notReadyCount: number; failedCount?: number; selectedLab: string; }> {
    const response = await api.post('/orders/admin/submit-batch', {
      orderIds,
      batchAddress,
      ...(selectedLab ? { selectedLab } : {}),
      ...(specialInstructions !== undefined ? { specialInstructions } : {}),
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

  async updateStatus(orderId: number, status: string): Promise<any> {
    const response = await api.patch(`/orders/admin/${orderId}/status`, { status });
    return response.data;
  },
};

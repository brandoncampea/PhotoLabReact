import api from './api';
import { mockApi } from './mockApi';
import { Order, CartItem, ShippingAddress } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const orderService = {
  async createOrder(
    items: CartItem[], 
    shippingAddress: ShippingAddress,
    shippingOption: 'batch' | 'direct' | 'none',
    shippingCost: number,
    discountCode?: string
  ): Promise<Order> {
    if (useMockApi) {
      return mockApi.orders.createOrder(items, shippingAddress, shippingOption, shippingCost, discountCode);
    }
    const response = await api.post<Order>('/orders', {
      items: items.map(item => ({
        photoId: item.photoId,
        quantity: item.quantity,
        cropData: item.cropData,
      })),
      shippingAddress,
      shippingOption,
      shippingCost,
      discountCode
    });
    return response.data;
  },

  async getOrders(): Promise<Order[]> {
    if (useMockApi) {
      return mockApi.orders.getOrders();
    }
    const response = await api.get<Order[]>('/orders');
    return response.data;
  },

  async getOrder(id: number): Promise<Order> {
    if (useMockApi) {
      return mockApi.orders.getOrder(id);
    }
    const response = await api.get<Order>(`/orders/${id}`);
    return response.data;
  },
};

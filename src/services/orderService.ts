import api from './api';
// import { mockApi } from './mockApi'; // Removed: unused
import { Order, CartItem, ShippingAddress } from '../types';
import { taxService } from './taxService';
import { isUseMockApi } from '../utils/mockApiConfig';

export const orderService = {
  async createOrder(
    items: CartItem[], 
    shippingAddress: ShippingAddress,
    shippingOption: 'batch' | 'direct' | 'none',
    shippingCost: number,
    discountCode?: string
  ): Promise<Order> {
    if (isUseMockApi()) {
      // return mockApi.orders.createOrder(items, shippingAddress, shippingOption, shippingCost, discountCode); // Removed: mock function not implemented
    }
    
    // Calculate subtotal, tax, and total
    const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subtotal = itemsTotal + shippingCost;
    const { taxAmount, taxRate, total } = taxService.calculateTotal(subtotal, shippingAddress);
    
    const response = await api.post<Order>('/orders', {
      items: items.map(item => ({
        photoId: item.photoId,
        photoIds: item.photoIds,
        quantity: item.quantity,
        cropData: item.cropData,
        productId: item.productId,
        productSizeId: item.productSizeId,
        price: item.price,
      })),
      subtotal,
      taxAmount,
      taxRate,
      total,
      shippingAddress,
      shippingOption,
      shippingCost,
      discountCode,
      isBatch: shippingOption === 'batch',
      labSubmitted: false
    });
    return response.data;
  },

  async getOrders(): Promise<Order[]> {
    if (isUseMockApi()) {
      // return mockApi.orders.getOrders(); // Removed: mock function not implemented
    }
    const response = await api.get<Order[]>('/orders');
    return response.data;
  },

  async getOrder(id: number): Promise<Order> {
    if (isUseMockApi()) {
      // return mockApi.orders.getOrder(id); // Removed: mock function not implemented
    }
    const response = await api.get<Order>(`/orders/${id}`);
    return response.data;
  },
};

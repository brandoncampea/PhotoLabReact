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
    discountCode?: string,
    studioFeeType?: string,
    studioFeeValue?: number
  ): Promise<Order> {
    if (isUseMockApi()) {
      // return mockApi.orders.createOrder(items, shippingAddress, shippingOption, shippingCost, discountCode); // Removed: mock function not implemented
    }
    
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

  async getAdminOrders(): Promise<Order[]> {
    const response = await api.get<Order[]>('/orders/admin/all-orders');
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

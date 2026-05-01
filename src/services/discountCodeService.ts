import api from './api';
import { CartItem, DiscountCode, DiscountValidation } from '../types';

export const discountCodeService = {
  async getAll(): Promise<DiscountCode[]> {
    const response = await api.get<DiscountCode[]>('/discount-codes');
    return response.data;
  },

  async validate(code: string, payload: { items: CartItem[]; subtotal: number; shippingCost: number }): Promise<DiscountValidation> {
    const response = await api.post<DiscountValidation>('/discount-codes/validate', {
      code,
      items: payload.items,
      subtotal: payload.subtotal,
      shippingCost: payload.shippingCost,
    });
    return response.data;
  },

  async findBest(payload: { items: CartItem[]; subtotal: number; shippingCost: number; studioId?: number }): Promise<DiscountValidation & { searchedCount?: number }> {
    const response = await api.post<DiscountValidation & { searchedCount?: number }>('/discount-codes/best', {
      items: payload.items,
      subtotal: payload.subtotal,
      shippingCost: payload.shippingCost,
      studioId: payload.studioId,
    });
    return response.data;
  },

  async create(data: Partial<DiscountCode>): Promise<DiscountCode> {
    const response = await api.post<DiscountCode>('/discount-codes', data);
    return response.data;
  },

  async update(id: number, data: Partial<DiscountCode>): Promise<DiscountCode> {
    const response = await api.put<DiscountCode>(`/discount-codes/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/discount-codes/${id}`);
  },

  async duplicate(id: number): Promise<DiscountCode> {
    const response = await api.post<DiscountCode>(`/discount-codes/${id}/duplicate`);
    return response.data;
  },

  async incrementUsage(id: number): Promise<void> {
    await api.post(`/discount-codes/${id}/use`);
  },
};

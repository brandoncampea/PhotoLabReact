import api from './api';
import { DiscountCode } from '../types';

export const discountCodeService = {
  async getAll(): Promise<DiscountCode[]> {
    const response = await api.get<DiscountCode[]>('/discount-codes');
    return response.data;
  },

  async getByCode(code: string): Promise<DiscountCode> {
    const response = await api.get<DiscountCode>(`/discount-codes/code/${code}`);
    return response.data;
  },

  async create(data: Omit<DiscountCode, 'id' | 'createdDate'>): Promise<DiscountCode> {
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

  async incrementUsage(id: number): Promise<void> {
    await api.post(`/discount-codes/${id}/use`);
  },
};

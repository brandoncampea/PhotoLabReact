import api from './api';
import { PriceList } from '../types';

export const priceListAdminService = {
  async getAll(): Promise<PriceList[]> {
    const response = await api.get('/price-lists');
    return response.data;
  },

  async getById(id: number): Promise<PriceList | null> {
    try {
      const response = await api.get(`/price-lists/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch price list:', error);
      return null;
    }
  },

  async create(data: any): Promise<PriceList> {
    const response = await api.post('/price-lists', data);
    return response.data;
  },

  async update(id: number, data: any): Promise<PriceList> {
    const response = await api.put(`/price-lists/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/price-lists/${id}`);
  },

  async setDefault(id: number): Promise<void> {
    await api.post(`/price-lists/${id}/set-default`);
  },

  async removeProduct(priceListId: number, productId: number): Promise<void> {
    await api.delete(`/price-lists/${priceListId}/products/${productId}`);
  },
};

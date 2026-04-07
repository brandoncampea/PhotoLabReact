import api from './api';
import { PriceList, PriceListProduct } from '../types';

export const priceListAdminService = {
  async getAll(): Promise<PriceList[]> {
    const response = await api.get('/api/price-lists');
    return response.data;
  },

  async getById(id: number): Promise<PriceList | null> {
    try {
      const response = await api.get(`/api/price-lists/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch price list:', error);
      return null;
    }
  },

  async create(data: any): Promise<PriceList> {
    const response = await api.post('/api/price-lists', data);
    return response.data;
  },

  async update(id: number, data: any): Promise<PriceList> {
    const response = await api.put(`/api/price-lists/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/price-lists/${id}`);
  },

  async setDefault(id: number): Promise<void> {
    await api.post(`/api/price-lists/${id}/setDefault`);
  },

  async addProduct(
    priceListId: number,
    data: {
      name: string;
      description?: string;
      category?: string;
      basePrice?: number;
      cost?: number;
      isDigital?: boolean;
      isActive?: boolean;
      popularity?: number;
    }
  ): Promise<PriceListProduct> {
    const response = await api.post(`/api/price-lists/${priceListId}/products`, data);
    return response.data;
  },

  async removeProduct(priceListId: number, productId: number): Promise<void> {
    await api.delete(`/api/price-lists/${priceListId}/products/${productId}`);
  },

  async removeProductSize(priceListId: number, productId: number, sizeId: number): Promise<void> {
    await api.delete(`/api/price-lists/${priceListId}/products/${productId}/sizes/${sizeId}`);
  },

  async addItemsToPriceList(priceListId: number, items: any[]): Promise<void> {
    await api.post(`/api/price-lists/${priceListId}/items`, { items });
  },
};

import api from './api';
import { Product } from '../types';

export const productService = {
  async getAll(): Promise<Product[]> {
    const response = await api.get<Product[]>('/products');
    return response.data;
  },

  async getProducts(): Promise<Product[]> {
    const response = await api.get<Product[]>('/products');
    return response.data;
  },

  async getActiveProducts(albumId?: number): Promise<Product[]> {
    const url = albumId ? `/products/active?albumId=${albumId}` : '/products/active';
    const response = await api.get<Product[]>(url);
    return response.data;
  },
};

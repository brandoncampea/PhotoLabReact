import api from './api';
import { Product } from '../types';

export const productService = {
  async getProducts(): Promise<Product[]> {
    const response = await api.get<Product[]>('/products');
    return response.data;
  },

  async getActiveProducts(): Promise<Product[]> {
    const response = await api.get<Product[]>('/products/active');
    return response.data;
  },
};

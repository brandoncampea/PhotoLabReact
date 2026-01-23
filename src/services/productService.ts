import api from './api';
import { adminMockApi } from './adminMockApi';
import { Product } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const productService = {
  async getProducts(): Promise<Product[]> {
    if (useMockApi) {
      return adminMockApi.products.getAll();
    }
    const response = await api.get<Product[]>('/products');
    return response.data;
  },

  async getActiveProducts(): Promise<Product[]> {
    if (useMockApi) {
      const products = await adminMockApi.products.getAll();
      return products.filter(p => p.isActive);
    }
    const response = await api.get<Product[]>('/products/active');
    return response.data;
  },
};

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

  async getActiveProductsByStudio(studioId: number): Promise<Product[]> {
    const response = await api.get<Product[]>(`/products/active?studioId=${studioId}`);
    return response.data;
  },

  async getProductPhotos(productId: number): Promise<{ id: number; image_url: string; sort_order: number }[]> {
    const response = await api.get(`/products/${productId}/photos`);
    return response.data.photos || [];
  },

  async uploadProductPhoto(productId: number, file: File): Promise<{ id: number; image_url: string; sort_order: number }> {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post(`/products/${productId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.photo;
  },

  async deleteProductPhoto(productId: number, photoId: number): Promise<void> {
    await api.delete(`/products/${productId}/photos/${photoId}`);
  },
};

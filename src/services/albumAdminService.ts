import { Album, PriceList } from '../types';
import api from './api';

export const albumAdminService = {
  async getPriceLists(): Promise<PriceList[]> {
    const response = await api.get<PriceList[]>('/price-lists');
    return Array.isArray(response.data) ? response.data : [];
  },

  async createAlbum(data: Partial<Album>): Promise<Album> {
    const response = await api.post<Album>('/albums', data);
    return response.data;
  },

  async updateAlbum(id: number, data: Partial<Album>): Promise<Album> {
    const response = await api.put<Album>(`/albums/${id}`, data);
    return response.data;
  },

  async deleteAlbum(id: number): Promise<void> {
    await api.delete(`/albums/${id}`);
  },

  async getPriceOverrides(albumId: number): Promise<{ productSizeId: number; sizeName: string; productName: string; productId: number; price: number }[]> {
    const response = await api.get(`/albums/${albumId}/price-overrides`);
    return response.data.overrides || [];
  },

  async savePriceOverrides(albumId: number, overrides: { productSizeId: number; price: number }[]): Promise<void> {
    await api.put(`/albums/${albumId}/price-overrides`, { overrides });
  },

  async getShareCodes(albumId: number): Promise<{ id: number; code: string; label: string | null; createdAt: string; visits: number; orders: number }[]> {
    const response = await api.get(`/albums/${albumId}/share-codes`);
    return response.data.codes || [];
  },

  async createShareCode(albumId: number, label?: string): Promise<{ code: string; label: string | null }> {
    const response = await api.post(`/albums/${albumId}/share-codes`, { label: label || null });
    return response.data;
  },

  async getFavoriteStats(albumId: number): Promise<{ photoId: number; favoriteCount: number; fileName: string }[]> {
    const response = await api.get(`/albums/${albumId}/favorite-stats`);
    return response.data.stats || [];
  },
};

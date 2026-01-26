import { Album, PriceList } from '../types';
import api from './api';

export const albumAdminService = {
  async getPriceLists(): Promise<PriceList[]> {
    const response = await api.get<PriceList[]>('/price-lists');
    return response.data;
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
};

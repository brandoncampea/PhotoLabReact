import { Album, PriceList } from '../types';
import { adminMockApi } from './adminMockApi';
import api from './api';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const albumAdminService = {
  async getPriceLists(): Promise<PriceList[]> {
    if (useMockApi) {
      return adminMockApi.priceLists.getAll();
    }
    try {
      const response = await api.get<PriceList[]>('/price-lists');
      return response.data;
    } catch (error) {
      console.warn('Falling back to mock price lists:', error);
      return adminMockApi.priceLists.getAll();
    }
  },

  async createAlbum(data: Partial<Album>): Promise<Album> {
    if (useMockApi) {
      return adminMockApi.albums.create(data);
    }
    const response = await api.post<Album>('/albums', data);
    return response.data;
  },

  async updateAlbum(id: number, data: Partial<Album>): Promise<Album> {
    if (useMockApi) {
      return adminMockApi.albums.update(id, data);
    }
    const response = await api.put<Album>(`/albums/${id}`, data);
    return response.data;
  },

  async deleteAlbum(id: number): Promise<void> {
    if (useMockApi) {
      return adminMockApi.albums.delete(id);
    }
    await api.delete(`/albums/${id}`);
  },
};

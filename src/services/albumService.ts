import api from './api';
import { mockApi } from './mockApi';
import { Album } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const albumService = {
  async getAlbums(): Promise<Album[]> {
    if (useMockApi) {
      return mockApi.albums.getAlbums();
    }
    try {
      const response = await api.get<Album[]>('/albums');
      return response.data;
    } catch (error) {
      console.error('Error fetching albums from API:', error);
      throw error;
    }
  },

  async getAlbum(id: number): Promise<Album> {
    if (useMockApi) {
      return mockApi.albums.getAlbum(id);
    }
    try {
      const response = await api.get<Album>(`/albums/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching album from API:', error);
      throw error;
    }
  },
};

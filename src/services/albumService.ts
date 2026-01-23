import api from './api';
import { mockApi } from './mockApi';
import { Album } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const albumService = {
  async getAlbums(): Promise<Album[]> {
    if (useMockApi) {
      return mockApi.albums.getAlbums();
    }
    const response = await api.get<Album[]>('/albums');
    return response.data;
  },

  async getAlbum(id: number): Promise<Album> {
    if (useMockApi) {
      return mockApi.albums.getAlbum(id);
    }
    const response = await api.get<Album>(`/albums/${id}`);
    return response.data;
  },
};

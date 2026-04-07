import api from './api';
import { Album } from '../types';

export const albumService = {
  async getAlbums(): Promise<Album[]> {
    const response = await api.get<Album[]>('/albums');
    // Defensive: always return an array
    return Array.isArray(response.data) ? response.data : [];
  },

  async getAlbum(id: number): Promise<Album> {
    const response = await api.get<Album>(`/albums/${id}`);
    return response.data;
  },
};

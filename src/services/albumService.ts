import api from './api';
import { Album } from '../types';

export const albumService = {
  async getAlbums(): Promise<Album[]> {
    const response = await api.get<Album[]>('/albums');
    return response.data;
  },

  async getAlbum(id: number): Promise<Album> {
    const response = await api.get<Album>(`/albums/${id}`);
    return response.data;
  },
};

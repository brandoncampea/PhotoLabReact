import { Album, PriceList } from '../types';
import { adminMockApi } from './adminMockApi';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const albumAdminService = {
  async getPriceLists(): Promise<PriceList[]> {
    if (useMockApi) {
      return adminMockApi.priceLists.getAll();
    }
    // For now, still use mock API for price lists until backend fully supports them
    return adminMockApi.priceLists.getAll();
  },

  async createAlbum(data: Partial<Album>): Promise<Album> {
    if (useMockApi) {
      return adminMockApi.albums.create(data);
    }
    // For now, still use mock API
    return adminMockApi.albums.create(data);
  },

  async updateAlbum(id: number, data: Partial<Album>): Promise<Album> {
    if (useMockApi) {
      return adminMockApi.albums.update(id, data);
    }
    // For now, still use mock API
    return adminMockApi.albums.update(id, data);
  },

  async deleteAlbum(id: number): Promise<void> {
    if (useMockApi) {
      return adminMockApi.albums.delete(id);
    }
    // For now, still use mock API
    return adminMockApi.albums.delete(id);
  },
};

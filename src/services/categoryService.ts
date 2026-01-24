import api from './api';
import { adminMockApi } from './adminMockApi';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const categoryService = {
  async getCategories(): Promise<string[]> {
    if (useMockApi) {
      return adminMockApi.albums.getCategories();
    }
    try {
      const response = await api.get<string[]>('/categories');
      return response.data;
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to mock API
      return adminMockApi.albums.getCategories();
    }
  },

  async addCategory(category: string): Promise<string[]> {
    if (useMockApi) {
      return adminMockApi.albums.addCategory(category);
    }
    try {
      await api.post('/categories', { category });
      return this.getCategories();
    } catch (error) {
      console.error('Error adding category:', error);
      // Fallback to mock API
      return adminMockApi.albums.addCategory(category);
    }
  },

  async deleteCategory(category: string): Promise<string[]> {
    if (useMockApi) {
      return adminMockApi.albums.deleteCategory(category);
    }
    try {
      await api.delete(`/categories/${encodeURIComponent(category)}`);
      return this.getCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      // Fallback to mock API
      return adminMockApi.albums.deleteCategory(category);
    }
  },
};

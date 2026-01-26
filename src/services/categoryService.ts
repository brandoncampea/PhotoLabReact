import api from './api';

export const categoryService = {
  async getCategories(): Promise<string[]> {
    const response = await api.get<string[]>('/categories');
    return response.data;
  },

  async addCategory(category: string): Promise<string[]> {
    await api.post('/categories', { category });
    return this.getCategories();
  },

  async deleteCategory(category: string): Promise<string[]> {
    await api.delete(`/categories/${encodeURIComponent(category)}`);
    return this.getCategories();
  },
};

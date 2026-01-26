import api from './api';

export const packageService = {
  async getAll(priceListId?: number): Promise<any[]> {
    const url = priceListId ? `/packages?priceListId=${priceListId}` : '/packages';
    const response = await api.get(url);
    return response.data;
  },

  async create(data: any): Promise<any> {
    const response = await api.post('/packages', data);
    return response.data;
  },

  async update(id: number, data: any): Promise<any> {
    const response = await api.put(`/packages/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/packages/${id}`);
  },
};

import api from './api';

export const labService = {
  async getLabs() {
    const res = await api.get('/api/labs');
    return res.data;
  },
  async importProducts(labId: number, products: any[]) {
    const res = await api.post('/api/labs/import', { labId, products });
    return res.data;
  },
};

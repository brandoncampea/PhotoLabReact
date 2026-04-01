import api from './api';

export const studioPriceListService = {
  async getLists(studio_id: number) {
    const res = await api.get('/studio-price-lists', { params: { studio_id } });
    return res.data;
  },
  async createList(studio_id: number, name: string, super_price_list_id: number, description?: string) {
    const res = await api.post('/studio-price-lists', { studio_id, name, super_price_list_id, description });
    return res.data;
  },
  async updateList(id: number, data: any) {
    const res = await api.put(`/studio-price-lists/${id}`, data);
    return res.data;
  },
  async getItems(listId: number) {
    const res = await api.get(`/studio-price-lists/${listId}/items`);
    return res.data;
  },
  async addItem(listId: number, product_size_id: number, price?: number, is_offered?: boolean) {
    const res = await api.post(`/studio-price-lists/${listId}/items`, { product_size_id, price, is_offered });
    return res.data;
  },
  async updateItem(listId: number, itemId: number, data: any) {
    const res = await api.put(`/studio-price-lists/${listId}/items/${itemId}`, data);
    return res.data;
  },
  async applyMarkupToOffered(listId: number, markup_percent: number) {
    const res = await api.patch(`/studio-price-lists/${listId}/items/apply-markup`, { markup_percent });
    return res.data;
  },
};

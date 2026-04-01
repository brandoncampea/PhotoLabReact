import api from './api';

export const superPriceListService = {
  async getLists() {
    const res = await api.get('/super-price-lists');
    return res.data;
  },
  async createList(name: string, description?: string) {
    const res = await api.post('/super-price-lists', { name, description });
    return res.data;
  },
  async getItems(listId: number) {
    const res = await api.get(`/super-price-lists/${listId}/items`);
    return res.data;
  },
  async addItem(
    listId: number,
    product_size_id?: number,
    base_cost?: number,
    markup_percent?: number,
    extra?: {
      product_name?: string;
      size_name?: string;
      category?: string;
      description?: string;
      is_digital_only?: boolean;
    }
  ) {
    const res = await api.post(`/super-price-lists/${listId}/items`, {
      product_size_id,
      base_cost,
      markup_percent,
      ...(extra || {}),
    });
    return res.data;
  },
  async updateItem(listId: number, itemId: number, data: any) {
    const res = await api.put(`/super-price-lists/${listId}/items/${itemId}`, data);
    return res.data;
  },
  async importItems(listId: number, items: any[]) {
    const res = await api.post(`/super-price-lists/${listId}/import-items`, { items });
    return res.data;
  },
  async bulkSetActive(listId: number, item_ids: number[], is_active: boolean) {
    const res = await api.patch(`/super-price-lists/${listId}/items/bulk-active`, { item_ids, is_active });
    return res.data;
  },
  async bulkSetMarkup(listId: number, markup_percent: number) {
    const res = await api.patch(`/super-price-lists/${listId}/bulk-markup`, { markup_percent });
    return res.data;
  },
  async getCategoryImages(listId: number) {
    const res = await api.get(`/super-price-lists/${listId}/category-images`);
    return res.data;
  },
  async uploadCategoryImage(listId: number, formData: FormData) {
    const res = await api.post(`/super-price-lists/${listId}/category-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.image_url as string;
  },
};

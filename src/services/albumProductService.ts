import api from './api';

export const albumProductService = {
  async getProducts(albumId: number) {
    const res = await api.get(`/album-products/${albumId}`);
    return res.data;
  },
};

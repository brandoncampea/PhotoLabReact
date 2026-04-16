import api from './api';

export const notifyWatchersService = {
  async notify(albumId: number) {
    const res = await api.post('/notify-watchers', { albumId });
    return res.data;
  },
};

export default notifyWatchersService;

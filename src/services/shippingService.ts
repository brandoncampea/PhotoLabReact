import api from './api';
import { ShippingConfig } from '../types';

export const shippingService = {
  async getConfig(): Promise<ShippingConfig> {
    const response = await api.get<ShippingConfig>('/shipping/config');
    return response.data;
  },

  async updateConfig(config: Partial<ShippingConfig>): Promise<ShippingConfig> {
    const response = await api.put<ShippingConfig>('/shipping/config', config);
    return response.data;
  },
};

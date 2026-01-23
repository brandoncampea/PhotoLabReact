import api from './api';
import { adminMockApi } from './adminMockApi';
import { ShippingConfig } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const shippingService = {
  async getConfig(): Promise<ShippingConfig> {
    if (useMockApi) {
      return adminMockApi.shipping.getConfig();
    }
    const response = await api.get<ShippingConfig>('/shipping/config');
    return response.data;
  },
};

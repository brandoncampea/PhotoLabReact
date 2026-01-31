import api from './api';
import { adminMockApi } from './adminMockApi';
import { ShippingConfig } from '../types';
import { isUseMockApi } from '../utils/mockApiConfig';

export const shippingService = {
  async getConfig(): Promise<ShippingConfig> {
    if (isUseMockApi()) {
      return adminMockApi.shipping.getConfig();
    }
    const response = await api.get<ShippingConfig>('/shipping/config');
    return response.data;
  },
};

import api from './api';
import { ShippingConfig, ShippingAddress, CartItem, ShippingQuote } from '../types';

export interface ShippingRubricSummary {
  source: string;
  matrix: Record<string, Record<string, number>>;
  destinations: Record<string, string>;
}

export const shippingService = {
  async getConfig(): Promise<ShippingConfig> {
    const response = await api.get<ShippingConfig>('/shipping/config');
    return response.data;
  },

  async updateConfig(config: Partial<ShippingConfig>): Promise<ShippingConfig> {
    const response = await api.put<ShippingConfig>('/shipping/config', config);
    return response.data;
  },

  async getRubric(): Promise<ShippingRubricSummary> {
    const response = await api.get<ShippingRubricSummary>('/shipping/rubric');
    return response.data;
  },

  async quote(params: {
    shippingOption: 'batch' | 'direct';
    shippingAddress?: ShippingAddress;
    items: CartItem[];
  }): Promise<ShippingQuote> {
    const response = await api.post<ShippingQuote>('/shipping/quote', params);
    return response.data;
  },
};

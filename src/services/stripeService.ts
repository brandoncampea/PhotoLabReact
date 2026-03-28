import api from './api';
import { StripeConfig, PaymentIntent, CartItem } from '../types';

export const stripeService = {
  async getConfig(): Promise<StripeConfig> {
    const response = await api.get<StripeConfig>('/stripe/config');
    return response.data;
  },

  async saveConfig(config: Partial<StripeConfig>): Promise<StripeConfig> {
    // Save Stripe config to backend (use PUT to match backend)
    const response = await api.put<StripeConfig>('/stripe/config', config);
    return response.data;
  },
  async testConnection(secretKey: string): Promise<{ success: boolean; message: string; accountId?: string; accountEmail?: string; isLive?: boolean }> {
    try {
      const response = await api.post('/stripe/test-connection', { secretKey });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to connect to Stripe',
      };
    }
  },

  async createPaymentIntent(
    items: CartItem[],
    shippingOption: 'batch' | 'direct',
    shippingCost: number,
    discountAmount: number = 0
  ): Promise<PaymentIntent> {
    try {
      const response = await api.post<PaymentIntent>('/stripe/create-payment-intent', {
        items,
        shippingOption,
        shippingCost,
        discountAmount,
      });
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },

  async confirmPayment(paymentIntentId: string): Promise<{ success: boolean; message: string }> {
    // No mock confirmation allowed
    try {
      const response = await api.post<{ success: boolean; message: string }>(
        `/stripe/confirm-payment/${paymentIntentId}`
      );
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },
};

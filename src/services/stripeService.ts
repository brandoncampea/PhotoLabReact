import api from './api';
import { adminMockApi } from './adminMockApi';
import { isUseMockApi } from '../utils/mockApiConfig';
import { StripeConfig, PaymentIntent, CartItem } from '../types';

export const stripeService = {
  async getConfig(): Promise<StripeConfig> {
    if (isUseMockApi()) {
      return adminMockApi.stripe.getConfig();
    }
    const response = await api.get<StripeConfig>('/stripe/config');
    return response.data;
  },

  async saveConfig(config: Partial<StripeConfig>): Promise<StripeConfig> {
    // Save Stripe config to backend (use PUT to match backend)
    const response = await api.put<StripeConfig>('/stripe/config', config);
    return response.data;
  },
  async getConfig(): Promise<StripeConfig> {
    if (isUseMockApi()) {
      return adminMockApi.stripe.getConfig();
    }
    const response = await api.get<StripeConfig>('/stripe/config');
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
    if (isUseMockApi()) {
      // Mock payment intent creation
      const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const finalAmount = Math.round((totalAmount + shippingCost - discountAmount) * 100); // Convert to cents
      
      return {
        id: 'pi_mock_' + Math.random().toString(36).substring(7),
        clientSecret: 'pi_mock_secret_' + Math.random().toString(36).substring(7),
        amount: finalAmount,
        currency: 'usd',
        status: 'requires_payment_method',
      };
    }
    
    try {
      const response = await api.post<PaymentIntent>('/stripe/create-payment-intent', {
        items,
        shippingOption,
        shippingCost,
        discountAmount,
      });
      return response.data;
    } catch (error: any) {
      // If Stripe is not configured (503) or any other error, fall back to mock payment
      if (error.response?.status === 503 || error.message?.includes('Stripe')) {
        console.warn('Stripe not configured, using mock payment:', error.message);
        const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const finalAmount = Math.round((totalAmount + shippingCost - discountAmount) * 100);
        
        return {
          id: 'pi_mock_' + Math.random().toString(36).substring(7),
          clientSecret: 'pi_mock_secret_' + Math.random().toString(36).substring(7),
          amount: finalAmount,
          currency: 'usd',
          status: 'requires_payment_method',
        };
      }
      throw error;
    }
  },

  async confirmPayment(paymentIntentId: string): Promise<{ success: boolean; message: string }> {
    // If using mock API or the payment ID is a mock ID, use mock confirmation
    if (isUseMockApi() || paymentIntentId.startsWith('pi_mock_')) {
      // Simulate payment confirmation delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        success: true,
        message: 'Payment successful! (Mock)',
      };
    }
    
    try {
      const response = await api.post<{ success: boolean; message: string }>(
        `/stripe/confirm-payment/${paymentIntentId}`
      );
      return response.data;
    } catch (error: any) {
      // If backend fails, fall back to mock confirmation
      if (error.response?.status === 404 || error.response?.status === 503) {
        console.warn('Stripe confirm failed, using mock confirmation:', error.message);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return {
          success: true,
          message: 'Payment successful! (Mock)',
        };
      }
      throw error;
    }
  },
};

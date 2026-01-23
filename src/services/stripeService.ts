import api from './api';
import { adminMockApi } from './adminMockApi';
import { StripeConfig, PaymentIntent, CartItem } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const stripeService = {
  async getConfig(): Promise<StripeConfig> {
    if (useMockApi) {
      return adminMockApi.stripe.getConfig();
    }
    const response = await api.get<StripeConfig>('/stripe/config');
    return response.data;
  },

  async createPaymentIntent(
    items: CartItem[],
    shippingOption: 'batch' | 'direct',
    shippingCost: number,
    discountAmount: number = 0
  ): Promise<PaymentIntent> {
    if (useMockApi) {
      // Mock payment intent creation
      const totalAmount = items.reduce((sum, item) => sum + item.photo.price * item.quantity, 0);
      const finalAmount = Math.round((totalAmount + shippingCost - discountAmount) * 100); // Convert to cents
      
      return {
        id: 'pi_mock_' + Math.random().toString(36).substring(7),
        clientSecret: 'pi_mock_secret_' + Math.random().toString(36).substring(7),
        amount: finalAmount,
        currency: 'usd',
        status: 'requires_payment_method',
      };
    }
    
    const response = await api.post<PaymentIntent>('/stripe/create-payment-intent', {
      items,
      shippingOption,
      shippingCost,
      discountAmount,
    });
    return response.data;
  },

  async confirmPayment(paymentIntentId: string): Promise<{ success: boolean; message: string }> {
    if (useMockApi) {
      // Simulate payment confirmation delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        success: true,
        message: 'Payment successful! (Mock)',
      };
    }
    
    const response = await api.post<{ success: boolean; message: string }>(
      `/stripe/confirm-payment/${paymentIntentId}`
    );
    return response.data;
  },
};

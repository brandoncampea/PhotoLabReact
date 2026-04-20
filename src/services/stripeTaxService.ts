import api from './api';
import { CartItem, ShippingAddress } from '../types';

export const stripeTaxService = {
  async calculateTax({
    items,
    shippingAddress,
    currency = 'usd',
  }: {
    items: CartItem[];
    shippingAddress: ShippingAddress;
    currency?: string;
  }): Promise<{ taxAmount: number; taxRate: number }> {
    // Map CartItem[] to Stripe lineItems[]
    const lineItems = items.map((item) => ({
      amount: Math.round(item.price * 100), // cents
      reference: item.productId ? String(item.productId) : 'item',
      // Optionally add tax_code if available
    }));
    const response = await api.post('/tax/calculate', {
      lineItems,
      shippingAddress: {
        line1: shippingAddress.addressLine1,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.zipCode,
        country: shippingAddress.country,
      },
      currency,
    });
    // Stripe returns amount_total and tax_amount_exclusive
    const { amount_total, tax_amount_exclusive } = response.data;
    return {
      taxAmount: typeof tax_amount_exclusive === 'number' ? tax_amount_exclusive / 100 : 0,
      taxRate: 0, // Stripe Tax does not return a single rate
    };
  },
};

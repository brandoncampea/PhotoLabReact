import { ShippingAddress } from '../types';

// State tax rates (simplified for demo - use real rates in production)
const STATE_TAX_RATES: Record<string, number> = {
  'AL': 0.04, 'AK': 0.00, 'AZ': 0.056, 'AR': 0.065, 'CA': 0.0725,
  'CO': 0.029, 'CT': 0.065, 'DE': 0.00, 'FL': 0.06, 'GA': 0.04,
  'HI': 0.04, 'ID': 0.06, 'IL': 0.0625, 'IN': 0.07, 'IA': 0.06,
  'KS': 0.057, 'KY': 0.06, 'LA': 0.045, 'ME': 0.055, 'MD': 0.06,
  'MA': 0.0625, 'MI': 0.06, 'MN': 0.06875, 'MS': 0.07, 'MO': 0.0425,
  'MT': 0.00, 'NE': 0.055, 'NV': 0.0685, 'NH': 0.00, 'NJ': 0.0625,
  'NM': 0.05125, 'NY': 0.04, 'NC': 0.045, 'ND': 0.05, 'OH': 0.0575,
  'OK': 0.045, 'OR': 0.00, 'PA': 0.06, 'RI': 0.07, 'SC': 0.07,
  'SD': 0.045, 'TN': 0.055, 'TX': 0.0625, 'UT': 0.061, 'VT': 0.06,
  'VA': 0.053, 'WA': 0.065, 'WV': 0.06, 'WI': 0.05, 'WY': 0.04,
  'DC': 0.0575
};

export const taxService = {
  /**
   * Calculate tax based on shipping address
   * @param subtotal - The subtotal before tax (items + shipping)
   * @param address - Customer's shipping address
   * @returns Object with tax amount and tax rate
   */
  calculateTax(subtotal: number, address: ShippingAddress): { taxAmount: number; taxRate: number } {
    // Only apply tax to US addresses
    if (address.country && address.country.toLowerCase() !== 'united states') {
      return { taxAmount: 0, taxRate: 0 };
    }

    const state = (address.state || '').toUpperCase();
    const taxRate = STATE_TAX_RATES[state] || 0;
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100; // Round to 2 decimals

    return { taxAmount, taxRate };
  },

  /**
   * Get tax rate for a specific state
   */
  getTaxRateForState(state: string): number {
    const normalizedState = (state || '').toUpperCase();
    return STATE_TAX_RATES[normalizedState] || 0;
  },

  /**
   * Calculate total with tax
   */
  calculateTotal(subtotal: number, address: ShippingAddress): { subtotal: number; taxAmount: number; taxRate: number; total: number } {
    const { taxAmount, taxRate } = this.calculateTax(subtotal, address);
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    return {
      subtotal,
      taxAmount,
      taxRate,
      total
    };
  }
};

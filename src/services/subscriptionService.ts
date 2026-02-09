import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from '../constants/subscriptions';

export const subscriptionService = {
  // Get all subscription plans
  getPlans: () => SUBSCRIPTION_PLANS,

  // Get single plan
  getPlan: (planId: string) => SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS],

  // Get subscription status options
  getStatuses: () => SUBSCRIPTION_STATUSES,

  // Format price
  formatPrice: (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  },

  // Calculate annual price
  calculateAnnualPrice: (monthlyPrice: number): number => {
    return monthlyPrice * 12;
  },

  // Get annual savings
  getAnnualSavings: (monthlyPrice: number): number => {
    return monthlyPrice * 12 * 0.15; // 15% discount for annual
  }
};

export { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES };

export default subscriptionService;

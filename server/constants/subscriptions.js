// Subscription plans and pricing
export const SUBSCRIPTION_PLANS = {
  basic: {
    id: 'basic',
    name: 'Basic',
    monthlyPrice: 29,
    stripePriceId: 'price_1QqI2mFc0tLpWH2y0j1c3K8m', // Test mode Stripe price ID for $29/mo
    features: [
      'Up to 5 albums',
      'Basic photo editing',
      'Standard support',
      'Monthly reports'
    ],
    maxAlbums: 5,
    maxUsers: 3,
    maxPhotos: 500,
    maxStorageGb: 50
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 79,
    stripePriceId: 'price_1QqI2mFc0tLpWH2y0j2d4L9n', // Test mode Stripe price ID for $79/mo
    features: [
      'Unlimited albums',
      'Advanced analytics',
      'Advanced photo editing',
      'Priority support',
      'Custom watermarks',
      'API access'
    ],
    maxAlbums: null, // unlimited
    maxUsers: 10,
    maxPhotos: 5000,
    maxStorageGb: 500
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 199,
    stripePriceId: 'price_1QqI2mFc0tLpWH2y0j3e5M0o', // Test mode Stripe price ID for $199/mo
    features: [
      'Unlimited albums',
      'Advanced analytics',
      'Advanced photo editing',
      '24/7 premium support',
      'Custom watermarks',
      'API access',
      'Dedicated account manager',
      'Custom integrations'
    ],
    maxAlbums: null,
    maxUsers: null, // unlimited
    maxPhotos: 50000,
    maxStorageGb: 2000
  }
};

export const SUBSCRIPTION_STATUSES = {
  inactive: 'inactive',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  paused: 'paused'
};

export default { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES };

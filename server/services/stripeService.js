import Stripe from 'stripe';
import mssql from '../mssql.cjs';
const { queryRow } = mssql;

// Initialize Stripe with secret key from environment
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_51QqI2mFc0tLpWH2yXzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMn';
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16'
});

const getConfiguredStripeClient = async () => {
  try {
    const config = await queryRow('SELECT * FROM subscription_stripe_config WHERE id = 1');
    const secretKey = config?.secret_key ? String(config.secret_key).trim() : '';
    const isActive = Boolean(config?.is_active);

    if (isActive && secretKey && !secretKey.includes('example')) {
      return {
        client: new Stripe(secretKey, { apiVersion: '2023-10-16' }),
        config,
      };
    }
  } catch (error) {
    console.warn('Subscription Stripe config lookup failed, falling back to env key:', error?.message || error);
  }

  return {
    client: stripe,
    config: null,
  };
};

export const stripeService = {
  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(studioId, stripePriceId, successUrl, cancelUrl) {
    try {
      const { client } = await getConfiguredStripeClient();
      // Create a new customer or get existing one
      const session = await client.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: stripePriceId,
            quantity: 1
          }
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          studioId: studioId.toString()
        }
      });

      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  },

  /**
   * Get subscription details from Stripe
   */
  async getSubscription(subscriptionId) {
    try {
      const { client } = await getConfiguredStripeClient();
      const subscription = await client.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error retrieving subscription:', error);
      throw error;
    }
  },

  /**
   * Update subscription to new price
   */
  async updateSubscription(subscriptionId, newPriceId) {
    try {
      const { client } = await getConfiguredStripeClient();
      const subscription = await client.subscriptions.retrieve(subscriptionId);
      
      // Update the subscription with new price
      const updated = await client.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId
          }
        ]
      });

      return updated;
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  },

  /**
   * Set cancel_at_period_end on a subscription
   */
  async setCancelAtPeriodEnd(subscriptionId, cancelAtPeriodEnd) {
    try {
      const { client } = await getConfiguredStripeClient();
      const subscription = await client.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd
      });
      return subscription;
    } catch (error) {
      console.error('Error setting cancel_at_period_end:', error);
      throw error;
    }
  },

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId) {
    try {
      const { client } = await getConfiguredStripeClient();
      const subscription = await client.subscriptions.del(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  },

  /**
   * Create a Stripe customer
   */
  async createCustomer(email, name) {
    try {
      const { client } = await getConfiguredStripeClient();
      const customer = await client.customers.create({
        email,
        name
      });
      return customer;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  },

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(body, signature, webhookSecret) {
    try {
      let signingSecret = webhookSecret;

      if (!signingSecret) {
        const { config } = await getConfiguredStripeClient();
        signingSecret = config?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
      }

      const { client } = await getConfiguredStripeClient();
      const event = client.webhooks.constructEvent(body, signature, signingSecret);
      return event;
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw error;
    }
  }
};

export default stripeService;

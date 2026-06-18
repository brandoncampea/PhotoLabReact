import Stripe from 'stripe';
import mssql from '../mssql.cjs';
const { queryRow } = mssql;

// Initialize Stripe with secret key from environment
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_51QqI2mFc0tLpWH2yXzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMn';
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16'
});

const getConfiguredStripeClient = async () => {
  const envKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!envKey || envKey.includes('example') || envKey.includes('***')) {
    return {
      client: stripe,
      config: null,
    };
  }
  return {
    client: new Stripe(envKey, { apiVersion: '2023-10-16' }),
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
      // ...existing code...
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
      // ...existing code...
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
      // ...existing code...
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
      // ...existing code...
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
      // ...existing code...
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
      // ...existing code...
      throw error;
    }
  },

  /**
   * Sum all paid subscription invoices in the platform Stripe account.
   * Paginates up to 1000 invoices to avoid unbounded API time on large accounts.
   */
  async getSubscriptionRevenue() {
    try {
      const { client } = await getConfiguredStripeClient();
      let total = 0;
      let startingAfter = null;
      let fetched = 0;
      const PAGE_LIMIT = 100;
      const MAX_INVOICES = 1000;

      while (fetched < MAX_INVOICES) {
        const params = { status: 'paid', limit: PAGE_LIMIT };
        if (startingAfter) params.starting_after = startingAfter;
        const page = await client.invoices.list(params);
        for (const inv of page.data) {
          total += inv.amount_paid || 0;
        }
        fetched += page.data.length;
        if (!page.has_more || page.data.length === 0) break;
        startingAfter = page.data[page.data.length - 1].id;
      }
      return total / 100; // Stripe stores amounts in cents
    } catch (error) {
      console.error('[stripeService] getSubscriptionRevenue error:', error.message);
      return 0;
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
      // ...existing code...
      throw error;
    }
  }
};

export default stripeService;

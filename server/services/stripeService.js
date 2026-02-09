import Stripe from 'stripe';

// Initialize Stripe with secret key from environment
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_51QqI2mFc0tLpWH2yXzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMn';
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16'
});

export const stripeService = {
  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(studioId, stripePriceId, successUrl, cancelUrl) {
    try {
      // Create a new customer or get existing one
      const session = await stripe.checkout.sessions.create({
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
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
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
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update the subscription with new price
      const updated = await stripe.subscriptions.update(subscriptionId, {
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
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.del(subscriptionId);
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
      const customer = await stripe.customers.create({
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
  verifyWebhookSignature(body, signature, webhookSecret) {
    try {
      const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      return event;
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw error;
    }
  }
};

export default stripeService;

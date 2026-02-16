import express from 'express';
import { queryRow, query } from '../mssql.js';
import stripeService from '../services/stripeService.js';
import { SUBSCRIPTION_STATUSES } from '../constants/subscriptions.js';

const router = express.Router();

/**
 * Handle Stripe webhook events
 * This endpoint should be called by Stripe when subscription events occur
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

  let event;

  try {
    event = stripeService.verifyWebhookSignature(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle different event types
  try {
    switch (event.type) {
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        await handleSubscriptionCreated(subscription);
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(subscription) {
  const studioId = subscription.metadata?.studioId;
  
  if (!studioId) {
    console.log('No studioId in subscription metadata');
    return;
  }

  try {
    const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      console.log(`Studio ${studioId} not found`);
      return;
    }

    // Update studio with subscription info
    await query(`
      UPDATE studios
      SET stripe_customer_id = $1, 
          stripe_subscription_id = $2, 
          subscription_status = $3,
          subscription_start = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [
      subscription.customer,
      subscription.id,
      SUBSCRIPTION_STATUSES.active,
      studioId
    ]);

    console.log(`Subscription created for studio ${studioId}:`, subscription.id);
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription) {
  const studioId = subscription.metadata?.studioId;
  
  if (!studioId) {
    console.log('No studioId in subscription metadata');
    return;
  }

  try {
    // Determine subscription status based on Stripe status
    let statusMap = {
      'active': SUBSCRIPTION_STATUSES.active,
      'past_due': SUBSCRIPTION_STATUSES.past_due,
      'canceled': SUBSCRIPTION_STATUSES.canceled,
      'unpaid': SUBSCRIPTION_STATUSES.past_due,
      'paused': SUBSCRIPTION_STATUSES.paused
    };

    const status = statusMap[subscription.status] || SUBSCRIPTION_STATUSES.inactive;

    // Calculate next billing date
    const nextBillingDate = new Date(subscription.current_period_end * 1000).toISOString();

    await query(`
      UPDATE studios
      SET subscription_status = $1,
          subscription_end = $2
      WHERE id = $3
    `, [status, nextBillingDate, studioId]);

    console.log(`Subscription updated for studio ${studioId}:`, subscription.id);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription) {
  const studioId = subscription.metadata?.studioId;
  
  if (!studioId) {
    console.log('No studioId in subscription metadata');
    return;
  }

  try {
    await query(`
      UPDATE studios
      SET subscription_status = $1,
          stripe_subscription_id = NULL
      WHERE id = $2
    `, [SUBSCRIPTION_STATUSES.canceled, studioId]);

    console.log(`Subscription deleted for studio ${studioId}:`, subscription.id);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  
  try {
    // Find studio with this subscription
    const studio = await queryRow(`
      SELECT id FROM studios WHERE stripe_subscription_id = $1
    `, [subscriptionId]);

    if (studio) {
      await query(`
        UPDATE studios
        SET subscription_status = $1
        WHERE id = $2
      `, [SUBSCRIPTION_STATUSES.active, studio.id]);

      console.log(`Payment succeeded for studio ${studio.id}`);
    }
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  
  try {
    // Find studio with this subscription
    const studio = await queryRow(`
      SELECT id FROM studios WHERE stripe_subscription_id = $1
    `, [subscriptionId]);

    if (studio) {
      await query(`
        UPDATE studios
        SET subscription_status = $1
        WHERE id = $2
      `, [SUBSCRIPTION_STATUSES.past_due, studio.id]);

      console.log(`Payment failed for studio ${studio.id}`);
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

export default router;

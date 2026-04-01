import express from 'express';
import crypto from 'crypto';
import mssql from '../mssql.cjs';
const { queryRow, query } = mssql;
import stripeService from '../services/stripeService.js';
import { SUBSCRIPTION_STATUSES } from '../constants/subscriptions.js';

const router = express.Router();

const stringifyForDb = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'Failed to serialize value' });
  }
};

const parseWhccSignatureHeader = (headerValue) => {
  const parts = String(headerValue || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let timestamp = null;
  const signatures = [];

  for (const part of parts) {
    const [prefix, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    if (!prefix || !value) continue;
    if (prefix === 't') timestamp = value;
    if (prefix === 'v1') signatures.push(value.toLowerCase());
  }

  return { timestamp, signatures };
};

const verifyWhccSignature = (rawBody, signatureHeader) => {
  const secret = String(process.env.WHCC_CONSUMER_SECRET || '').trim();
  if (!secret) throw new Error('WHCC_CONSUMER_SECRET is not configured');

  const { timestamp, signatures } = parseWhccSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) throw new Error('Missing WHCC signature');

  const toleranceSeconds = Number(process.env.WHCC_WEBHOOK_TOLERANCE_SECONDS || 300);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSeconds) {
    throw new Error('WHCC webhook timestamp outside tolerance');
  }

  const payloadToSign = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign, 'utf8')
    .digest('hex')
    .toLowerCase();

  const expectedBuffer = Buffer.from(expected, 'hex');
  const isValid = signatures.some((sig) => {
    try {
      const candidate = Buffer.from(sig, 'hex');
      return candidate.length === expectedBuffer.length && crypto.timingSafeEqual(candidate, expectedBuffer);
    } catch {
      return false;
    }
  });

  if (!isValid) throw new Error('Invalid WHCC webhook signature');
};

const parseWhccRequestBody = (rawBody, contentType) => {
  const trimmed = String(rawBody || '').trim();
  if (!trimmed) return {};

  if (String(contentType || '').includes('application/json')) {
    return JSON.parse(trimmed);
  }

  if (String(contentType || '').includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(trimmed).entries());
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const formLike = Object.fromEntries(new URLSearchParams(trimmed).entries());
    return Object.keys(formLike).length > 0 ? formLike : { raw: trimmed };
  }
};

const getOrderIdFromWhccReference = (reference) => {
  const match = String(reference || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
};

const normalizeWhccShipDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const resolveWebhookStudioId = (req, payload, matchedOrder) => {
  const fromQuery = Number(req.query?.studioId);
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  if (matchedOrder?.studioId) return Number(matchedOrder.studioId);
  const fromReference = getOrderIdFromWhccReference(payload?.Reference);
  if (matchedOrder?.id && fromReference === matchedOrder.id) return Number(matchedOrder.studioId) || null;
  return null;
};

async function upsertWhccWebhookConfig(studioId, updates = {}) {
  if (!studioId) return;

  await query(
    `IF NOT EXISTS (SELECT 1 FROM whcc_webhook_config WHERE studio_id = $1)
     BEGIN
       INSERT INTO whcc_webhook_config (studio_id, created_at, updated_at)
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     END`,
    [studioId]
  );

  await query(
    `UPDATE whcc_webhook_config
     SET callback_uri = COALESCE($1, callback_uri),
         last_verifier = COALESCE($2, last_verifier),
         verified_at = COALESCE($3, verified_at),
         last_registration_response = COALESCE($4, last_registration_response),
         last_verification_response = COALESCE($5, last_verification_response),
         last_payload = COALESCE($6, last_payload),
         last_received_at = COALESCE($7, last_received_at),
         updated_at = CURRENT_TIMESTAMP
     WHERE studio_id = $8`,
    [
      updates.callbackUri ?? null,
      updates.lastVerifier ?? null,
      updates.verifiedAt ?? null,
      updates.lastRegistrationResponse ?? null,
      updates.lastVerificationResponse ?? null,
      updates.lastPayload ?? null,
      updates.lastReceivedAt ?? null,
      studioId,
    ]
  );
}

async function findOrderForWhccWebhook(payload) {
  const confirmationId = payload?.ConfirmationId || payload?.ConfirmationID || null;
  if (confirmationId) {
    const byConfirmation = await queryRow(
      'SELECT id, studio_id as studioId FROM orders WHERE whcc_confirmation_id = $1',
      [confirmationId]
    );
    if (byConfirmation?.id) return byConfirmation.id;
  }

  const orderIdFromReference = getOrderIdFromWhccReference(payload?.Reference);
  if (orderIdFromReference) {
    const byReference = await queryRow('SELECT id FROM orders WHERE id = $1', [orderIdFromReference]);
    if (byReference?.id) return byReference.id;
  }

  return null;
}

async function handleWhccWebhookPayload(payload) {
  const confirmationId = payload?.ConfirmationId || payload?.ConfirmationID || null;
  let matchedOrder = null;
  if (confirmationId) {
    matchedOrder = await queryRow(
      'SELECT id, studio_id as studioId FROM orders WHERE whcc_confirmation_id = $1',
      [confirmationId]
    );
  }
  if (!matchedOrder) {
    const orderIdFromReference = getOrderIdFromWhccReference(payload?.Reference);
    if (orderIdFromReference) {
      matchedOrder = await queryRow('SELECT id, studio_id as studioId FROM orders WHERE id = $1', [orderIdFromReference]);
    }
  }

  const studioId = resolveWebhookStudioId({ query: {} }, payload, matchedOrder);
  if (studioId) {
    await upsertWhccWebhookConfig(studioId, {
      lastPayload: stringifyForDb(payload),
      lastReceivedAt: new Date().toISOString(),
    });
  }

  if (!matchedOrder?.id) {
    console.warn('[WHCC webhook] No matching order found', payload?.ConfirmationId || payload?.Reference || payload?.OrderNumber || 'unknown');
    return;
  }

  const shippingInfo = Array.isArray(payload?.ShippingInfo) ? payload.ShippingInfo[0] : null;
  const isShippedEvent = String(payload?.Event || '').toLowerCase() === 'shipped';
  const isAcceptedStatus = String(payload?.Status || '').toLowerCase() === 'accepted';
  const errorsJson = Array.isArray(payload?.Errors) && payload.Errors.length > 0 ? payload.Errors : null;

  await query(
    `UPDATE orders
     SET whcc_confirmation_id = COALESCE($1, whcc_confirmation_id),
         whcc_order_number = COALESCE($2, whcc_order_number),
         whcc_webhook_status = COALESCE($3, whcc_webhook_status),
         whcc_webhook_event = COALESCE($4, whcc_webhook_event),
         whcc_webhook_payload = $5,
         whcc_webhook_received_at = CURRENT_TIMESTAMP,
         whcc_last_error = CASE WHEN $6 IS NOT NULL THEN $6 WHEN $3 = 'Accepted' THEN NULL ELSE whcc_last_error END,
         shipping_carrier = COALESCE($7, shipping_carrier),
         tracking_number = COALESCE($8, tracking_number),
         tracking_url = COALESCE($9, tracking_url),
         shipped_at = COALESCE($10, shipped_at),
         lab_submitted = CASE WHEN $11 = 1 OR $12 = 1 THEN 1 ELSE lab_submitted END,
         lab_submitted_at = CASE WHEN ($11 = 1 OR $12 = 1) AND lab_submitted_at IS NULL THEN CURRENT_TIMESTAMP ELSE lab_submitted_at END,
         status = CASE
           WHEN $11 = 1 THEN 'shipped'
           WHEN $12 = 1 AND status = 'pending' THEN 'processing'
           ELSE status
         END
     WHERE id = $13`,
    [
      payload?.ConfirmationId || payload?.ConfirmationID || null,
      payload?.OrderNumber ? String(payload.OrderNumber) : null,
      payload?.Status || null,
      payload?.Event || null,
      stringifyForDb(payload),
      stringifyForDb(errorsJson),
      shippingInfo?.Carrier || null,
      shippingInfo?.TrackingNumber || null,
      shippingInfo?.TrackingUrl || null,
      normalizeWhccShipDate(shippingInfo?.ShipDate),
      isShippedEvent ? 1 : 0,
      isAcceptedStatus ? 1 : 0,
      matchedOrder.id,
    ]
  );
}

router.post('/whcc', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  const contentType = req.headers['content-type'];

  let payload;
  try {
    payload = parseWhccRequestBody(rawBody, contentType);
  } catch (error) {
    console.error('[WHCC webhook] Failed to parse request body:', error.message);
    return res.status(400).json({ error: 'Invalid WHCC webhook body' });
  }

  if (payload?.verifier) {
    console.log('[WHCC webhook] Received verifier challenge:', payload.verifier);
    const studioId = Number(req.query?.studioId);
    if (Number.isInteger(studioId) && studioId > 0) {
      await upsertWhccWebhookConfig(studioId, {
        callbackUri: typeof req.query?.callbackUri === 'string' ? req.query.callbackUri : null,
        lastVerifier: String(payload.verifier),
        lastReceivedAt: new Date().toISOString(),
      });
    }
    return res.status(200).json({ received: true, verifier: payload.verifier });
  }

  try {
    verifyWhccSignature(rawBody, req.headers['whcc-signature']);
  } catch (error) {
    console.error('[WHCC webhook] Signature verification failed:', error.message);
    return res.status(400).json({ error: error.message });
  }

  try {
    await handleWhccWebhookPayload(payload);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[WHCC webhook] Processing failed:', error);
    return res.status(500).json({ error: 'WHCC webhook processing failed' });
  }
});

/**
 * Handle Stripe webhook events
 * This endpoint should be called by Stripe when subscription events occur
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = await stripeService.verifyWebhookSignature(req.body, sig);
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

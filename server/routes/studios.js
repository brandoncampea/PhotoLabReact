import express from 'express';
import { queryRow, queryRows, query, transaction } from '../mssql.js';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from '../constants/subscriptions.js';
import { authRequired } from '../middleware/auth.js';
import stripeService from '../services/stripeService.js';

const router = express.Router();

// Create/signup new studio
router.post('/signup', async (req, res) => {
  try {
    const { studioName, studioEmail, adminEmail, adminName, adminPassword, subscriptionPlan } = req.body;

    // Validate inputs
    if (!studioName || !studioEmail || !adminEmail || !adminName || !adminPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Subscription plan is optional now
    if (subscriptionPlan && !SUBSCRIPTION_PLANS[subscriptionPlan]) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    // Check if studio email already exists
    const existingStudio = await queryRow('SELECT id FROM studios WHERE email = $1', [studioEmail]);
    if (existingStudio) {
      return res.status(409).json({ error: 'Studio email already exists' });
    }

    // Check if admin email already exists
    const existingUser = await queryRow('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Begin transaction
    const { studioId, userId } = await transaction(async (client) => {
      const studioResult = await client.query(`
        INSERT INTO studios (name, email, subscription_plan, subscription_status, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING id
      `, [studioName, studioEmail, subscriptionPlan || null, SUBSCRIPTION_STATUSES.inactive]);

      const createdStudioId = studioResult.rows[0].id;

      const userResult = await client.query(`
        INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING id
      `, [adminEmail, adminPassword, adminName, 'studio_admin', createdStudioId, 1]);

      return { studioId: createdStudioId, userId: userResult.rows[0].id };
    });

    res.status(201).json({
      message: 'Studio created successfully',
      studioId,
      userId,
      studio: {
        id: studioId,
        name: studioName,
        email: studioEmail,
        subscriptionPlan,
        subscriptionStatus: SUBSCRIPTION_STATUSES.inactive
      }
    });
  } catch (error) {
    console.error('Studio signup error:', error);
    res.status(500).json({ error: 'Failed to create studio' });
  }
});

// Get all studios (super admin only)
router.get('/', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studios = await queryRows(`
      SELECT 
        s.*,
        COUNT(DISTINCT u.id) as userCount
      FROM studios s
      LEFT JOIN users u ON u.studio_id = s.id AND u.role != 'super_admin'
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    res.json(studios);
  } catch (error) {
    console.error('Get studios error:', error);
    res.status(500).json({ error: 'Failed to fetch studios' });
  }
});

// Get studio by ID
router.get('/:studioId', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Super admin can view any studio, studio users can only view their own
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(`
      SELECT 
        s.*,
        COUNT(DISTINCT u.id) as userCount
      FROM studios s
      LEFT JOIN users u ON u.studio_id = s.id AND u.role != 'super_admin'
      WHERE s.id = $1
      GROUP BY s.id
    `, [studioId]);

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    res.json(studio);
  } catch (error) {
    console.error('Get studio error:', error);
    res.status(500).json({ error: 'Failed to fetch studio' });
  }
});

// Get subscription info
router.get('/:studioId/subscription', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Check authorization - only studio members can view their studio's subscription
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(`
      SELECT 
        id,
        name,
        subscription_plan,
        subscription_status,
        subscription_start,
        subscription_end,
        is_free_subscription,
        cancellation_requested,
        cancellation_date,
        billing_cycle
      FROM studios
      WHERE id = $1
    `, [studioId]);

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Get the plan details
    const plan = studio.subscription_plan ? SUBSCRIPTION_PLANS[studio.subscription_plan] : null;

    res.json({
      studio,
      plan
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Cancel subscription (takes effect at renewal date)
router.post('/:studioId/subscription/cancel', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Verify authorization (studio admin or super admin)
    if (req.user.role !== 'studio_admin' || req.user.studio_id !== parseInt(studioId)) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const studio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    if (studio.subscription_status !== 'active') {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    if (studio.cancellation_requested) {
      return res.status(400).json({ error: 'Cancellation already requested' });
    }

    // Mark for cancellation at end of billing period
    await query(`
      UPDATE studios
      SET cancellation_requested = $1, cancellation_date = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [1, studioId]);

    // If using Stripe, cancel at period end
    if (studio.stripe_subscription_id) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.update(studio.stripe_subscription_id, {
          cancel_at_period_end: true
        });
      } catch (stripeError) {
        console.error('Stripe cancellation error:', stripeError);
        // Continue anyway - we've marked it in our DB
      }
    }

    const updated = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    res.json({
      message: 'Subscription will be cancelled at the end of your billing period',
      studio: updated,
      cancelsOn: studio.subscription_end
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Reactivate cancelled subscription (undo cancellation)
router.post('/:studioId/subscription/reactivate', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Verify authorization
    if (req.user.role !== 'studio_admin' || req.user.studio_id !== parseInt(studioId)) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const studio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    if (!studio.cancellation_requested) {
      return res.status(400).json({ error: 'No cancellation to undo' });
    }

    // Remove cancellation flag
    await query(`
      UPDATE studios
      SET cancellation_requested = $1, cancellation_date = NULL
      WHERE id = $2
    `, [0, studioId]);

    // If using Stripe, update subscription
    if (studio.stripe_subscription_id) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.update(studio.stripe_subscription_id, {
          cancel_at_period_end: false
        });
      } catch (stripeError) {
        console.error('Stripe reactivation error:', stripeError);
      }
    }

    const updated = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    res.json({
      message: 'Subscription reactivated successfully',
      studio: updated
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// Update studio subscription
router.patch('/:studioId/subscription', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const { subscriptionPlan, subscriptionStatus, stripeCustomerId, stripeSubscriptionId, billingCycle, isFreeSubscription } = req.body;

    // Only super admin can update subscriptions
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (subscriptionPlan && !SUBSCRIPTION_PLANS[subscriptionPlan]) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    const updateData = {};
    if (subscriptionPlan) updateData.subscription_plan = subscriptionPlan;
    if (subscriptionStatus) updateData.subscription_status = subscriptionStatus;
    if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId;
    if (stripeSubscriptionId) updateData.stripe_subscription_id = stripeSubscriptionId;
    if (billingCycle) updateData.billing_cycle = billingCycle;
    if (isFreeSubscription !== undefined) updateData.is_free_subscription = !!isFreeSubscription;
    
    // If activating subscription, clear any pending cancellation
    if (subscriptionStatus === 'active') {
      updateData.cancellation_requested = 0;
      updateData.cancellation_date = null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updateKeys = Object.keys(updateData);
    const setClauses = updateKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = updateKeys.map(key => updateData[key]);
    values.push(studioId);

    await query(`
      UPDATE studios
      SET ${setClauses}
      WHERE id = $${values.length}
    `, values);

    const updatedStudio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    res.json(updatedStudio);
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Get subscription plans (public)
router.get('/plans/list', (req, res) => {
  res.json(SUBSCRIPTION_PLANS);
});

// Get studio fees
router.get('/:studioId/fees', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(`
      SELECT id, name, fee_type, fee_value
      FROM studios
      WHERE id = $1
    `, [studioId]);

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    res.json({
      studioId: studio.id,
      studioName: studio.name,
      feeType: studio.fee_type || 'percentage',
      feeValue: studio.fee_value || 0
    });
  } catch (error) {
    console.error('Error fetching studio fees:', error);
    res.status(500).json({ error: 'Failed to fetch fees' });
  }
});

// Update studio fees (super admin only)
router.put('/:studioId/fees', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const { feeType, feeValue } = req.body;

    // Verify super admin role
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can set studio fees' });
    }

    // Validate input
    if (!feeType || !['percentage', 'fixed'].includes(feeType)) {
      return res.status(400).json({ error: 'Invalid feeType. Must be "percentage" or "fixed"' });
    }

    if (typeof feeValue !== 'number' || feeValue < 0) {
      return res.status(400).json({ error: 'feeValue must be a non-negative number' });
    }

    if (feeType === 'percentage' && feeValue > 100) {
      return res.status(400).json({ error: 'Percentage fee cannot exceed 100%' });
    }

    // Check studio exists
    const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Update fees
    await query(`
      UPDATE studios
      SET fee_type = $1, fee_value = $2
      WHERE id = $3
    `, [feeType, feeValue, studioId]);

    const updated = await queryRow(`
      SELECT id, name, fee_type, fee_value
      FROM studios
      WHERE id = $1
    `, [studioId]);

    res.json({
      message: 'Studio fees updated successfully',
      studio: {
        studioId: updated.id,
        studioName: updated.name,
        feeType: updated.fee_type,
        feeValue: updated.fee_value
      }
    });
  } catch (error) {
    console.error('Error updating studio fees:', error);
    res.status(500).json({ error: 'Failed to update fees' });
  }
});

// Create Stripe checkout session
router.post('/:studioId/checkout', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const { planId, billingCycle = 'monthly' } = req.body;

    // Verify authorization
    if (req.user.role !== 'studio_admin' || req.user.studio_id !== parseInt(studioId)) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Validate plan
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Get studio
    const studio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Update billing cycle in studio record
    await query('UPDATE studios SET billing_cycle = $1 WHERE id = $2', [billingCycle, studioId]);

    // Build success and cancel URLs
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const successUrl = `${baseUrl}/admin/dashboard?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/admin/dashboard`;

    // Use yearly or monthly price ID based on billing cycle
    const priceId = billingCycle === 'yearly' ? plan.stripeYearlyPriceId : plan.stripePriceId;

    // Create Stripe checkout session
    const session = await stripeService.createCheckoutSession(
      studioId,
      priceId,
      successUrl,
      cancelUrl
    );

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

export default router;

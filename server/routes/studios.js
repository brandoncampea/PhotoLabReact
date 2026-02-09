import express from 'express';
import { db } from '../database.js';
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
    const existingStudio = db.prepare('SELECT id FROM studios WHERE email = ?').get(studioEmail);
    if (existingStudio) {
      return res.status(409).json({ error: 'Studio email already exists' });
    }

    // Check if admin email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Begin transaction
    const insert = db.transaction(() => {
      // Create studio with inactive status (no plan = inactive)
      const studioResult = db.prepare(`
        INSERT INTO studios (name, email, subscription_plan, subscription_status, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(studioName, studioEmail, subscriptionPlan || null, SUBSCRIPTION_STATUSES.inactive);

      const studioId = studioResult.lastInsertRowid;

      // Create admin user for studio
      const userResult = db.prepare(`
        INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
      `).run(adminEmail, adminPassword, adminName, 'studio_admin', studioId);

      return { studioId, userId: userResult.lastInsertRowid };
    });

    const { studioId, userId } = insert();

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
router.get('/', authRequired, (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studios = db.prepare(`
      SELECT 
        s.*,
        COUNT(DISTINCT u.id) as userCount
      FROM studios s
      LEFT JOIN users u ON u.studio_id = s.id AND u.role != 'super_admin'
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all();

    res.json(studios);
  } catch (error) {
    console.error('Get studios error:', error);
    res.status(500).json({ error: 'Failed to fetch studios' });
  }
});

// Get studio by ID
router.get('/:studioId', authRequired, (req, res) => {
  try {
    const { studioId } = req.params;

    // Super admin can view any studio, studio users can only view their own
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = db.prepare(`
      SELECT 
        s.*,
        COUNT(DISTINCT u.id) as userCount
      FROM studios s
      LEFT JOIN users u ON u.studio_id = s.id AND u.role != 'super_admin'
      WHERE s.id = ?
      GROUP BY s.id
    `).get(studioId);

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
router.get('/:studioId/subscription', authRequired, (req, res) => {
  try {
    const { studioId } = req.params;

    // Check authorization - only studio members can view their studio's subscription
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = db.prepare(`
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
      WHERE id = ?
    `).get(studioId);

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

    const studio = db.prepare('SELECT * FROM studios WHERE id = ?').get(studioId);
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
    db.prepare(`
      UPDATE studios
      SET cancellation_requested = 1, cancellation_date = datetime('now')
      WHERE id = ?
    `).run(studioId);

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

    const updated = db.prepare('SELECT * FROM studios WHERE id = ?').get(studioId);
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

    const studio = db.prepare('SELECT * FROM studios WHERE id = ?').get(studioId);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    if (!studio.cancellation_requested) {
      return res.status(400).json({ error: 'No cancellation to undo' });
    }

    // Remove cancellation flag
    db.prepare(`
      UPDATE studios
      SET cancellation_requested = 0, cancellation_date = NULL
      WHERE id = ?
    `).run(studioId);

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

    const updated = db.prepare('SELECT * FROM studios WHERE id = ?').get(studioId);
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
    if (isFreeSubscription !== undefined) updateData.is_free_subscription = isFreeSubscription ? 1 : 0;
    
    // If activating subscription, clear any pending cancellation
    if (subscriptionStatus === 'active') {
      updateData.cancellation_requested = 0;
      updateData.cancellation_date = null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClauses = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updateData);

    db.prepare(`
      UPDATE studios
      SET ${setClauses}
      WHERE id = ?
    `).run(...values, studioId);

    const updatedStudio = db.prepare('SELECT * FROM studios WHERE id = ?').get(studioId);
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
router.get('/:studioId/fees', authRequired, (req, res) => {
  try {
    const { studioId } = req.params;

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = db.prepare(`
      SELECT id, name, fee_type, fee_value
      FROM studios
      WHERE id = ?
    `).get(studioId);

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
router.put('/:studioId/fees', authRequired, (req, res) => {
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
    const studio = db.prepare('SELECT id FROM studios WHERE id = ?').get(studioId);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Update fees
    db.prepare(`
      UPDATE studios
      SET fee_type = ?, fee_value = ?
      WHERE id = ?
    `).run(feeType, feeValue, studioId);

    const updated = db.prepare(`
      SELECT id, name, fee_type, fee_value
      FROM studios
      WHERE id = ?
    `).get(studioId);

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
    const studio = db.prepare('SELECT * FROM studios WHERE id = ?').get(studioId);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Update billing cycle in studio record
    db.prepare('UPDATE studios SET billing_cycle = ? WHERE id = ?').run(billingCycle, studioId);

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

import express from 'express';
import { queryRow, queryRows, query, columnExists, tableExists } from '../mssql.mjs';
import { authRequired } from '../middleware/auth.js';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions.js';

const router = express.Router();

const parseFeatures = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getFallbackPlansFromConstants = () =>
  Object.values(SUBSCRIPTION_PLANS)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: null,
      monthly_price: Number(plan.monthlyPrice) || 0,
      yearly_price: null,
      max_albums: plan.maxAlbums ?? null,
      max_storage_gb: plan.maxStorageGb ?? null,
      features: Array.isArray(plan.features) ? plan.features : [],
      stripe_monthly_price_id: plan.stripePriceId || null,
      stripe_yearly_price_id: null,
      is_active: true,
    }))
    .sort((a, b) => (Number(a.monthly_price) || 0) - (Number(b.monthly_price) || 0));

const ensureStripePriceColumns = async () => {
  await query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('subscription_plans') AND name = 'stripe_monthly_price_id'
    )
    BEGIN
      ALTER TABLE subscription_plans ADD stripe_monthly_price_id NVARCHAR(255)
    END
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('subscription_plans') AND name = 'stripe_yearly_price_id'
    )
    BEGIN
      ALTER TABLE subscription_plans ADD stripe_yearly_price_id NVARCHAR(255)
    END
  `);
};

const getPlanSelectClause = async () => {
  const hasDescription = await columnExists('subscription_plans', 'description');
  const hasYearlyPrice = await columnExists('subscription_plans', 'yearly_price');
  const hasMaxAlbums = await columnExists('subscription_plans', 'max_albums');
  const hasMaxStorage = await columnExists('subscription_plans', 'max_storage_gb');
  const hasFeatures = await columnExists('subscription_plans', 'features');
  const hasMonthlyPriceId = await columnExists('subscription_plans', 'stripe_monthly_price_id');
  const hasYearlyPriceId = await columnExists('subscription_plans', 'stripe_yearly_price_id');
  const hasIsActive = await columnExists('subscription_plans', 'is_active');

  return [
    'id',
    'name',
    hasDescription ? 'description' : 'CAST(NULL AS NVARCHAR(MAX)) as description',
    'monthly_price',
    hasYearlyPrice ? 'yearly_price' : 'CAST(NULL AS FLOAT) as yearly_price',
    hasMaxAlbums ? 'max_albums' : 'CAST(NULL AS INT) as max_albums',
    hasMaxStorage ? 'max_storage_gb' : 'CAST(NULL AS INT) as max_storage_gb',
    hasFeatures ? 'features' : 'CAST(NULL AS NVARCHAR(MAX)) as features',
    hasMonthlyPriceId ? 'stripe_monthly_price_id' : 'CAST(NULL AS NVARCHAR(255)) as stripe_monthly_price_id',
    hasYearlyPriceId ? 'stripe_yearly_price_id' : 'CAST(NULL AS NVARCHAR(255)) as stripe_yearly_price_id',
    hasIsActive ? 'is_active' : 'CAST(1 AS BIT) as is_active',
  ].join(', ');
};

// Get all subscription plans with current pricing
router.get('/', async (req, res) => {
  try {
    const hasPlansTable = await tableExists('subscription_plans');
    if (!hasPlansTable) {
      return res.json(getFallbackPlansFromConstants());
    }

    const selectClause = await getPlanSelectClause();
    const plans = await queryRows(`
      SELECT ${selectClause}
      FROM subscription_plans
      ORDER BY monthly_price ASC
    `);

    const plansWithFeatures = plans.map(plan => ({
      ...plan,
      features: parseFeatures(plan.features)
    }));

    res.json(plansWithFeatures);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// Get plan by ID
router.get('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const hasPlansTable = await tableExists('subscription_plans');
    if (!hasPlansTable) {
      const fallback = getFallbackPlansFromConstants().find((p) => String(p.id) === String(planId));
      if (!fallback) {
        return res.status(404).json({ error: 'Plan not found' });
      }
      return res.json(fallback);
    }

    const selectClause = await getPlanSelectClause();
    const plan = await queryRow(`
      SELECT ${selectClause}
      FROM subscription_plans
      WHERE id = $1
    `, [planId]);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json({
      ...plan,
      features: parseFeatures(plan.features)
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

// Create subscription plan (super admin only)
router.post('/', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can create plans' });
    }

    const {
      name,
      description,
      monthly_price,
      yearly_price,
      max_albums,
      max_storage_gb,
      features,
      stripe_monthly_price_id,
      stripe_yearly_price_id,
      is_active,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Plan name is required' });
    }

    if (typeof monthly_price !== 'number' || Number.isNaN(monthly_price) || monthly_price < 0) {
      return res.status(400).json({ error: 'monthly_price must be a non-negative number' });
    }

    if (yearly_price !== undefined && (typeof yearly_price !== 'number' || Number.isNaN(yearly_price) || yearly_price < 0)) {
      return res.status(400).json({ error: 'yearly_price must be a non-negative number' });
    }

    if (max_albums !== undefined && (!Number.isInteger(max_albums) || max_albums < 0)) {
      return res.status(400).json({ error: 'max_albums must be a non-negative integer' });
    }

    if (max_storage_gb !== undefined && (!Number.isInteger(max_storage_gb) || max_storage_gb < 0)) {
      return res.status(400).json({ error: 'max_storage_gb must be a non-negative integer' });
    }

    if (features !== undefined && !Array.isArray(features)) {
      return res.status(400).json({ error: 'features must be an array' });
    }

    const existing = await queryRow('SELECT id FROM subscription_plans WHERE LOWER(name) = LOWER($1)', [String(name).trim()]);
    if (existing) {
      return res.status(409).json({ error: 'A subscription level with this name already exists' });
    }

    const inserted = await queryRow(
      `INSERT INTO subscription_plans
         (name, description, monthly_price, yearly_price, max_albums, max_storage_gb, features,
          stripe_monthly_price_id, stripe_yearly_price_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        String(name).trim(),
        description || null,
        monthly_price,
        yearly_price ?? null,
        max_albums ?? null,
        max_storage_gb ?? null,
        JSON.stringify(Array.isArray(features) ? features : []),
        stripe_monthly_price_id || null,
        stripe_yearly_price_id || null,
        is_active === undefined ? true : !!is_active,
      ]
    );

    const selectClause = await getPlanSelectClause();
    const plan = await queryRow(
      `SELECT ${selectClause}
       FROM subscription_plans
       WHERE id = $1`,
      [inserted.id]
    );

    res.status(201).json({
      message: 'Plan created successfully',
      plan: {
        ...plan,
        features: parseFeatures(plan.features),
      },
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

// Get Stripe product mapping for all subscription plans
router.get('/stripe-products', async (req, res) => {
  try {
    console.log('[stripe-products] Endpoint hit');
    const hasPlansTable = await tableExists('subscription_plans');
    console.log('[stripe-products] hasPlansTable:', hasPlansTable);
    let plans;
    if (hasPlansTable) {
      const selectClause = await getPlanSelectClause();
      console.log('[stripe-products] selectClause:', selectClause);
      try {
        plans = await queryRows(`
          SELECT ${selectClause}
          FROM subscription_plans
          ORDER BY monthly_price ASC
        `);
        console.log('[stripe-products] subscription_plans table exists. Plans:', plans);
      } catch (queryError) {
        console.error('[stripe-products] Query error:', queryError);
        throw queryError;
      }
    } else {
      plans = getFallbackPlansFromConstants();
      console.log('[stripe-products] subscription_plans table missing. Using fallback:', plans);
    }

    // Map to only id, name, and Stripe price IDs
    const mapped = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      stripe_monthly_price_id: plan.stripe_monthly_price_id || plan.stripePriceId || null,
      stripe_yearly_price_id: plan.stripe_yearly_price_id || null
    }));
    console.log('[stripe-products] mapped output:', mapped);
    res.json(mapped);
  } catch (error) {
    console.error('[stripe-products] Error fetching Stripe product mapping:', error);
    if (error && error.stack) {
      console.error('[stripe-products] Error stack:', error.stack);
    }
    res.status(500).json({ error: 'Failed to fetch Stripe product mapping', details: error?.message || error });
  }
});

// Update subscription plan pricing (super admin only)
router.patch('/:planId', authRequired, async (req, res) => {
  try {
    const { planId } = req.params;
    const { monthly_price, yearly_price, description, features, is_active,
            stripe_monthly_price_id, stripe_yearly_price_id } = req.body;

    // Verify super admin role
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can update pricing' });
    }

    // Validate monthly_price
    if (monthly_price !== undefined && typeof monthly_price !== 'number') {
      return res.status(400).json({ error: 'monthly_price must be a number' });
    }

    if (monthly_price !== undefined && monthly_price < 0) {
      return res.status(400).json({ error: 'monthly_price cannot be negative' });
    }

    // Validate yearly_price
    if (yearly_price !== undefined && typeof yearly_price !== 'number') {
      return res.status(400).json({ error: 'yearly_price must be a number' });
    }

    if (yearly_price !== undefined && yearly_price < 0) {
      return res.status(400).json({ error: 'yearly_price cannot be negative' });
    }

    // Check plan exists
    const plan = await queryRow('SELECT id FROM subscription_plans WHERE id = $1', [planId]);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (stripe_monthly_price_id !== undefined || stripe_yearly_price_id !== undefined) {
      await ensureStripePriceColumns();
    }

    const updateFields = [];
    const updateValues = [];

    if (monthly_price !== undefined) {
      updateFields.push('monthly_price = $' + (updateFields.length + 1));
      updateValues.push(monthly_price);
    }

    const hasYearlyPrice = await columnExists('subscription_plans', 'yearly_price');
    const hasDescription = await columnExists('subscription_plans', 'description');
    const hasFeatures = await columnExists('subscription_plans', 'features');
    const hasIsActive = await columnExists('subscription_plans', 'is_active');
    const hasStripeMonthlyPrice = await columnExists('subscription_plans', 'stripe_monthly_price_id');
    const hasStripeYearlyPrice = await columnExists('subscription_plans', 'stripe_yearly_price_id');

    if (yearly_price !== undefined && hasYearlyPrice) {
      updateFields.push('yearly_price = $' + (updateFields.length + 1));
      updateValues.push(yearly_price);
    }

    if (description !== undefined && hasDescription) {
      updateFields.push('description = $' + (updateFields.length + 1));
      updateValues.push(description);
    }

    if (features !== undefined && hasFeatures) {
      if (!Array.isArray(features)) {
        return res.status(400).json({ error: 'features must be an array' });
      }
      updateFields.push('features = $' + (updateFields.length + 1));
      updateValues.push(JSON.stringify(features));
    }

    if (is_active !== undefined && hasIsActive) {
      updateFields.push('is_active = $' + (updateFields.length + 1));
      updateValues.push(!!is_active);
    }

    if (stripe_monthly_price_id !== undefined && hasStripeMonthlyPrice) {
      updateFields.push('stripe_monthly_price_id = $' + (updateFields.length + 1));
      updateValues.push(stripe_monthly_price_id || null);
    }

    if (stripe_yearly_price_id !== undefined && hasStripeYearlyPrice) {
      updateFields.push('stripe_yearly_price_id = $' + (updateFields.length + 1));
      updateValues.push(stripe_yearly_price_id || null);
    }

    if (updateFields.length === 0) {
      const selectClause = await getPlanSelectClause();
      const existingPlan = await queryRow(`
        SELECT ${selectClause}
        FROM subscription_plans
        WHERE id = $1
      `, [planId]);

      return res.json({
        message: 'No compatible fields to update on current schema',
        plan: {
          ...existingPlan,
          features: parseFeatures(existingPlan?.features),
        },
      });
    }

    updateValues.push(planId);

    await query(`
      UPDATE subscription_plans
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length}
    `, updateValues);

    const selectClause = await getPlanSelectClause();
    const updatedPlan = await queryRow(`
      SELECT ${selectClause}
      FROM subscription_plans
      WHERE id = $1
    `, [planId]);

    res.json({
      message: 'Plan updated successfully',
      plan: {
        ...updatedPlan,
        features: parseFeatures(updatedPlan.features)
      }
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

export default router;

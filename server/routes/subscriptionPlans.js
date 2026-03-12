import express from 'express';
import { queryRow, queryRows, query, columnExists } from '../mssql.js';
import { authRequired } from '../middleware/auth.js';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions.js';

const router = express.Router();

const getPlanSelectClause = async () => {
  const hasMonthlyPriceId = await columnExists('subscription_plans', 'stripe_monthly_price_id');
  const hasYearlyPriceId = await columnExists('subscription_plans', 'stripe_yearly_price_id');

  return [
    'id',
    'name',
    'description',
    'monthly_price',
    'yearly_price',
    'max_albums',
    'max_storage_gb',
    'features',
    hasMonthlyPriceId ? 'stripe_monthly_price_id' : 'CAST(NULL AS NVARCHAR(255)) as stripe_monthly_price_id',
    hasYearlyPriceId ? 'stripe_yearly_price_id' : 'CAST(NULL AS NVARCHAR(255)) as stripe_yearly_price_id',
    'is_active',
  ].join(', ');
};

// Get all subscription plans with current pricing
router.get('/', async (req, res) => {
  try {
    const selectClause = await getPlanSelectClause();
    const plans = await queryRows(`
      SELECT ${selectClause}
      FROM subscription_plans
      ORDER BY monthly_price ASC
    `);

    const plansWithFeatures = plans.map(plan => ({
      ...plan,
      features: plan.features ? JSON.parse(plan.features) : []
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
      features: plan.features ? JSON.parse(plan.features) : []
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
        features: plan.features ? JSON.parse(plan.features) : [],
      },
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ error: 'Failed to create plan' });
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

    const updateFields = [];
    const updateValues = [];

    if (monthly_price !== undefined) {
      updateFields.push('monthly_price = $' + (updateFields.length + 1));
      updateValues.push(monthly_price);
    }

    if (yearly_price !== undefined) {
      updateFields.push('yearly_price = $' + (updateFields.length + 1));
      updateValues.push(yearly_price);
    }

    if (description !== undefined) {
      updateFields.push('description = $' + (updateFields.length + 1));
      updateValues.push(description);
    }

    if (features !== undefined) {
      if (!Array.isArray(features)) {
        return res.status(400).json({ error: 'features must be an array' });
      }
      updateFields.push('features = $' + (updateFields.length + 1));
      updateValues.push(JSON.stringify(features));
    }

    if (is_active !== undefined) {
      updateFields.push('is_active = $' + (updateFields.length + 1));
      updateValues.push(!!is_active);
    }

    if (stripe_monthly_price_id !== undefined) {
      updateFields.push('stripe_monthly_price_id = $' + (updateFields.length + 1));
      updateValues.push(stripe_monthly_price_id || null);
    }

    if (stripe_yearly_price_id !== undefined) {
      updateFields.push('stripe_yearly_price_id = $' + (updateFields.length + 1));
      updateValues.push(stripe_yearly_price_id || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
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
        features: updatedPlan.features ? JSON.parse(updatedPlan.features) : []
      }
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

export default router;

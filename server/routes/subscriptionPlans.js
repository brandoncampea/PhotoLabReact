import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { authRequired } from '../middleware/auth.js';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions.js';

const router = express.Router();

// Get all subscription plans with current pricing
router.get('/', async (req, res) => {
  try {
    const plans = await queryRows(`
      SELECT id, name, description, monthly_price, max_albums, max_storage_gb, features, is_active
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
    const plan = await queryRow(`
      SELECT id, name, description, monthly_price, max_albums, max_storage_gb, features, is_active
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

// Update subscription plan pricing (super admin only)
router.patch('/:planId', authRequired, async (req, res) => {
  try {
    const { planId } = req.params;
    const { monthly_price, yearly_price, description, features, is_active } = req.body;

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

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(planId);

    await query(`
      UPDATE subscription_plans
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length}
    `, updateValues);

    const updatedPlan = await queryRow(`
      SELECT id, name, description, monthly_price, max_albums, max_storage_gb, features, is_active
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

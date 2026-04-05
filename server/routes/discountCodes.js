import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all discount codes
// Get all discount codes (studio-specific, super admin sees all)
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    let codes;
    if (user?.role === 'super_admin') {
      codes = await queryRows(`
        SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
               application_type as applicationType, expiration_date as expirationDate, 
               is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
               is_active as isActive, created_at as createdDate, studio_id as studioId
        FROM discount_codes
        ORDER BY created_at DESC
      `);
    } else {
      const studioId = user?.studio_id;
      if (!studioId) {
        return res.status(403).json({ error: 'Studio ID required' });
      }
      codes = await queryRows(`
        SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
               application_type as applicationType, expiration_date as expirationDate, 
               is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
               is_active as isActive, created_at as createdDate, studio_id as studioId
        FROM discount_codes
        WHERE studio_id = $1
        ORDER BY created_at DESC
      `, [studioId]);
    }

    // Get applicable products and usage/cost stats for each code
    const enriched = [];
    for (const code of codes) {
      const products = await queryRows(`
        SELECT product_id as productId
        FROM discount_code_products
        WHERE discount_code_id = $1
      `, [code.id]);

      // Get usage stats: total uses, total cost to studio, first/last use, order count
      const usageStats = await queryRow(`
        SELECT COUNT(*) as useCount,
               COALESCE(SUM(o.subtotal - o.total), 0) as totalCostToStudio,
               MIN(o.created_at) as firstUse,
               MAX(o.created_at) as lastUse,
               COUNT(DISTINCT o.id) as orderCount
        FROM orders o
        WHERE o.discount_code = $1
      `, [code.code]);

      enriched.push({
        ...code,
        applicableProductIds: products.map(p => p.productId),
        couponStats: {
          useCount: Number(usageStats?.useCount || 0),
          totalCostToStudio: Number(usageStats?.totalCostToStudio || 0),
          firstUse: usageStats?.firstUse,
          lastUse: usageStats?.lastUse,
          orderCount: Number(usageStats?.orderCount || 0),
        }
      });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get discount code by ID
router.get('/:id', async (req, res) => {
  try {
    const code = await queryRow(`
      SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
             application_type as applicationType, expiration_date as expirationDate, 
             is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
             is_active as isActive, created_at as createdDate
      FROM discount_codes
      WHERE id = $1
    `, [req.params.id]);

    if (!code) {
      return res.status(404).json({ error: 'Discount code not found' });
    }

    const products = await queryRows(`
      SELECT product_id as productId
      FROM discount_code_products
      WHERE discount_code_id = $1
    `, [code.id]);

    res.json({
      ...code,
      applicableProductIds: products.map(p => p.productId)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create discount code
// Create discount code (studio-specific)
router.post('/', adminRequired, async (req, res) => {
  try {
    const user = req.user;
            const { code, description, discountType, discountValue, applicationType, startDate, expirationDate, 
              isOneTimeUse, maxUsages, isActive, applicableProductIds, couponLogic, couponParams } = req.body;

    let studioId = user?.role === 'super_admin' ? (req.body.studioId || null) : user?.studio_id;
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }

    const result = await queryRow(`
      INSERT INTO discount_codes (code, description, discount_type, discount_value, application_type, 
                                  start_date, expiration_date, is_one_time_use, max_usages, is_active, studio_id, coupon_logic, coupon_params)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      code,
      description,
      discountType,
      discountValue,
      applicationType,
      startDate || null,
      expirationDate || null,
      !!isOneTimeUse,
      maxUsages || null,
      !!isActive,
      studioId,
      couponLogic || null,
      couponParams ? JSON.stringify(couponParams) : null
    ]);

    const codeId = result.id;

    // Insert applicable products
    if (applicableProductIds && applicableProductIds.length > 0) {
      for (const productId of applicableProductIds) {
        await query(`
          INSERT INTO discount_code_products (discount_code_id, product_id)
          VALUES ($1, $2)
        `, [codeId, productId]);
      }
    }

    const newCode = await queryRow(`
      SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
             application_type as applicationType, expiration_date as expirationDate, 
             is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
             is_active as isActive, created_at as createdDate, studio_id as studioId
      FROM discount_codes
      WHERE id = $1
    `, [codeId]);

    res.status(201).json({
      ...newCode,
      applicableProductIds: applicableProductIds || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update discount code
// Update discount code (studio-specific)
router.put('/:id', adminRequired, async (req, res) => {
  try {
    const user = req.user;
    const { description, discountType, discountValue, applicationType, expirationDate, 
            isOneTimeUse, maxUsages, isActive, applicableProductIds } = req.body;

    // Only allow update if code belongs to studio (unless super admin)
    let studioId = user?.role === 'super_admin' ? null : user?.studio_id;
    let code = await queryRow('SELECT * FROM discount_codes WHERE id = $1', [req.params.id]);
    if (!code) return res.status(404).json({ error: 'Discount code not found' });
    if (studioId && code.studio_id !== studioId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await query(`
      UPDATE discount_codes
      SET description = $1, discount_type = $2, discount_value = $3, application_type = $4, 
          expiration_date = $5, is_one_time_use = $6, max_usages = $7, is_active = $8
      WHERE id = $9
    `, [
      description,
      discountType,
      discountValue,
      applicationType,
      expirationDate || null,
      !!isOneTimeUse,
      maxUsages || null,
      !!isActive,
      req.params.id
    ]);

    // Update applicable products
    await query('DELETE FROM discount_code_products WHERE discount_code_id = $1', [req.params.id]);
    if (applicableProductIds && applicableProductIds.length > 0) {
      for (const productId of applicableProductIds) {
        await query(`
          INSERT INTO discount_code_products (discount_code_id, product_id)
          VALUES ($1, $2)
        `, [req.params.id, productId]);
      }
    }

    const updatedCode = await queryRow(`
      SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
             application_type as applicationType, expiration_date as expirationDate, 
             is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
             is_active as isActive, created_at as createdDate, studio_id as studioId
      FROM discount_codes
      WHERE id = $1
    `, [req.params.id]);

    res.json({
      ...updatedCode,
      applicableProductIds: applicableProductIds || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete discount code
router.delete('/:id', adminRequired, async (req, res) => {
  try {
    await query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
    res.json({ message: 'Discount code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

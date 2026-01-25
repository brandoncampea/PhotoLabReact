import express from 'express';
import { db } from '../database.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all discount codes
router.get('/', (req, res) => {
  try {
    const codes = db.prepare(`
      SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
             application_type as applicationType, expiration_date as expirationDate, 
             is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
             is_active as isActive, created_at as createdDate
      FROM discount_codes
      ORDER BY created_at DESC
    `).all();

    // Get applicable products for each code
    const enriched = [];
    for (const code of codes) {
      const products = db.prepare(`
        SELECT product_id as productId
        FROM discount_code_products
        WHERE discount_code_id = ?
      `).all(code.id);
      enriched.push({
        ...code,
        applicableProductIds: products.map(p => p.productId)
      });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get discount code by ID
router.get('/:id', (req, res) => {
  try {
    const code = db.prepare(`
      SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
             application_type as applicationType, expiration_date as expirationDate, 
             is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
             is_active as isActive, created_at as createdDate
      FROM discount_codes
      WHERE id = ?
    `).get(req.params.id);

    if (!code) {
      return res.status(404).json({ error: 'Discount code not found' });
    }

    const products = db.prepare(`
      SELECT product_id as productId
      FROM discount_code_products
      WHERE discount_code_id = ?
    `).all(code.id);

    res.json({
      ...code,
      applicableProductIds: products.map(p => p.productId)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create discount code
router.post('/', adminRequired, (req, res) => {
  try {
    const { code, description, discountType, discountValue, applicationType, expirationDate, 
            isOneTimeUse, maxUsages, isActive, applicableProductIds } = req.body;

    const result = db.prepare(`
      INSERT INTO discount_codes (code, description, discount_type, discount_value, application_type, 
                                  expiration_date, is_one_time_use, max_usages, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, description, discountType, discountValue, applicationType, 
           expirationDate || null, isOneTimeUse ? 1 : 0, maxUsages || null, isActive ? 1 : 0);

    const codeId = result.lastInsertRowid;

    // Insert applicable products
    if (applicableProductIds && applicableProductIds.length > 0) {
      for (const productId of applicableProductIds) {
        db.prepare(`
          INSERT INTO discount_code_products (discount_code_id, product_id)
          VALUES (?, ?)
        `).run(codeId, productId);
      }
    }

    const newCode = db.prepare(`
      SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
             application_type as applicationType, expiration_date as expirationDate, 
             is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
             is_active as isActive, created_at as createdDate
      FROM discount_codes
      WHERE id = ?
    `).get(codeId);

    res.status(201).json({
      ...newCode,
      applicableProductIds: applicableProductIds || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update discount code
router.put('/:id', adminRequired, (req, res) => {
  try {
    const { description, discountType, discountValue, applicationType, expirationDate, 
            isOneTimeUse, maxUsages, isActive, applicableProductIds } = req.body;

    db.prepare(`
      UPDATE discount_codes
      SET description = ?, discount_type = ?, discount_value = ?, application_type = ?, 
          expiration_date = ?, is_one_time_use = ?, max_usages = ?, is_active = ?
      WHERE id = ?
    `).run(description, discountType, discountValue, applicationType, expirationDate || null,
           isOneTimeUse ? 1 : 0, maxUsages || null, isActive ? 1 : 0, req.params.id);

    // Update applicable products
    db.prepare('DELETE FROM discount_code_products WHERE discount_code_id = ?').run(req.params.id);
    if (applicableProductIds && applicableProductIds.length > 0) {
      for (const productId of applicableProductIds) {
        db.prepare(`
          INSERT INTO discount_code_products (discount_code_id, product_id)
          VALUES (?, ?)
        `).run(req.params.id, productId);
      }
    }

    const updatedCode = db.prepare(`
      SELECT id, code, description, discount_type as discountType, discount_value as discountValue,
             application_type as applicationType, expiration_date as expirationDate, 
             is_one_time_use as isOneTimeUse, usage_count as usageCount, max_usages as maxUsages,
             is_active as isActive, created_at as createdDate
      FROM discount_codes
      WHERE id = ?
    `).get(req.params.id);

    res.json({
      ...updatedCode,
      applicableProductIds: applicableProductIds || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete discount code
router.delete('/:id', adminRequired, (req, res) => {
  try {
    db.prepare('DELETE FROM discount_codes WHERE id = ?').run(req.params.id);
    res.json({ message: 'Discount code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

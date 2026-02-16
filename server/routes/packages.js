import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

// Compatibility: GET /api/packages?priceListId=1
router.get('/', async (req, res) => {
  const priceListId = req.query.priceListId;
  if (!priceListId) {
    return res.status(400).json({ error: 'Missing priceListId parameter' });
  }
  try {
    const packages = await queryRows(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE price_list_id = $1
    `, [priceListId]);

    // Get items for each package
    const enriched = [];
    for (const pkg of packages) {
      const items = await queryRows(`
        SELECT product_id as productId, product_size_id as productSizeId, quantity
        FROM package_items
        WHERE package_id = $1
      `, [pkg.id]);
      enriched.push({ ...pkg, items });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get all packages for a price list
router.get('/pricelist/:priceListId', async (req, res) => {
  try {
    const packages = await queryRows(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE price_list_id = $1
    `, [req.params.priceListId]);

    // Get items for each package
    const enriched = [];
    for (const pkg of packages) {
      const items = await queryRows(`
        SELECT product_id as productId, product_size_id as productSizeId, quantity
        FROM package_items
        WHERE package_id = $1
      `, [pkg.id]);
      enriched.push({ ...pkg, items });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get package by ID
router.get('/:id', async (req, res) => {
  try {
    const pkg = await queryRow(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE id = $1
    `, [req.params.id]);

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    const items = await queryRows(`
      SELECT product_id as productId, product_size_id as productSizeId, quantity
      FROM package_items
      WHERE package_id = $1
    `, [pkg.id]);

    res.json({ ...pkg, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create package
router.post('/', adminRequired, async (req, res) => {
  try {
    const { priceListId, name, description, packagePrice, items, isActive } = req.body;

    const result = await queryRow(`
      INSERT INTO packages (price_list_id, name, description, package_price, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [priceListId, name, description || null, packagePrice, !!isActive]);

    const packageId = result.id;

    // Insert package items
    if (items && items.length > 0) {
      for (const item of items) {
        await query(`
          INSERT INTO package_items (package_id, product_id, product_size_id, quantity)
          VALUES ($1, $2, $3, $4)
        `, [packageId, item.productId, item.productSizeId || null, item.quantity]);
      }
    }

    const pkg = await queryRow(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE id = $1
    `, [packageId]);

    res.status(201).json({ ...pkg, items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update package
router.put('/:id', adminRequired, async (req, res) => {
  try {
    const { name, description, packagePrice, items, isActive } = req.body;

    await query(`
      UPDATE packages
      SET name = $1, description = $2, package_price = $3, is_active = $4
      WHERE id = $5
    `, [name, description || null, packagePrice, !!isActive, req.params.id]);

    // Delete existing items
    await query('DELETE FROM package_items WHERE package_id = $1', [req.params.id]);

    // Insert new items
    if (items && items.length > 0) {
      for (const item of items) {
        await query(`
          INSERT INTO package_items (package_id, product_id, product_size_id, quantity)
          VALUES ($1, $2, $3, $4)
        `, [req.params.id, item.productId, item.productSizeId || null, item.quantity]);
      }
    }

    const pkg = await queryRow(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE id = $1
    `, [req.params.id]);

    res.json({ ...pkg, items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete package
router.delete('/:id', adminRequired, async (req, res) => {
  try {
    await query('DELETE FROM packages WHERE id = $1', [req.params.id]);
    res.json({ message: 'Package deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

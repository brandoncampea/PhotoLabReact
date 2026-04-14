import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

const parseProductOptions = (options) => {
  if (!options) return {};
  try {
    return typeof options === 'string' ? JSON.parse(options) : options;
  } catch {
    return {};
  }
};

const ensureStudioAdminRole = (req, res) => {
  console.log('[DEBUG ensureStudioAdminRole] req.user:', req.user, 'x-acting-studio-id:', req.headers['x-acting-studio-id']);
  if (req.user?.role !== 'studio_admin' && req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Only studio admins or super admins can manage packages', user: req.user });
    return false;
  }
  if (!req.user?.studio_id) {
    res.status(400).json({ error: 'Studio context is required', user: req.user });
    return false;
  }
  return true;
};

const calculateItemsCost = async (priceListId, studioId, items = []) => {
  let calculatedCost = 0;

  for (const item of items) {
    const quantity = Number(item.quantity);
    const productId = Number(item.productId);
    const productSizeId = Number(item.productSizeId);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Each package item must include quantity greater than 0');
    }

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(productSizeId) || productSizeId <= 0) {
      throw new Error('Each package item must include valid productId and productSizeId');
    }

    const sizeRow = await queryRow(
      `SELECT
         p.id as productId,
         p.options,
         COALESCE(spsso.price, ps.price) as effectivePrice
       FROM product_sizes ps
       INNER JOIN products p ON p.id = ps.product_id
       INNER JOIN price_list_products plp ON plp.product_id = p.id AND plp.price_list_id = ps.price_list_id
       LEFT JOIN studio_price_list_size_overrides spsso
         ON spsso.product_size_id = ps.id
        AND spsso.price_list_id = ps.price_list_id
        AND spsso.studio_id = $4
       WHERE ps.id = $1
         AND ps.product_id = $2
         AND ps.price_list_id = $3`,
      [productSizeId, productId, priceListId, studioId]
    );

    if (!sizeRow) {
      throw new Error('One or more package items are not valid for this price list');
    }

    const options = parseProductOptions(sizeRow.options);
    const isActive = options.isActive !== undefined ? !!options.isActive : true;
    if (!isActive) {
      throw new Error('Packages can only include active products');
    }

    calculatedCost += (Number(sizeRow.effectivePrice) || 0) * quantity;
  }

  return Number(calculatedCost.toFixed(2));
};

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
    if (!ensureStudioAdminRole(req, res)) return;

    const { priceListId, name, description, packagePrice, items, isActive } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Package name is required' });
    }

    const parsedPriceListId = Number(priceListId);
    if (!Number.isInteger(parsedPriceListId) || parsedPriceListId <= 0) {
      return res.status(400).json({ error: 'Valid priceListId is required' });
    }

    const parsedPackagePrice = Number(packagePrice);
    if (!Number.isFinite(parsedPackagePrice) || parsedPackagePrice < 0) {
      return res.status(400).json({ error: 'Package price must be a non-negative number' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one package item is required' });
    }

    const calculatedCost = await calculateItemsCost(parsedPriceListId, Number(req.user.studio_id), items);

    const result = await queryRow(`
      INSERT INTO packages (price_list_id, name, description, package_price, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [parsedPriceListId, String(name).trim(), description || null, parsedPackagePrice, !!isActive]);

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

    res.status(201).json({ ...pkg, items: items || [], calculatedCost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update package
router.put('/:id', adminRequired, async (req, res) => {
  try {
    if (!ensureStudioAdminRole(req, res)) return;

    const { name, description, packagePrice, items, isActive } = req.body;

    const existing = await queryRow('SELECT id, price_list_id as priceListId FROM packages WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Package not found' });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Package name is required' });
    }

    const parsedPackagePrice = Number(packagePrice);
    if (!Number.isFinite(parsedPackagePrice) || parsedPackagePrice < 0) {
      return res.status(400).json({ error: 'Package price must be a non-negative number' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one package item is required' });
    }

    const calculatedCost = await calculateItemsCost(Number(existing.priceListId), Number(req.user.studio_id), items);

    await query(`
      UPDATE packages
      SET name = $1, description = $2, package_price = $3, is_active = $4
      WHERE id = $5
    `, [String(name).trim(), description || null, parsedPackagePrice, !!isActive, req.params.id]);

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

    res.json({ ...pkg, items: items || [], calculatedCost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete package
router.delete('/:id', adminRequired, async (req, res) => {
  try {
    if (!ensureStudioAdminRole(req, res)) return;
    await query('DELETE FROM packages WHERE id = $1', [req.params.id]);
    res.json({ message: 'Package deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

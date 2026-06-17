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

const ensurePackagesSchema = async () => {
  // Drop any FK on packages.price_list_id that references the legacy price_lists table
  const legacyFk = await queryRow(`
    SELECT fk.name FROM sys.foreign_keys fk
    INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
    WHERE fk.parent_object_id = OBJECT_ID('packages') AND rt.name = 'price_lists'
  `);
  if (legacyFk?.name) {
    await query(`ALTER TABLE packages DROP CONSTRAINT [${legacyFk.name}]`);
  }
  // Add variant_id to package_items if missing
  await query(`
    IF COL_LENGTH('package_items', 'variant_id') IS NULL
      ALTER TABLE package_items ADD variant_id INT NULL
  `);
};

const calculateItemsCost = async (priceListId, items = []) => {
  let calculatedCost = 0;
  for (const item of items) {
    const quantity = Number(item.quantity);
    const productSizeId = Number(item.productSizeId);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new Error('Each package item must include quantity greater than 0');
    if (!Number.isInteger(productSizeId) || productSizeId <= 0)
      throw new Error('Each package item must include valid productSizeId');
    const row = await queryRow(
      `SELECT spi.price FROM studio_price_list_items spi
       WHERE spi.studio_price_list_id = $1
         AND spi.product_size_id = $2
         AND spi.is_offered = 1
         AND (spi.is_deleted = 0 OR spi.is_deleted IS NULL)`,
      [priceListId, productSizeId]
    );
    if (!row) throw new Error('One or more package items are not offered in this price list');
    calculatedCost += (Number(row.price) || 0) * quantity;
  }
  return Number(calculatedCost.toFixed(2));
};

// Public: GET /api/packages/for-album/:albumId
// Resolves the effective price list (album's explicit list → studio default) and returns its packages.
router.get('/for-album/:albumId', async (req, res) => {
  try {
    const album = await queryRow(
      'SELECT id, price_list_id, studio_id FROM albums WHERE id = $1',
      [req.params.albumId]
    );
    if (!album) return res.status(404).json({ error: 'Album not found' });

    // Resolve effective studio price list — same fallback logic as the products route
    let priceList = null;
    if (album.price_list_id) {
      priceList = await queryRow(
        'SELECT TOP 1 id FROM studio_price_lists WHERE id = $1 AND studio_id = $2',
        [album.price_list_id, album.studio_id]
      );
    }
    if (!priceList?.id) {
      priceList = await queryRow(
        'SELECT TOP 1 id FROM studio_price_lists WHERE studio_id = $1 ORDER BY is_default DESC, id ASC',
        [album.studio_id]
      );
    }
    if (!priceList?.id) return res.json([]);

    const packages = await queryRows(`
      SELECT id, price_list_id as priceListId, name, description,
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE price_list_id = $1 AND is_active = 1
    `, [priceList.id]);

    const enriched = [];
    for (const pkg of packages) {
      const items = await queryRows(
        'SELECT product_id as productId, product_size_id as productSizeId, quantity, variant_id as variantId FROM package_items WHERE package_id = $1',
        [pkg.id]
      );
      enriched.push({ ...pkg, items });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
        SELECT product_id as productId, product_size_id as productSizeId, quantity, variant_id as variantId
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
        SELECT product_id as productId, product_size_id as productSizeId, quantity, variant_id as variantId
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

    await ensurePackagesSchema();
    const calculatedCost = await calculateItemsCost(parsedPriceListId, items);

    const result = await queryRow(`
      INSERT INTO packages (price_list_id, name, description, package_price, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [parsedPriceListId, String(name).trim(), description || null, parsedPackagePrice, !!isActive]);

    const packageId = result.id;

    if (items && items.length > 0) {
      for (const item of items) {
        await query(`
          INSERT INTO package_items (package_id, product_id, product_size_id, quantity, variant_id)
          VALUES ($1, $2, $3, $4, $5)
        `, [packageId, item.productId, item.productSizeId || null, item.quantity, item.variantId ?? null]);
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

    await ensurePackagesSchema();
    const calculatedCost = await calculateItemsCost(Number(existing.priceListId), items);

    await query(`
      UPDATE packages
      SET name = $1, description = $2, package_price = $3, is_active = $4
      WHERE id = $5
    `, [String(name).trim(), description || null, parsedPackagePrice, !!isActive, req.params.id]);

    await query('DELETE FROM package_items WHERE package_id = $1', [req.params.id]);

    if (items && items.length > 0) {
      for (const item of items) {
        await query(`
          INSERT INTO package_items (package_id, product_id, product_size_id, quantity, variant_id)
          VALUES ($1, $2, $3, $4, $5)
        `, [req.params.id, item.productId, item.productSizeId || null, item.quantity, item.variantId ?? null]);
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

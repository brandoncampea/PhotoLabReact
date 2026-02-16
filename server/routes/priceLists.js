import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all price lists
router.get('/', adminRequired, async (req, res) => {
  try {
    const priceLists = await queryRows(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      ORDER BY name ASC
    `);
    res.json(priceLists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price list by ID with all products and packages
router.get('/:id', adminRequired, async (req, res) => {
  try {
    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [req.params.id]);
    
    if (!priceList) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    // Get products for this price list
    const products = await queryRows(`
      SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.cost
      FROM products p
      JOIN price_list_products plp ON p.id = plp.product_id
      WHERE plp.price_list_id = $1
    `, [req.params.id]);

    // Get product sizes for this price list
    const productSizes = await queryRows(`
      SELECT id, product_id as productId, size_name as sizeName, price, cost
      FROM product_sizes
      WHERE price_list_id = $1
    `, [req.params.id]);

    // Attach sizes to each product, mapping sizeName -> name
    const productsWithSizes = products.map(product => ({
      ...product,
      sizes: productSizes
        .filter(size => size.productId === product.id)
        .map(size => ({
          ...size,
          name: size.sizeName,
          // Remove sizeName from the returned object
          // (delete after spreading, so 'name' takes precedence)
          ...(() => { const s = { ...size }; delete s.sizeName; return s; })()
        }))
    }));

    // Get packages for this price list
    const packages = await queryRows(`
      SELECT id, name, description, package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE price_list_id = $1
    `, [req.params.id]);

    // Get package items
    const packageItems = await queryRows(`
      SELECT id, package_id as packageId, product_id as productId, product_size_id as productSizeId, quantity
      FROM package_items
    `);

    priceList.products = productsWithSizes;
    // priceList.sizes = productSizes; // No longer needed by frontend
    priceList.packages = packages.map(pkg => ({
      ...pkg,
      items: packageItems.filter(item => item.packageId === pkg.id)
    }));

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create price list
router.post('/', adminRequired, async (req, res) => {
  try {
    const { name, description, isDefault } = req.body;
    
    // If isDefault is true, unset default on other price lists
    if (isDefault) {
      await query('UPDATE price_lists SET is_default = 0');
    }

    const result = await queryRow(`
      INSERT INTO price_lists (name, description, is_default)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [name, description || null, !!isDefault]);

    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [result.id]);

    res.status(201).json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update price list
router.put('/:id', adminRequired, async (req, res) => {
  try {
    const { name, description, isDefault } = req.body;

    if (isDefault) {
      await query('UPDATE price_lists SET is_default = 0');
    }

    await query(`
      UPDATE price_lists
      SET name = $1, description = $2, is_default = $3
      WHERE id = $4
    `, [name, description || null, !!isDefault, req.params.id]);

    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [req.params.id]);

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set default price list
router.post('/:id/setDefault', adminRequired, async (req, res) => {
  try {
    await query('UPDATE price_lists SET is_default = 0');
    await query('UPDATE price_lists SET is_default = 1 WHERE id = $1', [req.params.id]);

    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [req.params.id]);

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete price list
router.delete('/:id', adminRequired, async (req, res) => {
  try {
    await query('DELETE FROM price_lists WHERE id = $1', [req.params.id]);
    res.json({ message: 'Price list deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

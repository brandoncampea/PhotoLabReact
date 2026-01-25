import express from 'express';
import { db } from '../database.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all price lists
router.get('/', (req, res) => {
  try {
    const priceLists = db.prepare(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      ORDER BY name ASC
    `).all();
    res.json(priceLists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price list by ID with all products and packages
router.get('/:id', (req, res) => {
  try {
    const priceList = db.prepare(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = ?
    `).get(req.params.id);
    
    if (!priceList) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    // Get products for this price list
    const products = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.cost
      FROM products p
      JOIN price_list_products plp ON p.id = plp.product_id
      WHERE plp.price_list_id = ?
    `).all(req.params.id);

    // Get product sizes for this price list
    const productSizes = db.prepare(`
      SELECT id, product_id as productId, size_name as sizeName, price, cost
      FROM product_sizes
      WHERE price_list_id = ?
    `).all(req.params.id);

    // Get packages for this price list
    const packages = db.prepare(`
      SELECT id, name, description, package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE price_list_id = ?
    `).all(req.params.id);

    // Get package items
    const packageItems = db.prepare(`
      SELECT id, package_id as packageId, product_id as productId, product_size_id as productSizeId, quantity
      FROM package_items
    `).all();

    priceList.products = products;
    priceList.sizes = productSizes;
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
router.post('/', adminRequired, (req, res) => {
  try {
    const { name, description, isDefault } = req.body;
    
    // If isDefault is true, unset default on other price lists
    if (isDefault) {
      db.prepare('UPDATE price_lists SET is_default = 0').run();
    }

    const result = db.prepare(`
      INSERT INTO price_lists (name, description, is_default)
      VALUES (?, ?, ?)
    `).run(name, description || null, isDefault ? 1 : 0);

    const priceList = db.prepare(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update price list
router.put('/:id', adminRequired, (req, res) => {
  try {
    const { name, description, isDefault } = req.body;

    if (isDefault) {
      db.prepare('UPDATE price_lists SET is_default = 0').run();
    }

    db.prepare(`
      UPDATE price_lists
      SET name = ?, description = ?, is_default = ?
      WHERE id = ?
    `).run(name, description || null, isDefault ? 1 : 0, req.params.id);

    const priceList = db.prepare(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = ?
    `).get(req.params.id);

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set default price list
router.post('/:id/setDefault', adminRequired, (req, res) => {
  try {
    db.prepare('UPDATE price_lists SET is_default = 0').run();
    db.prepare('UPDATE price_lists SET is_default = 1 WHERE id = ?').run(req.params.id);

    const priceList = db.prepare(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = ?
    `).get(req.params.id);

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete price list
router.delete('/:id', adminRequired, (req, res) => {
  try {
    db.prepare('DELETE FROM price_lists WHERE id = ?').run(req.params.id);
    res.json({ message: 'Price list deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

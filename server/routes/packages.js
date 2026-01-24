import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get all packages for a price list
router.get('/pricelist/:priceListId', (req, res) => {
  try {
    const packages = db.prepare(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE price_list_id = ?
    `).all(req.params.priceListId);

    // Get items for each package
    const enriched = packages.map(pkg => {
      const items = db.prepare(`
        SELECT product_id as productId, product_size_id as productSizeId, quantity
        FROM package_items
        WHERE package_id = ?
      `).all(pkg.id);
      return { ...pkg, items };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get package by ID
router.get('/:id', (req, res) => {
  try {
    const pkg = db.prepare(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE id = ?
    `).get(req.params.id);

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    const items = db.prepare(`
      SELECT product_id as productId, product_size_id as productSizeId, quantity
      FROM package_items
      WHERE package_id = ?
    `).all(pkg.id);

    res.json({ ...pkg, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create package
router.post('/', (req, res) => {
  try {
    const { priceListId, name, description, packagePrice, items, isActive } = req.body;

    const result = db.prepare(`
      INSERT INTO packages (price_list_id, name, description, package_price, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(priceListId, name, description || null, packagePrice, isActive ? 1 : 0);

    const packageId = result.lastInsertRowid;

    // Insert package items
    if (items && items.length > 0) {
      const insertItem = db.prepare(`
        INSERT INTO package_items (package_id, product_id, product_size_id, quantity)
        VALUES (?, ?, ?, ?)
      `);
      items.forEach(item => {
        insertItem.run(packageId, item.productId, item.productSizeId, item.quantity);
      });
    }

    const pkg = db.prepare(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE id = ?
    `).get(packageId);

    res.status(201).json({ ...pkg, items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update package
router.put('/:id', (req, res) => {
  try {
    const { name, description, packagePrice, items, isActive } = req.body;

    db.prepare(`
      UPDATE packages
      SET name = ?, description = ?, package_price = ?, is_active = ?
      WHERE id = ?
    `).run(name, description || null, packagePrice, isActive ? 1 : 0, req.params.id);

    // Delete existing items
    db.prepare('DELETE FROM package_items WHERE package_id = ?').run(req.params.id);

    // Insert new items
    if (items && items.length > 0) {
      const insertItem = db.prepare(`
        INSERT INTO package_items (package_id, product_id, product_size_id, quantity)
        VALUES (?, ?, ?, ?)
      `);
      items.forEach(item => {
        insertItem.run(req.params.id, item.productId, item.productSizeId, item.quantity);
      });
    }

    const pkg = db.prepare(`
      SELECT id, price_list_id as priceListId, name, description, 
             package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE id = ?
    `).get(req.params.id);

    res.json({ ...pkg, items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete package
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
    res.json({ message: 'Package deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

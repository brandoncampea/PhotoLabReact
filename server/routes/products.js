import express from 'express';
import { db } from '../database.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all products
router.get('/', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
    const parsedProducts = products.map(p => ({
      ...p,
      options: p.options ? JSON.parse(p.options) : null
    }));
    res.json(parsedProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active products (fallback to all if is_active column doesn't exist)
router.get('/active', (req, res) => {
  try {
    let products = [];
    try {
      const cols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
      const hasIsActive = cols.includes('is_active');
      const query = hasIsActive
        ? 'SELECT * FROM products WHERE is_active = 1 ORDER BY category, name'
        : 'SELECT * FROM products ORDER BY category, name';
      products = db.prepare(query).all();
    } catch {
      products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
    }
    const parsedProducts = products.map(p => ({
      ...p,
      options: p.options ? JSON.parse(p.options) : null
    }));
    res.json(parsedProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
router.post('/', adminRequired, (req, res) => {
  try {
    const { name, category, price, description, options } = req.body;
    const result = db.prepare(`
      INSERT INTO products (name, category, price, description, options)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, category, price, description, options ? JSON.stringify(options) : null);
    
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

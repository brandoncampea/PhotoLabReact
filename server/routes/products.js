import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { adminRequired } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await queryRows('SELECT * FROM products ORDER BY category, name');
    const parsedProducts = products.map(p => {
      const opts = p.options ? JSON.parse(p.options) : null;
      const sizes = Array.isArray(opts?.sizes)
        ? opts.sizes.map((s, idx) => ({
            id: Number.isFinite(Number(s.id)) ? Number(s.id) : (p.id * 1000 + idx + 1),
            name: s.name,
            width: Number(s.width) || 0,
            height: Number(s.height) || 0,
            price: Number(s.price) || 0,
          }))
        : [];
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        description: p.description,
        sizes,
        isActive: opts?.isActive !== undefined ? !!opts.isActive : true,
        popularity: Number(opts?.popularity) || 0,
        isDigital: !!opts?.isDigital,
      };
    });
    res.json(parsedProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active products (fallback to all if is_active column doesn't exist)
router.get('/active', async (req, res) => {
  try {
    const products = await queryRows('SELECT * FROM products ORDER BY category, name');
    const parsedProducts = products.map(p => {
      const opts = p.options ? JSON.parse(p.options) : null;
      const sizes = Array.isArray(opts?.sizes)
        ? opts.sizes.map((s, idx) => ({
            id: Number.isFinite(Number(s.id)) ? Number(s.id) : (p.id * 1000 + idx + 1),
            name: s.name,
            width: Number(s.width) || 0,
            height: Number(s.height) || 0,
            price: Number(s.price) || 0,
          }))
        : [];
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        description: p.description,
        sizes,
        isActive: opts?.isActive !== undefined ? !!opts.isActive : true,
        popularity: Number(opts?.popularity) || 0,
        isDigital: !!opts?.isDigital,
      };
    });
    res.json(parsedProducts.filter(p => p.isActive !== false));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product (requires active subscription)
router.post('/', adminRequired, requireActiveSubscription, async (req, res) => {
  try {
    const { name, category, price, description, options } = req.body;
    const result = await queryRow(`
      INSERT INTO products (name, category, price, description, options)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [name, category, price, description, options ? JSON.stringify(options) : null]);
    
    const product = await queryRow('SELECT * FROM products WHERE id = $1', [result.id]);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

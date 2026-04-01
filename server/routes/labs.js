// Lab import and management routes
import express from 'express';
const router = express.Router();

// GET all labs


router.get('/', async (req, res) => {
  try {
    const labs = db.prepare('SELECT * FROM labs').all();
    res.json(labs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch labs' });
  }
});

// POST import products/sizes from lab (WHCC, CSV, mpix)
router.post('/import', async (req, res) => {
  // Example: expects { labId, products: [{ name, category, is_digital, description, sizes: [{ name, width, height, is_digital }] }] }
  const { labId, products } = req.body;
  if (!labId || !Array.isArray(products)) {
    return res.status(400).json({ error: 'labId and products are required' });
  }
  try {
    const insertProduct = db.prepare('INSERT INTO products (lab_id, name, category, is_digital, description) VALUES (?, ?, ?, ?, ?)');
    const insertSize = db.prepare('INSERT INTO product_sizes (product_id, name, width, height, is_digital) VALUES (?, ?, ?, ?, ?)');
    for (const prod of products) {
      insertProduct.run(labId, prod.name, prod.category, prod.is_digital ? 1 : 0, prod.description || '');
      const productId = db.prepare('SELECT id FROM products WHERE lab_id = ? AND name = ?').get(labId, prod.name)?.id;
      if (productId && Array.isArray(prod.sizes)) {
        for (const size of prod.sizes) {
          insertSize.run(productId, size.name, size.width || null, size.height || null, size.is_digital ? 1 : 0);
        }
      }
    }
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import products/sizes' });
  }
});

export default router;

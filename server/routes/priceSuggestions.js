import express from 'express';
import { fetchProductPriceSuggestions } from '../../utils/productPriceSuggest.js';

const router = express.Router();

// GET /api/price-suggestions?productName=...&sizeLabel=...
router.get('/', async (req, res) => {
  const { productName, sizeLabel } = req.query;
  if (!productName || !sizeLabel) {
    return res.status(400).json({ error: 'Missing productName or sizeLabel' });
  }
  try {
    const suggestions = await fetchProductPriceSuggestions(String(productName), String(sizeLabel));
    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

export default router;

import express from 'express';
import { fetchProductPriceSuggestions } from '../utils/productPriceSuggest.js';

const router = express.Router();

// GET /api/price-suggestions?productName=...&sizeLabel=...
router.get('/', async (req, res) => {
  const { productName, sizeLabel } = req.query;
  if (!productName || !sizeLabel) {
    return res.status(400).json({ error: 'Missing productName or sizeLabel' });
  }
  try {
    // Set a hard timeout for the whole request (10s)
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
    const suggestionsPromise = fetchProductPriceSuggestions(String(productName), String(sizeLabel));
    const suggestions = await Promise.race([suggestionsPromise, timeoutPromise]);
    res.json({ suggestions });
  } catch (e) {
    console.error('[price-suggestions] Error:', e.message);
    res.status(500).json({ error: 'Failed to fetch suggestions', details: e.message });
  }
});

export default router;

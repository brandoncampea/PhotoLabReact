import express from 'express';
import axios from 'axios';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

// Proxy for Mpix Product Catalog
router.get('/mpix/products', adminRequired, async (req, res) => {
  try {
    const apiKey = process.env.MPIX_API_KEY;
    const apiSecret = process.env.MPIX_API_SECRET;
    if (!apiKey || !apiSecret) {
      console.error('[MpixProxy] Missing API credentials:', { apiKey, apiSecret });
      return res.status(500).json({ error: 'Mpix API credentials not set' });
    }
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    try {
      const response = await axios.get('https://devapi.mpix.com/Products', {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });
      res.json(response.data);
    } catch (apiError) {
      console.error('[MpixProxy] Error calling Mpix API:', apiError?.response?.data || apiError.message, apiError.stack);
      res.status(502).json({ error: 'Failed to fetch from Mpix API', details: apiError?.response?.data || apiError.message });
    }
  } catch (error) {
    console.error('[MpixProxy] Unexpected error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';
import { calculateStripeTax } from '../stripeTax.ts';

const router = express.Router();

router.post('/calculate', async (req, res) => {
  try {
    const { lineItems, shippingAddress, currency } = req.body;
    const result = await calculateStripeTax({
      lineItems,
      shippingAddress,
      currency
    });
    res.json(result);
  } catch (error) {
    console.error('[tax.ts] Stripe Tax calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate tax with Stripe' });
  }
});

export default router;

import express from 'express';
import { calculateStripeTax } from '../stripeTax.ts';

const router = express.Router();

router.post('/calculate', async (req, res) => {
  try {
    const { items, shippingOption, shippingCost, discountAmount, feeAmount, shippingAddress } = req.body;
    const result = await calculateStripeTax({
      items,
      shippingOption,
      shippingCost,
      discountAmount,
      feeAmount,
      shippingAddress
    });
    res.json(result);
  } catch (error) {
    console.error('[tax.ts] Stripe Tax calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate tax with Stripe' });
  }
});

export default router;

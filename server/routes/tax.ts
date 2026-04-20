// server/routes/tax.ts
import express from 'express';
import { calculateStripeTax } from '../stripeTax';

const router = express.Router();

// POST /api/tax/calculate
router.post('/calculate', async (req, res) => {
  try {
    const { lineItems, shippingAddress, currency } = req.body;
    if (!Array.isArray(lineItems) || !shippingAddress) {
      return res.status(400).json({ error: 'Missing lineItems or shippingAddress' });
    }
    const calculation = await calculateStripeTax({
      lineItems,
      shippingAddress,
      currency: currency || 'usd',
    });
    res.json({
      amount_total: calculation.amount_total,
      tax_amount_exclusive: calculation.tax_amount_exclusive,
      tax_breakdown: calculation.tax_breakdown,
      calculation_id: calculation.id,
      stripe_response: calculation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Stripe Tax calculation failed' });
  }
});

export default router;

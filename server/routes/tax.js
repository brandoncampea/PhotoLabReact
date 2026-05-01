import express from 'express';
import { calculateStripeTax } from '../stripeTax.ts';

const router = express.Router();

const toSafeCents = (value) => {
  const cents = Number(value);
  return Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : 0;
};

const isAddressComplete = (address) => {
  if (!address || typeof address !== 'object') return false;
  const line1 = String(address.line1 || '').trim();
  const city = String(address.city || '').trim();
  const state = String(address.state || '').trim();
  const postal = String(address.postal_code || '').trim();
  const country = String(address.country || '').trim();
  return !!line1 && !!city && !!state && !!postal && country.length === 2;
};

router.post('/calculate', async (req, res) => {
  try {
    const { lineItems, shippingAddress, currency } = req.body;

    const normalizedLineItems = Array.isArray(lineItems)
      ? lineItems
          .map((item, idx) => ({
            amount: toSafeCents(item?.amount),
            reference: String(item?.reference || `item-${idx}`),
            tax_code: item?.tax_code ? String(item.tax_code) : undefined,
          }))
          .filter((item) => item.amount > 0)
      : [];

    if (!normalizedLineItems.length || !isAddressComplete(shippingAddress)) {
      return res.json({
        tax_amount_exclusive: 0,
        calculation_source: 'fallback',
        reason: 'insufficient_tax_inputs',
      });
    }

    const result = await calculateStripeTax({
      lineItems: normalizedLineItems,
      shippingAddress,
      currency
    });
    res.json(result);
  } catch (error) {
    console.error('[tax.ts] Stripe Tax calculation error:', error);
    res.json({
      tax_amount_exclusive: 0,
      calculation_source: 'fallback',
      reason: 'stripe_unavailable',
      details: error?.message || 'Failed to calculate tax with Stripe',
    });
  }
});

export default router;

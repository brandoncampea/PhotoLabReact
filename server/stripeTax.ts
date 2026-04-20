// server/stripeTax.ts
// Node.js/TypeScript backend utility for Stripe Tax calculation
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function calculateStripeTax({
  lineItems,
  shippingAddress,
  currency = 'usd',
}: {
  lineItems: Array<{
    amount: number; // in cents
    reference: string;
    tax_code?: string; // optional, use Stripe's preset tax code if needed
  }>;
  shippingAddress: {
    line1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  currency?: string;
}) {
  const params: Stripe.Tax.CalculationCreateParams = {
    currency,
    line_items: lineItems.map((item) => ({
      amount: item.amount,
      reference: item.reference,
      tax_code: item.tax_code,
    })),
    customer_details: {
      address: {
        line1: shippingAddress.line1,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.postal_code,
        country: shippingAddress.country,
      },
      address_source: 'shipping',
    },
  };
  const calculation = await stripe.tax.calculations.create(params);
  return calculation;
}

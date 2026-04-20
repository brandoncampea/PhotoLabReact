import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ensure .env.local is loaded regardless of working directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });
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
      tax_code: item.tax_code || 'txcd_10000000', // Default to general tangible goods
    })),
    customer_details: {
      address: {
        line1: shippingAddress.line1,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.postal_code,
        country: shippingAddress.country || 'US',
      },
      address_source: 'shipping',
    },
  };
  console.log('[stripeTax] Stripe Tax calculation payload:', JSON.stringify(params, null, 2));
  const calculation = await stripe.tax.calculations.create(params);
  return calculation;
}

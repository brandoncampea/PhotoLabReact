import Stripe from 'stripe';
import { queryRows, query, queryRow, columnExists } from './mssql.js';

const describeKey = (value) => {
  const key = String(value || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.includes('example') || key.includes('***')) return 'placeholder';
  return 'unknown';
};

const ensureStripeClient = async () => {
  const envTestKey = String(process.env.STRIPE_TEST_SECRET_KEY || '').trim();
  const envKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const key = String(envTestKey || envKey || '').trim();

  if (!key || key.includes('example') || key.includes('***')) {
    throw new Error(
      `Stripe test key is not configured. Sources: STRIPE_TEST_SECRET_KEY=${describeKey(envTestKey)}, STRIPE_SECRET_KEY=${describeKey(envKey)}.`
    );
  }

  if (!key.startsWith('sk_test_')) {
    throw new Error('Refusing to normalize Stripe fee data with a non-test Stripe key.');
  }

  return new Stripe(key, { apiVersion: '2023-10-16' });
};

const normalizeSeedPricing = async () => {
  const seedProduct = await queryRow('SELECT TOP 1 id FROM products WHERE name = $1', ['Seed Test Print']);
  if (!seedProduct?.id) {
    return { updatedSizes: 0, note: 'Seed Test Print not found' };
  }

  await query(
    `UPDATE products
     SET category = $2,
         description = $3,
         cost = $4,
         options = $5
     WHERE id = $1`,
    [seedProduct.id, 'Prints', 'Auto-created seed product', 8.0, JSON.stringify({ isActive: true })]
  );

  const sizeRows = await queryRows(
    'SELECT id FROM product_sizes WHERE product_id = $1 AND size_name = $2',
    [seedProduct.id, '8x10']
  );

  for (const row of sizeRows) {
    await query(
      `UPDATE product_sizes
       SET price = $2,
           cost = $3
       WHERE id = $1`,
      [row.id, 19.99, 8.0]
    );
  }

  return { updatedSizes: sizeRows.length, note: 'Seed 8x10 pricing normalized to price=19.99 cost=8.00' };
};

const backfillStripeFees = async () => {
  const hasPaymentIntentId = await columnExists('orders', 'payment_intent_id');
  const hasStripeFeeAmount = await columnExists('orders', 'stripe_fee_amount');
  const hasStripeChargeId = await columnExists('orders', 'stripe_charge_id');

  if (!hasPaymentIntentId || !hasStripeFeeAmount) {
    return { scanned: 0, updated: 0, skipped: 0, note: 'Missing payment/fee columns; nothing to backfill' };
  }

  const stripe = await ensureStripeClient();

  const ordersNeedingBackfill = await queryRows(
    `SELECT id, payment_intent_id as paymentIntentId
     FROM orders
     WHERE payment_intent_id IS NOT NULL
       AND payment_intent_id LIKE 'pi_%'
       AND (stripe_fee_amount IS NULL OR stripe_fee_amount = 0)
     ORDER BY id ASC`,
    []
  );

  let updated = 0;
  let skipped = 0;

  for (const order of ordersNeedingBackfill) {
    try {
      const intent = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
        expand: ['latest_charge.balance_transaction'],
      });

      const latestCharge = typeof intent.latest_charge === 'string'
        ? { id: intent.latest_charge, balance_transaction: null }
        : intent.latest_charge;

      const stripeChargeId = latestCharge?.id || null;
      const stripeFeeAmount = Number(latestCharge?.balance_transaction?.fee || 0) / 100;

      if (hasStripeChargeId) {
        await query(
          `UPDATE orders
           SET stripe_charge_id = COALESCE($2, stripe_charge_id),
               stripe_fee_amount = $3
           WHERE id = $1`,
          [order.id, stripeChargeId, stripeFeeAmount]
        );
      } else {
        await query(
          `UPDATE orders
           SET stripe_fee_amount = $2
           WHERE id = $1`,
          [order.id, stripeFeeAmount]
        );
      }

      updated += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`Skipping order ${order.id}: ${error?.message || error}`);
    }
  }

  return { scanned: ordersNeedingBackfill.length, updated, skipped, note: 'Stripe fee backfill complete' };
};

const main = async () => {
  console.log('🔧 Normalizing test commerce data...');

  const pricing = await normalizeSeedPricing();
  console.log('• Pricing:', pricing);

  const fees = await backfillStripeFees();
  console.log('• Stripe fees:', fees);

  console.log('✅ Normalization complete');
  process.exit(0);
};

main().catch((error) => {
  console.error('❌ Normalization failed:', error?.message || error);
  process.exit(1);
});

import Stripe from 'stripe';
import { queryRows, query, queryRow, columnExists, tableExists } from './mssql.js';

const STUDIO_PRICE_MARKUP_MULTIPLIER = 6; // 500% above cost
const toCurrency = (value) => Number((Number(value) || 0).toFixed(2));
const getStudioPriceFromCost = (cost) => toCurrency((Number(cost) || 0) * STUDIO_PRICE_MARKUP_MULTIPLIER);

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

  const seedCost = 8.0;
  const seedPrice = getStudioPriceFromCost(seedCost);

  await query(
    `UPDATE products
     SET category = $2,
         description = $3,
         cost = $4,
         options = $5
     WHERE id = $1`,
    [seedProduct.id, 'Prints', 'Auto-created seed product', seedCost, JSON.stringify({ isActive: true })]
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
      [row.id, seedPrice, seedCost]
    );
  }

  return {
    updatedSizes: sizeRows.length,
    note: `Seed 8x10 pricing normalized to price=${seedPrice.toFixed(2)} cost=${seedCost.toFixed(2)} (500% above cost)`,
  };
};

const normalizeSeedStudioOverridePricing = async () => {
  const hasOverridesTable = await tableExists('studio_price_list_size_overrides');
  if (!hasOverridesTable) {
    return { updated: 0, skipped: 0, note: 'studio_price_list_size_overrides table not found' };
  }

  const hasIsOffered = await columnExists('studio_price_list_size_overrides', 'is_offered');
  const seedOverrideRows = await queryRows(
    `SELECT spsso.id, ps.cost
     FROM studio_price_list_size_overrides spsso
     INNER JOIN studios s ON s.id = spsso.studio_id
     INNER JOIN product_sizes ps ON ps.id = spsso.product_size_id
     WHERE s.email LIKE 'seed-studio-%@example.com' OR s.name LIKE 'Seed Studio %'`,
    []
  );

  let updated = 0;
  let skipped = 0;

  for (const row of seedOverrideRows) {
    const cost = Number(row?.cost);
    if (!Number.isFinite(cost) || cost <= 0) {
      skipped += 1;
      continue;
    }

    const overridePrice = getStudioPriceFromCost(cost);
    if (hasIsOffered) {
      await query(
        `UPDATE studio_price_list_size_overrides
         SET price = $2,
             is_offered = 1
         WHERE id = $1`,
        [row.id, overridePrice]
      );
    } else {
      await query(
        `UPDATE studio_price_list_size_overrides
         SET price = $2
         WHERE id = $1`,
        [row.id, overridePrice]
      );
    }
    updated += 1;
  }

  return {
    updated,
    skipped,
    note: `Seed studio override pricing normalized to 500% above cost (${updated} updated, ${skipped} skipped)`,
  };
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

  const overridePricing = await normalizeSeedStudioOverridePricing();
  console.log('• Override pricing:', overridePricing);

  const fees = await backfillStripeFees();
  console.log('• Stripe fees:', fees);

  console.log('✅ Normalization complete');
  process.exit(0);
};

main().catch((error) => {
  console.error('❌ Normalization failed:', error?.message || error);
  process.exit(1);
});

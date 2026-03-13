import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import { queryRow, query, queryRows, columnExists, tableExists } from './mssql.js';
import orderReceiptService from './services/orderReceiptService.js';

const TEST_PASSWORD = 'Test1234!';
const STUDIO_COUNT = 2;
const ALBUMS_PER_STUDIO = 2;
const PHOTOS_PER_ALBUM = 6;
const ORDERS_PER_STUDIO = 3;
const DEFAULT_RECEIPT_EMAIL = 'bcampea@gmail.com';

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const describeKey = (value) => {
  const key = String(value || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.includes('example') || key.includes('***')) return 'placeholder';
  return 'unknown';
};

const getSeedSubscriptionPlans = async () => {
  const hasPlansTable = await tableExists('subscription_plans');
  if (!hasPlansTable) {
    return ['professional'];
  }

  const hasIsActive = await columnExists('subscription_plans', 'is_active');
  const hasMonthlyPrice = await columnExists('subscription_plans', 'monthly_price');

  const plans = await queryRows(
    `SELECT name
     FROM subscription_plans
     ${hasIsActive ? 'WHERE is_active = 1' : ''}
     ORDER BY ${hasMonthlyPrice ? 'monthly_price ASC,' : ''} name ASC`,
    []
  );

  const names = plans
    .map((plan) => String(plan.name || '').trim())
    .filter(Boolean);

  return names.length ? names : ['professional'];
};

const ensureStripeClient = async () => {
  const config = await queryRow('SELECT TOP 1 secret_key as secretKey, is_active as isActive FROM stripe_config WHERE id = 1');
  const envTestKey = String(process.env.STRIPE_TEST_SECRET_KEY || '').trim();
  const configKey = String(config?.secretKey || '').trim();
  const envKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const key = String(envTestKey || configKey || envKey || '').trim();

  if (!key || key.includes('example') || key.includes('***')) {
    throw new Error(`Stripe test key is not configured. Sources: STRIPE_TEST_SECRET_KEY=${describeKey(envTestKey)}, stripe_config.secret_key=${describeKey(configKey)}, STRIPE_SECRET_KEY=${describeKey(envKey)}.`);
  }

  if (!key.startsWith('sk_test_')) {
    throw new Error(`Refusing to run seed purchases with a non-test Stripe key. Sources: STRIPE_TEST_SECRET_KEY=${describeKey(envTestKey)}, stripe_config.secret_key=${describeKey(configKey)}, STRIPE_SECRET_KEY=${describeKey(envKey)}.`);
  }

  if (!config?.isActive) {
    console.warn('⚠ stripe_config.is_active is false; script will still create test PaymentIntents directly via Stripe API.');
  }

  return new Stripe(key, { apiVersion: '2023-10-16' });
};

const ensureDefaultPriceList = async () => {
  let row = await queryRow('SELECT TOP 1 id FROM price_lists WHERE is_default = 1 ORDER BY id');
  if (row?.id) return Number(row.id);

  row = await queryRow('SELECT TOP 1 id FROM price_lists ORDER BY id');
  if (row?.id) return Number(row.id);

  const inserted = await queryRow(
    `INSERT INTO price_lists (name, description, is_default, created_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     RETURNING id`,
    ['Default Price List', 'Auto-created by seedTestCommerce', 1]
  );
  return Number(inserted.id);
};

const ensureSeedProductAndSize = async (priceListId) => {
  let product = await queryRow('SELECT TOP 1 id FROM products WHERE name = $1', ['Seed Test Print']);
  if (!product) {
    product = await queryRow(
      `INSERT INTO products (name, category, price, description, cost, options)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Seed Test Print', 'Prints', 0, 'Auto-created seed product', 8.0, JSON.stringify({ isActive: true })]
    );
  } else {
    await query(
      `UPDATE products
       SET category = $2,
           description = $3,
           cost = $4,
           options = $5
       WHERE id = $1`,
      [product.id, 'Prints', 'Auto-created seed product', 8.0, JSON.stringify({ isActive: true })]
    );
  }

  let size = await queryRow(
    'SELECT TOP 1 id, price FROM product_sizes WHERE price_list_id = $1 AND product_id = $2 AND size_name = $3',
    [priceListId, product.id, '8x10']
  );

  if (!size) {
    size = await queryRow(
      `INSERT INTO product_sizes (price_list_id, product_id, size_name, price, cost)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [priceListId, product.id, '8x10', 19.99, 8.0]
    );
  } else {
    await query(
      `UPDATE product_sizes
       SET price = $2,
           cost = $3
       WHERE id = $1`,
      [size.id, 19.99, 8.0]
    );
  }

  const latest = await queryRow('SELECT id, price FROM product_sizes WHERE id = $1', [size.id]);

  return {
    productId: Number(product.id),
    productSizeId: Number(size.id),
    unitPrice: Number(latest?.price || 19.99),
  };
};

const ensureStudio = async (index, subscriptionPlan) => {
  const email = `seed-studio-${index}@example.com`;
  const name = `Seed Studio ${index}`;

  let studio = await queryRow('SELECT TOP 1 id FROM studios WHERE email = $1', [email]);
  if (!studio) {
    studio = await queryRow(
      `INSERT INTO studios (name, email, subscription_plan, subscription_status, subscription_start, subscription_end, is_free_subscription, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, DATEADD(month, 1, CURRENT_TIMESTAMP), $5, CURRENT_TIMESTAMP)
       RETURNING id`,
      [name, email, subscriptionPlan, 'active', 0]
    );
  } else {
    await query(
      `UPDATE studios
       SET subscription_status = 'active',
           is_free_subscription = 0,
           subscription_plan = $2,
           billing_cycle = COALESCE(billing_cycle, 'monthly')
       WHERE id = $1`,
      [studio.id, subscriptionPlan]
    );
  }

  return { id: Number(studio.id), email, name, subscriptionPlan };
};

const ensureUser = async ({ email, name, role, studioId }) => {
  let user = await queryRow('SELECT TOP 1 id FROM users WHERE email = $1', [email]);
  if (!user) {
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    user = await queryRow(
      `INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
       RETURNING id`,
      [email, hash, name, role, studioId || null]
    );
  } else {
    await query(
      `UPDATE users
       SET role = $1,
           studio_id = $2,
           is_active = 1
       WHERE id = $3`,
      [role, studioId || null, user.id]
    );
  }
  return Number(user.id);
};

const ensureAlbumsAndPhotos = async (studioId, priceListId, studioIndex) => {
  const photoIds = [];

  for (let a = 1; a <= ALBUMS_PER_STUDIO; a += 1) {
    const albumName = `Seed Studio ${studioIndex} Album ${a}`;
    let album = await queryRow(
      'SELECT TOP 1 id FROM albums WHERE studio_id = $1 AND name = $2',
      [studioId, albumName]
    );

    if (!album) {
      album = await queryRow(
        `INSERT INTO albums (name, title, description, studio_id, cover_image_url, photo_count, price_list_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
         RETURNING id`,
        [albumName, albumName, 'Auto-generated test album', studioId, null, 0, priceListId]
      );
    }

    for (let p = 1; p <= PHOTOS_PER_ALBUM; p += 1) {
      const fileName = `seed-s${studioIndex}-a${a}-p${p}.jpg`;
      let photo = await queryRow(
        'SELECT TOP 1 id FROM photos WHERE album_id = $1 AND file_name = $2',
        [album.id, fileName]
      );

      if (!photo) {
        const seed = `${studioIndex}-${a}-${p}`;
        const fullUrl = `https://picsum.photos/seed/${seed}/1600/1200`;
        const thumbUrl = `https://picsum.photos/seed/${seed}/400/300`;
        photo = await queryRow(
          `INSERT INTO photos (album_id, file_name, thumbnail_url, full_image_url, description, width, height, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
           RETURNING id`,
          [album.id, fileName, thumbUrl, fullUrl, 'Auto-generated test photo', 1600, 1200]
        );
      }

      photoIds.push(Number(photo.id));
    }

    await query('UPDATE albums SET photo_count = (SELECT COUNT(*) FROM photos WHERE album_id = $1) WHERE id = $1', [album.id]);
  }

  return photoIds;
};

const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const sendSeedOrderReceipts = async (orderId, receiptEmail) => {
  const toEmail = normalizeEmail(receiptEmail);
  if (!toEmail) return { customerSent: false, studioSentCount: 0 };

  if (!orderReceiptService.isConfigured()) {
    console.warn(`⚠ SMTP is not configured; skipping seeded receipts for order ${orderId}`);
    return { customerSent: false, studioSentCount: 0 };
  }

  const hasStripeFeeAmount = await columnExists('orders', 'stripe_fee_amount');
  const hasProductSizeId = await columnExists('order_items', 'product_size_id');

  const order = await queryRow(
    `SELECT o.id,
            o.total as totalAmount,
            o.subtotal,
            o.tax_amount as taxAmount,
            o.shipping_cost as shippingCost,
            ${hasStripeFeeAmount ? 'o.stripe_fee_amount' : '0'} as stripeFeeAmount,
            o.shipping_address as shippingAddress,
            u.email as customerEmail,
            u.name as customerName
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!order) return { customerSent: false, studioSentCount: 0 };

  const items = await queryRows(
    `SELECT oi.id,
            oi.photo_id as photoId,
            oi.quantity,
            oi.price as unitPrice,
            ph.file_name as photoFileName,
            p.name as productName,
            a.studio_id as studioId,
            s.name as studioName,
            s.email as studioEmail,
            COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) as basePrice,
            COALESCE(${hasProductSizeId ? 'ps.cost' : 'NULL'}, p.cost, 0) as cost
     FROM order_items oi
     INNER JOIN photos ph ON ph.id = oi.photo_id
     INNER JOIN albums a ON a.id = ph.album_id
     INNER JOIN studios s ON s.id = a.studio_id
     LEFT JOIN products p ON p.id = oi.product_id
     ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
     WHERE oi.order_id = $1`,
    [orderId]
  );

  const parsedShippingAddress = safeJsonParse(order.shippingAddress, {});
  const customerSent = await orderReceiptService.sendCustomerReceipt({
    to: toEmail,
    customerName: parsedShippingAddress?.fullName || order.customerName,
    order: {
      ...order,
      stripeFeeAmount: Number(order.stripeFeeAmount) || 0,
    },
    items,
  });

  const totalItemRevenue = items.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)), 0);
  const studioGroups = new Map();
  for (const item of items) {
    const studioId = Number(item.studioId) || 0;
    if (!studioId) continue;
    if (!studioGroups.has(studioId)) {
      studioGroups.set(studioId, {
        studioName: item.studioName,
        items: [],
      });
    }
    studioGroups.get(studioId).items.push(item);
  }

  let studioSentCount = 0;
  for (const [, studioGroup] of studioGroups) {
    const studioRevenue = studioGroup.items.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)), 0);
    const baseRevenue = studioGroup.items.reduce((sum, item) => sum + ((Number(item.basePrice) || 0) * (Number(item.quantity) || 0)), 0);
    const productionCost = studioGroup.items.reduce((sum, item) => sum + ((Number(item.cost) || 0) * (Number(item.quantity) || 0)), 0);
    const superAdminProfit = studioGroup.items.reduce(
      (sum, item) => sum + (((Number(item.basePrice) || 0) - (Number(item.cost) || 0)) * (Number(item.quantity) || 0)),
      0
    );
    const stripeFeeAmount = totalItemRevenue > 0
      ? (Number(order.stripeFeeAmount) || 0) * (studioRevenue / totalItemRevenue)
      : 0;
    const orderUrl = String(process.env.APP_BASE_URL || '').trim()
      ? `${String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '')}/admin/orders?orderId=${order.id}`
      : null;

    const studioSent = await orderReceiptService.sendStudioReceipt({
      to: toEmail,
      bcc: undefined,
      studioName: studioGroup.studioName,
      customerEmail: toEmail,
      order: {
        ...order,
        orderUrl,
        studioRevenue,
        baseRevenue,
        productionCost,
        grossStudioMarkup: studioRevenue - baseRevenue,
        stripeFeeAmount,
        studioProfitNet: (studioRevenue - baseRevenue) - stripeFeeAmount,
        superAdminProfit,
      },
      items: studioGroup.items,
    });
    if (studioSent) studioSentCount += 1;
  }

  if (customerSent || studioSentCount > 0) {
    await query(
      `UPDATE orders
       SET customer_receipt_sent_at = CASE WHEN $1 = 1 THEN CURRENT_TIMESTAMP ELSE customer_receipt_sent_at END,
           studio_receipt_sent_at = CASE WHEN $2 = 1 THEN CURRENT_TIMESTAMP ELSE studio_receipt_sent_at END
       WHERE id = $3`,
      [customerSent ? 1 : 0, studioSentCount > 0 ? 1 : 0, orderId]
    );
  }

  return { customerSent, studioSentCount };
};

const createPaidOrder = async ({
  stripe,
  customerUserId,
  customerEmail,
  customerName,
  photoIds,
  productId,
  productSizeId,
  unitPrice,
  studioIndex,
  orderNumber,
  hasPhotoIdsColumn,
  hasProductSizeIdColumn,
}) => {
  const quantity = randomInt(1, 3);
  const subtotal = Number((unitPrice * quantity).toFixed(2));
  const shippingCost = 5.0;
  const total = Number((subtotal + shippingCost).toFixed(2));

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(total * 100),
    currency: 'usd',
    payment_method_types: ['card'],
    payment_method: 'pm_card_visa',
    confirm: true,
    metadata: {
      source: 'seedTestCommerce',
      studio: `Seed Studio ${studioIndex}`,
      orderLabel: `S${studioIndex}-O${orderNumber}`,
      customerEmail,
    },
    receipt_email: customerEmail,
    description: `Seed order S${studioIndex}-O${orderNumber}`,
  });

  if (intent.status !== 'succeeded') {
    throw new Error(`PaymentIntent ${intent.id} did not succeed (status=${intent.status})`);
  }

  const shippingAddress = {
    fullName: customerName,
    addressLine1: '123 Seed Street',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98101',
    country: 'US',
    email: customerEmail,
  };

  const order = await queryRow(
    `INSERT INTO orders (user_id, total, subtotal, tax_amount, tax_rate, status, shipping_address, shipping_option, shipping_cost, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
     RETURNING id`,
    [customerUserId, total, subtotal, 0, 0, 'paid', JSON.stringify(shippingAddress), 'direct', shippingCost]
  );

  const selectedPhotoId = pick(photoIds);
  const insertColumns = ['order_id', 'photo_id'];
  const insertValues = [order.id, selectedPhotoId];

  if (hasPhotoIdsColumn) {
    insertColumns.push('photo_ids');
    insertValues.push(JSON.stringify([selectedPhotoId]));
  }

  insertColumns.push('product_id');
  insertValues.push(productId);

  if (hasProductSizeIdColumn) {
    insertColumns.push('product_size_id');
    insertValues.push(productSizeId);
  }

  insertColumns.push('quantity', 'price', 'crop_data');
  insertValues.push(quantity, unitPrice, null);

  const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');

  await query(
    `INSERT INTO order_items (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    insertValues
  );

  return {
    orderId: Number(order.id),
    paymentIntentId: intent.id,
    amount: total,
  };
};

const main = async () => {
  console.log('🌱 Seeding test commerce data...');
  const receiptEmail = normalizeEmail(process.env.SEED_RECEIPT_EMAIL || DEFAULT_RECEIPT_EMAIL);
  if (receiptEmail) {
    console.log(`📧 Seed receipts destination: ${receiptEmail}`);
  }

  const stripe = await ensureStripeClient();
  const subscriptionPlans = await getSeedSubscriptionPlans();
  const priceListId = await ensureDefaultPriceList();
  const { productId, productSizeId, unitPrice } = await ensureSeedProductAndSize(priceListId);

  const hasPhotoIdsColumn = await columnExists('order_items', 'photo_ids');
  const hasProductSizeIdColumn = await columnExists('order_items', 'product_size_id');

  const summary = [];

  for (let i = 1; i <= STUDIO_COUNT; i += 1) {
    const studioPlan = subscriptionPlans[(i - 1) % subscriptionPlans.length];
    const studio = await ensureStudio(i, studioPlan);

    const studioAdminId = await ensureUser({
      email: `seed-studio-admin-${i}@example.com`,
      name: `Seed Studio Admin ${i}`,
      role: 'studio_admin',
      studioId: studio.id,
    });

    const customerEmail = `seed-customer-${i}@example.com`;
    const customerName = `Seed Customer ${i}`;
    const customerId = await ensureUser({
      email: customerEmail,
      name: customerName,
      role: 'customer',
      studioId: studio.id,
    });

    const photoIds = await ensureAlbumsAndPhotos(studio.id, priceListId, i);

    const purchases = [];
    for (let o = 1; o <= ORDERS_PER_STUDIO; o += 1) {
      const purchase = await createPaidOrder({
        stripe,
        customerUserId: customerId,
        customerEmail,
        customerName,
        photoIds,
        productId,
        productSizeId,
        unitPrice,
        studioIndex: i,
        orderNumber: o,
        hasPhotoIdsColumn,
        hasProductSizeIdColumn,
      });

      if (receiptEmail) {
        try {
          await sendSeedOrderReceipts(purchase.orderId, receiptEmail);
        } catch (error) {
          console.error(`⚠ Failed to send seed receipts for order ${purchase.orderId}:`, error?.message || error);
        }
      }

      purchases.push(purchase);
    }

    summary.push({
      studioId: studio.id,
      subscriptionPlan: studio.subscriptionPlan,
      studioAdminId,
      customerId,
      photoCount: photoIds.length,
      purchases,
    });
  }

  console.log('✅ Seed complete');
  console.log('Login credentials:');
  console.log(`- Password for all seeded users: ${TEST_PASSWORD}`);
  console.log('- Studio admins: seed-studio-admin-1@example.com, seed-studio-admin-2@example.com');
  console.log('- Customers: seed-customer-1@example.com, seed-customer-2@example.com');
  console.log('---');

  for (const studio of summary) {
    console.log(`Studio ${studio.studioId} (${studio.subscriptionPlan}) => photos: ${studio.photoCount}, orders: ${studio.purchases.length}`);
    studio.purchases.forEach((p) => {
      console.log(`  • order #${p.orderId} | payment_intent=${p.paymentIntentId} | $${p.amount.toFixed(2)}`);
    });
  }

  console.log(`Finished at ${nowIso()}`);
  process.exit(0);
};

main().catch((error) => {
  console.error('❌ Seed failed:', error?.message || error);
  process.exit(1);
});

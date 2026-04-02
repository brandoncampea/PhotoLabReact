import db from '../server/mssql.cjs';
import { writeFileSync } from 'node:fs';

const baseUrl = 'http://127.0.0.1:3000/api';
const CUSTOMER_PASSWORD = 'TestPassword@123';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, ok: response.ok, body };
}

async function login(email, password) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!result.ok) {
    throw new Error(`Login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
  }

  return result.body.token;
}

async function registerOrLogin(email, password, name) {
  const register = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });

  if (register.ok && register.body?.token) return register.body.token;

  // If already exists, fallback to login
  const message = JSON.stringify(register.body || {});
  if (register.status === 400 && /already exists/i.test(message)) {
    return login(email, password);
  }

  throw new Error(`Register failed for ${email}: ${register.status} ${message}`);
}

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isDigitalRow = (row) => {
  const category = String(row.productCategory || '').toLowerCase();
  const name = String(row.productName || '').toLowerCase();
  const options = safeJsonParse(row.productOptions) || {};
  return (
    options?.isDigital === true ||
    options?.is_digital_only === true ||
    options?.digitalOnly === true ||
    category.includes('digital') ||
    name.includes('digital')
  );
};

async function main() {
  // Pick an active studio with a default studio price list and photos
  const target = await db.queryRow(`
    SELECT TOP 1
      spl.id AS studioPriceListId,
      spl.studio_id AS studioId,
      s.name AS studioName,
      a.id AS albumId
    FROM studio_price_lists spl
    INNER JOIN studios s ON s.id = spl.studio_id
    INNER JOIN albums a ON a.studio_id = s.id
    WHERE s.subscription_status = 'active'
      AND EXISTS (
        SELECT 1 FROM photos p WHERE p.album_id = a.id
      )
      AND EXISTS (
        SELECT 1 FROM studio_price_list_items spi
        WHERE spi.studio_price_list_id = spl.id
          AND spi.is_offered = 1
      )
    ORDER BY spl.is_default DESC, spl.id ASC
  `);

  if (!target) {
    throw new Error('No active studio/default price list with offered items found.');
  }

  // Grab photos from target album for variety
  const albumPhotos = await db.queryRows(`
    SELECT TOP 40 id
    FROM photos
    WHERE album_id = @p1
    ORDER BY id DESC
  `, [target.albumId]);

  if (!albumPhotos.length) {
    throw new Error('Target album has no photos.');
  }

  // Grab offered products, exclude digital, keep unique product_size_id
  const offeredRows = await db.queryRows(`
    SELECT
      spi.id AS studioItemId,
      ps.id AS productSizeId,
      ps.product_id AS productId,
      p.name AS productName,
      p.category AS productCategory,
      p.options AS productOptions,
      ps.size_name AS sizeName,
      COALESCE(spi.price, sspi.base_cost, ps.price, 0) AS sellPrice
    FROM studio_price_list_items spi
    INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
    INNER JOIN products p ON p.id = ps.product_id
    LEFT JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
    LEFT JOIN super_price_list_items sspi
      ON sspi.product_size_id = spi.product_size_id
     AND sspi.super_price_list_id = spl.super_price_list_id
    WHERE spi.studio_price_list_id = @p1
      AND spi.is_offered = 1
    ORDER BY p.category, p.name, ps.size_name
  `, [target.studioPriceListId]);

  const physical = offeredRows.filter((row) => !isDigitalRow(row));
  const uniqueBySize = [];
  const seenSizeIds = new Set();
  for (const row of physical) {
    const sizeId = Number(row.productSizeId);
    if (!seenSizeIds.has(sizeId)) {
      seenSizeIds.add(sizeId);
      uniqueBySize.push(row);
    }
    if (uniqueBySize.length >= 20) break;
  }

  if (uniqueBySize.length < 20) {
    throw new Error(`Need at least 20 non-digital offered products; found ${uniqueBySize.length}.`);
  }

  // Configure shipping so batch orders are eligible immediately
  const adminToken = await login('admin@example.com', 'AdminPassword@123');
  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'x-acting-studio-id': String(target.studioId),
  };

  const batchAddress = {
    fullName: 'Batch QA Receiver',
    addressLine1: '500 Test Batch Ln',
    addressLine2: 'Dock 2',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85004',
    country: 'US',
    email: 'batch-qa@example.com',
    phone: '555-333-1000',
  };

  const cfg = await request('/shipping/config', {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      batchDeadline: '2024-01-01T00:00:00.000Z',
      directShippingCharge: 12.5,
      isActive: true,
      batchShippingAddress: batchAddress,
    }),
  });

  if (!cfg.ok) {
    throw new Error(`Failed to set shipping config: ${cfg.status} ${JSON.stringify(cfg.body)}`);
  }

  const createdOrders = [];
  const failedOrders = [];
  const ts = Date.now();

  for (let i = 0; i < 20; i++) {
    const row = uniqueBySize[i];
    const photo = albumPhotos[i % albumPhotos.length];
    const email = `batchtest+${ts}-${i + 1}@example.com`;
    const customerName = `Batch Customer ${i + 1}`;

    try {
      const customerToken = await registerOrLogin(email, CUSTOMER_PASSWORD, customerName);
      const headers = { Authorization: `Bearer ${customerToken}` };

      const price = Number(row.sellPrice || 0);
      const payload = {
        items: [{
          photoId: Number(photo.id),
          photoIds: [Number(photo.id)],
          quantity: 1,
          productId: Number(row.productId),
          productSizeId: Number(row.productSizeId),
          price,
        }],
        subtotal: Number(price.toFixed(2)),
        taxAmount: 0,
        taxRate: 0,
        total: Number(price.toFixed(2)),
        shippingAddress: {
          fullName: customerName,
          addressLine1: `${100 + i} Customer Way`,
          addressLine2: '',
          city: 'Phoenix',
          state: 'AZ',
          zipCode: `850${String(i).padStart(2, '0')}`,
          country: 'US',
          email,
          phone: `555-220-${String(1000 + i)}`,
        },
        shippingOption: 'batch',
        shippingCost: 0,
        isBatch: true,
        labSubmitted: false,
      };

      const created = await request('/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!created.ok) {
        throw new Error(`${created.status} ${JSON.stringify(created.body)}`);
      }

      createdOrders.push({
        index: i + 1,
        orderId: created.body?.id,
        customerEmail: email,
        productId: Number(row.productId),
        productSizeId: Number(row.productSizeId),
        productName: row.productName,
        sizeName: row.sizeName,
        photoId: Number(photo.id),
      });
    } catch (err) {
      failedOrders.push({
        index: i + 1,
        customerEmail: email,
        productId: Number(row.productId),
        productSizeId: Number(row.productSizeId),
        productName: row.productName,
        sizeName: row.sizeName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const queue = await request('/orders/admin/batch-queue', {
    method: 'GET',
    headers: adminHeaders,
  });

  const summary = {
    studio: {
      studioId: Number(target.studioId),
      studioName: target.studioName,
      studioPriceListId: Number(target.studioPriceListId),
      albumId: Number(target.albumId),
    },
    requestedOrders: 20,
    createdCount: createdOrders.length,
    failedCount: failedOrders.length,
    createdOrders,
    failedOrders,
    batchQueue: {
      status: queue.status,
      ok: queue.ok,
      totalQueued: queue.body?.totalQueued,
      eligibleCount: queue.body?.eligibleCount,
      eligibleOrderIds: queue.body?.eligibleOrderIds || [],
      nextBatchDate: queue.body?.nextBatchDate || null,
    },
  };

  writeFileSync(new URL('./batch-whcc-test-orders-result.json', import.meta.url), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

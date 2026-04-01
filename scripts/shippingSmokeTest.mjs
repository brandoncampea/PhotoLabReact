import db from '../server/mssql.cjs';
import { writeFileSync } from 'node:fs';

const baseUrl = 'http://127.0.0.1:3000/api';

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

const normalizeOrderResult = (result) => ({
  status: result.status,
  id: result.body?.id,
  shippingOption: result.body?.shippingOption,
  orderStatus: result.body?.status,
  labSubmitted: result.body?.labSubmitted,
  batchQueueStatus: result.body?.batchQueueStatus,
  batchReadyDate: result.body?.batchReadyDate,
  error: result.ok ? undefined : result.body,
});

const main = async () => {
  const item = await db.queryRow(`
    SELECT TOP 1
      s.id AS studioId,
      a.id AS albumId,
      p.id AS photoId,
      ps.id AS productSizeId,
      pr.id AS productId,
      pr.name AS productName,
      ps.size_name AS sizeName,
      COALESCE(ps.price, pr.price, 0) AS price
    FROM photos p
    INNER JOIN albums a ON a.id = p.album_id
    INNER JOIN studios s ON s.id = a.studio_id
    INNER JOIN product_sizes ps ON a.price_list_id = ps.price_list_id
    INNER JOIN products pr ON pr.id = ps.product_id
    WHERE s.subscription_status = 'active'
    ORDER BY p.id, ps.id
  `);

  if (!item) throw new Error('No active studio order item found');

  const studioId = Number(item.studioId);
  const customerToken = await login('customer@example.com', 'TestPassword@123');
  const adminToken = await login('admin@example.com', 'AdminPassword@123');

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'x-acting-studio-id': String(studioId),
  };
  const customerHeaders = {
    Authorization: `Bearer ${customerToken}`,
  };

  const sharedBatchAddress = {
    fullName: 'Campea Photography Batch Ship',
    addressLine1: '123 Studio Lane',
    addressLine2: 'Suite 200',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85001',
    country: 'US',
    email: 'batch@example.com',
    phone: '555-0101',
  };

  const customerShippingAddress = {
    fullName: 'Test Customer',
    addressLine1: '456 Customer Rd',
    addressLine2: '',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85002',
    country: 'US',
    email: 'customer@example.com',
    phone: '555-0202',
  };

  const futureConfig = await request('/shipping/config', {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      batchDeadline: '2099-12-31T23:59:59.000Z',
      directShippingCharge: 12.5,
      isActive: true,
      batchShippingAddress: sharedBatchAddress,
    }),
  });

  const configCheck = await request('/shipping/config', {
    method: 'GET',
    headers: adminHeaders,
  });

  const directPrice = Number(item.price);
  const directShippingCost = 12.5;
  const directSubtotal = Number((directPrice + directShippingCost).toFixed(2));

  const directOrder = await request('/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      items: [{
        photoId: item.photoId,
        photoIds: [item.photoId],
        quantity: 1,
        productId: item.productId,
        productSizeId: item.productSizeId,
        price: directPrice,
      }],
      subtotal: directSubtotal,
      taxAmount: 0,
      taxRate: 0,
      total: directSubtotal,
      shippingAddress: customerShippingAddress,
      shippingOption: 'direct',
      shippingCost: directShippingCost,
      isBatch: false,
      labSubmitted: false,
    }),
  });

  const batchSubtotal = Number(directPrice.toFixed(2));
  const futureBatchOrder = await request('/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      items: [{
        photoId: item.photoId,
        photoIds: [item.photoId],
        quantity: 1,
        productId: item.productId,
        productSizeId: item.productSizeId,
        price: directPrice,
      }],
      subtotal: batchSubtotal,
      taxAmount: 0,
      taxRate: 0,
      total: batchSubtotal,
      shippingAddress: customerShippingAddress,
      shippingOption: 'batch',
      shippingCost: 0,
      isBatch: true,
      labSubmitted: false,
    }),
  });

  const queueFuture = await request('/orders/admin/batch-queue', {
    method: 'GET',
    headers: adminHeaders,
  });

  const pastConfig = await request('/shipping/config', {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      batchDeadline: '2024-01-01T00:00:00.000Z',
      directShippingCharge: 12.5,
      isActive: true,
      batchShippingAddress: sharedBatchAddress,
    }),
  });

  const eligibleBatchOrder = await request('/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      items: [{
        photoId: item.photoId,
        photoIds: [item.photoId],
        quantity: 1,
        productId: item.productId,
        productSizeId: item.productSizeId,
        price: directPrice,
      }],
      subtotal: batchSubtotal,
      taxAmount: 0,
      taxRate: 0,
      total: batchSubtotal,
      shippingAddress: customerShippingAddress,
      shippingOption: 'batch',
      shippingCost: 0,
      isBatch: true,
      labSubmitted: false,
    }),
  });

  const queueEligible = await request('/orders/admin/batch-queue', {
    method: 'GET',
    headers: adminHeaders,
  });

  const submitBatch = await request('/orders/admin/submit-batch', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      orderIds: queueEligible.body?.eligibleOrderIds || [],
      batchAddress: sharedBatchAddress,
      selectedLab: 'whcc',
    }),
  });

  const summary = {
    studioId,
    product: {
      photoId: item.photoId,
      productId: item.productId,
      productSizeId: item.productSizeId,
      productName: item.productName,
      sizeName: item.sizeName,
      price: item.price,
    },
    futureConfig: {
      status: futureConfig.status,
      ok: futureConfig.ok,
      body: futureConfig.body,
    },
    configCheck: {
      status: configCheck.status,
      batchDeadline: configCheck.body?.batchDeadline,
      directShippingCharge: configCheck.body?.directShippingCharge,
      batchShippingAddressFullName: configCheck.body?.batchShippingAddress?.fullName,
    },
    directOrder: normalizeOrderResult(directOrder),
    futureBatchOrder: normalizeOrderResult(futureBatchOrder),
    queueFuture: {
      status: queueFuture.status,
      totalQueued: queueFuture.body?.totalQueued,
      eligibleCount: queueFuture.body?.eligibleCount,
      nextBatchDate: queueFuture.body?.nextBatchDate,
    },
    pastConfig: {
      status: pastConfig.status,
      ok: pastConfig.ok,
      body: pastConfig.body,
    },
    eligibleBatchOrder: normalizeOrderResult(eligibleBatchOrder),
    queueEligible: {
      status: queueEligible.status,
      totalQueued: queueEligible.body?.totalQueued,
      eligibleCount: queueEligible.body?.eligibleCount,
      eligibleOrderIds: queueEligible.body?.eligibleOrderIds,
    },
    submitBatch: {
      status: submitBatch.status,
      body: submitBatch.body,
    },
  };

  writeFileSync(new URL('./shipping-smoke-result.json', import.meta.url), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

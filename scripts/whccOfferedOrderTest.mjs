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

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const main = async () => {
  const target = await db.queryRow(`
    SELECT TOP 1
      spl.id AS studioPriceListId,
      spl.name AS studioPriceListName,
      spl.studio_id AS studioId,
      s.subscription_status AS subscriptionStatus,
      s.email AS studioEmail,
      p.id AS samplePhotoId
    FROM studio_price_lists spl
    INNER JOIN studios s ON s.id = spl.studio_id
    INNER JOIN albums a ON a.studio_id = s.id
    INNER JOIN photos p ON p.album_id = a.id
    WHERE s.subscription_status = 'active'
      AND EXISTS (
        SELECT 1
        FROM studio_price_list_items spi
        WHERE spi.studio_price_list_id = spl.id
          AND spi.is_offered = 1
      )
    ORDER BY spl.id ASC, p.id ASC
  `);

  if (!target) {
    throw new Error('No active studio with offered items and photos found.');
  }

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

  if (!offeredRows.length) {
    throw new Error('No offered items found in selected studio price list.');
  }

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

  const physicalRows = offeredRows.filter((row) => !isDigitalRow(row));

  if (!physicalRows.length) {
    throw new Error('No non-digital offered items found to submit to WHCC.');
  }

  const customerToken = await login('customer@example.com', 'TestPassword@123');

  const items = physicalRows.map((row) => ({
    photoId: Number(target.samplePhotoId),
    photoIds: [Number(target.samplePhotoId)],
    quantity: 1,
    productId: Number(row.productId),
    productSizeId: Number(row.productSizeId),
    price: Number(row.sellPrice || 0),
  }));

  const subtotal = Number(items.reduce((sum, item) => sum + Number(item.price || 0), 0).toFixed(2));
  const shippingCost = 0;
  const taxAmount = 0;
  const total = subtotal + shippingCost + taxAmount;

  const shippingAddress = {
    fullName: 'WHCC Full Catalog Test',
    addressLine1: '123 Test Lane',
    addressLine2: '',
    city: 'Eagan',
    state: 'MN',
    zipCode: '55121',
    country: 'US',
    email: 'customer@example.com',
    phone: '6516468263',
  };

  const createOrder = await request('/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      items,
      subtotal,
      taxAmount,
      taxRate: 0,
      total,
      shippingAddress,
      shippingOption: 'direct',
      shippingCost,
      isBatch: false,
      labSubmitted: false,
    }),
  });

  let orderSummary = null;
  if (createOrder.ok && createOrder.body?.id) {
    const orderRow = await db.queryRow(`
      SELECT id,
             status,
             whcc_confirmation_id AS whccConfirmationId,
             whcc_import_response AS whccImportResponse,
             whcc_submit_response AS whccSubmitResponse,
             whcc_last_error AS whccLastError
      FROM orders
      WHERE id = @p1
    `, [createOrder.body.id]);

    orderSummary = {
      id: orderRow?.id,
      status: orderRow?.status,
      whccConfirmationId: orderRow?.whccConfirmationId || null,
      hasImportResponse: Boolean(orderRow?.whccImportResponse),
      hasSubmitResponse: Boolean(orderRow?.whccSubmitResponse),
      whccLastError: safeJsonParse(orderRow?.whccLastError),
    };
  }

  const summary = {
    studio: {
      studioId: Number(target.studioId),
      studioPriceListId: Number(target.studioPriceListId),
      studioPriceListName: target.studioPriceListName,
      samplePhotoId: Number(target.samplePhotoId),
    },
    offeredItemCount: offeredRows.length,
    physicalOfferedItemCount: physicalRows.length,
    skippedDigitalCount: offeredRows.length - physicalRows.length,
    orderRequest: {
      itemCount: items.length,
      subtotal,
      total,
      shippingOption: 'direct',
    },
    createOrder: {
      status: createOrder.status,
      ok: createOrder.ok,
      body: createOrder.body,
    },
    orderSummary,
    offeredItemSample: offeredRows.slice(0, 10).map((row) => ({
      studioItemId: Number(row.studioItemId),
      productId: Number(row.productId),
      productSizeId: Number(row.productSizeId),
      productName: row.productName,
      sizeName: row.sizeName,
      sellPrice: Number(row.sellPrice || 0),
    })),
  };

  const outPath = new URL('./whcc-offered-order-test-result.json', import.meta.url);
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

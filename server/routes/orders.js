import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import orderReceiptService from '../services/orderReceiptService.js';
const router = express.Router();

const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getConfiguredStripeClient = async () => {
  const config = await queryRow('SELECT secret_key as secretKey, is_active as isActive FROM stripe_config WHERE id = 1');
  const secretKey = String(config?.secretKey || '').trim();
  if (!config?.isActive || !secretKey || secretKey.includes('example') || secretKey.includes('***')) {
    return null;
  }
  const Stripe = (await import('stripe')).default;
  return new Stripe(secretKey, { apiVersion: '2023-10-16' });
};

const fetchPaymentIntentAccounting = async (paymentIntentId) => {
  if (!paymentIntentId || String(paymentIntentId).startsWith('pi_mock_')) {
    return {
      paymentIntentId: paymentIntentId || null,
      chargeId: null,
      stripeFeeAmount: 0,
    };
  }

  try {
    const stripe = await getConfiguredStripeClient();
    if (!stripe) {
      return { paymentIntentId, chargeId: null, stripeFeeAmount: 0 };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });

    const latestCharge = typeof paymentIntent.latest_charge === 'string'
      ? { id: paymentIntent.latest_charge, balance_transaction: null }
      : paymentIntent.latest_charge;

    const stripeFeeAmount = Number(latestCharge?.balance_transaction?.fee || 0) / 100;

    return {
      paymentIntentId: paymentIntent.id,
      chargeId: latestCharge?.id || null,
      stripeFeeAmount,
    };
  } catch (error) {
    console.error('Failed to retrieve Stripe fee accounting:', error?.message || error);
    return {
      paymentIntentId,
      chargeId: null,
      stripeFeeAmount: 0,
    };
  }
};

const sendOrderReceipts = async (orderId) => {
  if (!orderReceiptService.isConfigured()) {
    console.warn('SMTP is not configured; skipping order receipts for order', orderId);
    return;
  }

  const order = await queryRow(
    `SELECT o.id,
            o.total as totalAmount,
            o.subtotal,
            o.tax_amount as taxAmount,
            o.shipping_cost as shippingCost,
            o.stripe_fee_amount as stripeFeeAmount,
            o.shipping_address as shippingAddress,
            u.email as customerEmail,
            u.name as customerName
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!order) return;

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
            COALESCE(ps.price, p.price, 0) as basePrice,
            COALESCE(ps.cost, p.cost, 0) as cost
     FROM order_items oi
     INNER JOIN photos ph ON ph.id = oi.photo_id
     INNER JOIN albums a ON a.id = ph.album_id
     INNER JOIN studios s ON s.id = a.studio_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  const parsedShippingAddress = safeJsonParse(order.shippingAddress, {});
  const customerSent = await orderReceiptService.sendCustomerReceipt({
    to: parsedShippingAddress?.email || order.customerEmail,
    customerName: parsedShippingAddress?.fullName || order.customerName,
    order,
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
        studioEmail: item.studioEmail,
        items: [],
      });
    }
    studioGroups.get(studioId).items.push(item);
  }

  let anyStudioSent = false;
  for (const [, studioGroup] of studioGroups) {
    const studioRevenue = studioGroup.items.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)), 0);
    const baseRevenue = studioGroup.items.reduce((sum, item) => sum + ((Number(item.basePrice) || 0) * (Number(item.quantity) || 0)), 0);
    const superAdminProfit = studioGroup.items.reduce(
      (sum, item) => sum + (((Number(item.basePrice) || 0) - (Number(item.cost) || 0)) * (Number(item.quantity) || 0)),
      0
    );
    const stripeFeeAmount = totalItemRevenue > 0
      ? (Number(order.stripeFeeAmount) || 0) * (studioRevenue / totalItemRevenue)
      : 0;

    const sent = await orderReceiptService.sendStudioReceipt({
      to: studioGroup.studioEmail,
      studioName: studioGroup.studioName,
      customerEmail: parsedShippingAddress?.email || order.customerEmail,
      order: {
        ...order,
        stripeFeeAmount,
        studioProfitNet: (studioRevenue - baseRevenue) - stripeFeeAmount,
        superAdminProfit,
      },
      items: studioGroup.items,
    });
    anyStudioSent = anyStudioSent || sent;
  }

  if (customerSent || anyStudioSent) {
    await query(
      `UPDATE orders
       SET customer_receipt_sent_at = CASE WHEN $1 = 1 THEN CURRENT_TIMESTAMP ELSE customer_receipt_sent_at END,
           studio_receipt_sent_at = CASE WHEN $2 = 1 THEN CURRENT_TIMESTAMP ELSE studio_receipt_sent_at END
       WHERE id = $3`,
      [customerSent ? 1 : 0, anyStudioSent ? 1 : 0, orderId]
    );
  }
};

// Protect all order routes
router.use(authRequired);

// Get current user's orders
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await queryRows(`
            SELECT o.id, o.user_id as userId, o.total, o.shipping_address as shippingAddress,
              o.created_at as createdAt,
              o.stripe_fee_amount as stripeFeeAmount,
              o.payment_intent_id as paymentIntentId
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
    `, [userId]);
    
    // Parse JSON items
    const parsedOrders = [];
    for (const order of orders) {
      const items = await queryRows(
        `SELECT id, photo_id as photoId, photo_ids as photoIds, product_id as productId,
                quantity, price, crop_data as cropData
         FROM order_items WHERE order_id = $1`,
        [order.id]
      );
      parsedOrders.push({
        ...order,
        shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
        items: items.map(item => ({
          ...item,
          cropData: item.cropData ? JSON.parse(item.cropData) : null,
          photoIds: item.photoIds ? JSON.parse(item.photoIds) : item.photoId ? [item.photoId] : [],
        })),
      });
    }
    
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order for current user (requires active subscription for studio selling)
router.post('/', requireActiveSubscription, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      items, 
      total, 
      subtotal,
      taxAmount,
      taxRate,
      shippingAddress, 
      shippingOption, 
      shippingCost, 
      discountCode,
      paymentIntentId,
      isBatch,
      labSubmitted,
      batchShippingAddress,
      batchLabVendor,
    } = req.body;

    const paymentAccounting = await fetchPaymentIntentAccounting(paymentIntentId);

    const batchOrder = !!isBatch;
    let batchReadyDate = null;
    if (batchOrder) {
      const shippingConfig = await queryRow('SELECT batch_deadline as batchDeadline FROM shipping_config WHERE id = 1');
      if (shippingConfig?.batchDeadline) {
        const parsedDate = new Date(shippingConfig.batchDeadline);
        if (!Number.isNaN(parsedDate.getTime())) {
          batchReadyDate = parsedDate.toISOString();
        }
      }
    }

    // Insert order and get the returned id
    const orderResult = await queryRow(`
      INSERT INTO orders (
        user_id, 
        total, 
        subtotal,
        tax_amount,
        tax_rate,
        shipping_address, 
        shipping_option, 
        shipping_cost,
        discount_code,
        is_batch,
        batch_shipping_address,
        batch_ready_date,
        batch_queue_status,
        batch_lab_vendor,
        lab_submitted,
        payment_intent_id,
        stripe_charge_id,
        stripe_fee_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id
    `, [
      userId, 
      total,
      subtotal || 0, 
      taxAmount || 0,
      taxRate || 0,
      JSON.stringify(shippingAddress),
      shippingOption || 'direct',
      shippingCost || 0,
      discountCode || null,
      batchOrder,
      batchShippingAddress ? JSON.stringify(batchShippingAddress) : null,
      batchReadyDate,
      batchOrder ? 'queued' : null,
      batchLabVendor || null,
      !!labSubmitted,
      paymentAccounting.paymentIntentId,
      paymentAccounting.chargeId,
      paymentAccounting.stripeFeeAmount,
    ]);

    const orderId = orderResult.id;

    // Insert order items
    for (const item of items) {
      const photoIds = Array.isArray(item.photoIds)
        ? item.photoIds
        : item.photoId
        ? [item.photoId]
        : [];
      const primaryPhotoId = photoIds[0];
      if (!primaryPhotoId) {
        throw new Error('Order item missing photo');
      }

      await query(`
        INSERT INTO order_items (order_id, photo_id, photo_ids, product_id, product_size_id, quantity, price, crop_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        orderId,
        primaryPhotoId,
        JSON.stringify(photoIds),
        item.productId,
        item.productSizeId || null,
        item.quantity,
        item.price,
        item.cropData ? JSON.stringify(item.cropData) : null,
      ]);
    }

    // Generate studio invoice line items for each order item
    try {
      // Collect per-studio invoice items
      const studioItemMap = new Map(); // studio_id -> { subscriptionEnd, items: [] }

      for (const item of items) {
        if (!item.productSizeId && !item.productId) continue;
        const photoIds = Array.isArray(item.photoIds) ? item.photoIds : item.photoId ? [item.photoId] : [];
        const primaryPhotoId = photoIds[0];
        if (!primaryPhotoId) continue;

        // Resolve studio via photo -> album
        const photo = await queryRow('SELECT album_id FROM photos WHERE id = $1', [primaryPhotoId]);
        if (!photo?.album_id) continue;

        const album = await queryRow(
          'SELECT studio_id, price_list_id FROM albums WHERE id = $1',
          [photo.album_id]
        );
        if (!album?.studio_id) continue;

        // Get the super admin price for this size (studio's cost)
        let unitCost = 0;
        if (item.productSizeId) {
          const sizeRow = await queryRow(
            'SELECT price FROM product_sizes WHERE id = $1',
            [item.productSizeId]
          );
          unitCost = Number(sizeRow?.price) || 0;
        }

        const studioId = Number(album.studio_id);
        if (!studioItemMap.has(studioId)) {
          const studio = await queryRow(
            'SELECT subscription_end FROM studios WHERE id = $1',
            [studioId]
          );
          studioItemMap.set(studioId, { subscriptionEnd: studio?.subscription_end || null, items: [] });
        }
        studioItemMap.get(studioId).items.push({
          productId: item.productId || null,
          productSizeId: item.productSizeId || null,
          quantity: Number(item.quantity) || 1,
          unitCost,
        });
      }

      // For each studio, upsert the open invoice and add line items
      for (const [studioId, { items: invoiceItems }] of studioItemMap) {
        let invoice = await queryRow(
          `SELECT id, total_amount, item_count FROM studio_invoices
           WHERE studio_id = $1 AND status = 'open'
           ORDER BY created_at DESC`,
          [studioId]
        );

        if (!invoice) {
          const result = await queryRow(
            `INSERT INTO studio_invoices (studio_id, billing_period_start, status, total_amount, item_count)
             VALUES ($1, CURRENT_TIMESTAMP, 'open', 0, 0)
             RETURNING id`,
            [studioId]
          );
          invoice = { id: result.id, total_amount: 0, item_count: 0 };
        }

        let addedTotal = 0;
        let addedItemCount = 0;
        for (const invoiceItem of invoiceItems) {
          const totalCost = invoiceItem.unitCost * invoiceItem.quantity;
          await query(
            `INSERT INTO studio_invoice_items
               (invoice_id, studio_id, order_id, product_id, product_size_id, quantity, unit_cost, total_cost, order_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [
              invoice.id, studioId, orderId,
              invoiceItem.productId, invoiceItem.productSizeId,
              invoiceItem.quantity, invoiceItem.unitCost, totalCost,
            ]
          );
          addedTotal += totalCost;
          addedItemCount += invoiceItem.quantity;
        }

        await query(
          `UPDATE studio_invoices
           SET total_amount = total_amount + $1, item_count = item_count + $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [addedTotal, addedItemCount, invoice.id]
        );
      }
    } catch (invoiceErr) {
      // Invoice generation is non-blocking — log but don't fail the order
      console.error('Invoice generation error (non-fatal):', invoiceErr);
    }

    // Return the created order
    try {
      await sendOrderReceipts(orderId);
    } catch (receiptError) {
      console.error('Order receipt send failed (non-fatal):', receiptError);
    }

    const createdOrder = await queryRow('SELECT * FROM orders WHERE id = $1', [orderId]);
    res.status(201).json({
      id: createdOrder.id,
      userId: createdOrder.user_id,
      totalAmount: createdOrder.total,
      subtotal: createdOrder.subtotal,
      taxAmount: createdOrder.tax_amount,
      taxRate: createdOrder.tax_rate,
      stripeFeeAmount: Number(createdOrder.stripe_fee_amount) || 0,
      paymentIntentId: createdOrder.payment_intent_id || null,
      status: createdOrder.status || 'Pending',
      orderDate: createdOrder.created_at,
      shippingAddress: createdOrder.shipping_address ? JSON.parse(createdOrder.shipping_address) : null,
      shippingOption: createdOrder.shipping_option,
      shippingCost: createdOrder.shipping_cost,
      batchShippingAddress: safeJsonParse(createdOrder.batch_shipping_address),
      batchReadyDate: createdOrder.batch_ready_date,
      batchQueueStatus: createdOrder.batch_queue_status,
      batchLabVendor: createdOrder.batch_lab_vendor,
      isBatch: Boolean(createdOrder.is_batch),
      labSubmitted: Boolean(createdOrder.lab_submitted),
      labSubmittedAt: createdOrder.lab_submitted_at,
      items: [],
      message: 'Order created successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's orders (customer view)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await queryRows(`
      SELECT 
        o.id, 
        o.user_id as userId, 
        o.total as totalAmount,
        o.subtotal,
        o.tax_amount as taxAmount,
        o.tax_rate as taxRate,
        o.status,
        o.shipping_address as shippingAddress,
        o.shipping_option as shippingOption,
        o.shipping_cost as shippingCost,
        o.is_batch as isBatch,
        o.batch_shipping_address as batchShippingAddress,
        o.batch_ready_date as batchReadyDate,
        o.batch_queue_status as batchQueueStatus,
        o.batch_lab_vendor as batchLabVendor,
        o.lab_submitted as labSubmitted,
        o.lab_submitted_at as labSubmittedAt,
        o.stripe_fee_amount as stripeFeeAmount,
        o.payment_intent_id as paymentIntentId,
        o.customer_receipt_sent_at as customerReceiptSentAt,
        o.studio_receipt_sent_at as studioReceiptSentAt,
        o.created_at as orderDate
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
    `, [userId]);
    
    const parsedOrders = [];
    for (const order of orders) {
      const items = await queryRows(
        `SELECT id, photo_id as photoId, photo_ids as photoIds, product_id as productId,
                product_size_id as productSizeId, quantity, price, crop_data as cropData
         FROM order_items WHERE order_id = $1`,
        [order.id]
      );
      const itemsWithPhotos = [];
      for (const item of items) {
        const photo = await queryRow(
          `SELECT id, album_id as albumId, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl
           FROM photos WHERE id = $1`,
          [item.photoId]
        );
        let unitCost = 0;
        if (item.productSizeId) {
          const size = await queryRow(
            `SELECT price FROM product_sizes WHERE id = $1`,
            [item.productSizeId]
          );
          unitCost = Number(size?.price) || 0;
        } else if (item.productId) {
          const product = await queryRow(
            `SELECT price FROM products WHERE id = $1`,
            [item.productId]
          );
          unitCost = Number(product?.price) || 0;
        }
        itemsWithPhotos.push({
          ...item,
          price: item.price || 0,
          cost: unitCost,
          cropData: item.cropData ? JSON.parse(item.cropData) : null,
          photoIds: item.photoIds ? JSON.parse(item.photoIds) : item.photoId ? [item.photoId] : [],
          photo: photo ? {
            id: photo.id,
            albumId: photo.albumId,
            fileName: photo.filename ?? photo.fileName,
            thumbnailUrl: `/api/photos/${photo.id}/asset?variant=thumbnail`,
            url: `/api/photos/${photo.id}/asset?variant=full`,
          } : {
            id: item.photoId,
            albumId: 0,
            fileName: `Photo #${item.photoId}`,
            thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
            url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
          },
        });
      }
      parsedOrders.push({
        ...order,
        status: order.status || 'Pending',
        isBatch: Boolean(order.isBatch),
        labSubmitted: Boolean(order.labSubmitted),
        shippingAddress: safeJsonParse(order.shippingAddress),
        batchShippingAddress: safeJsonParse(order.batchShippingAddress),
        batchReadyDate: order.batchReadyDate,
        batchQueueStatus: order.batchQueueStatus,
        batchLabVendor: order.batchLabVendor,
        labSubmittedAt: order.labSubmittedAt,
        items: itemsWithPhotos,
      });
    }
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders (admin view)
router.get('/admin/all-orders', adminRequired, async (req, res) => {
  try {
    let queryText = `
      SELECT 
        o.id, 
        o.user_id as userId, 
        o.total as totalAmount,
        o.subtotal,
        o.tax_amount as taxAmount,
        o.tax_rate as taxRate,
        o.status,
        o.shipping_address as shippingAddress,
        o.shipping_option as shippingOption,
        o.shipping_cost as shippingCost,
        o.is_batch as isBatch,
        o.batch_shipping_address as batchShippingAddress,
        o.batch_ready_date as batchReadyDate,
        o.batch_queue_status as batchQueueStatus,
        o.batch_lab_vendor as batchLabVendor,
        o.lab_submitted as labSubmitted,
        o.lab_submitted_at as labSubmittedAt,
        o.stripe_fee_amount as stripeFeeAmount,
        o.payment_intent_id as paymentIntentId,
        o.customer_receipt_sent_at as customerReceiptSentAt,
        o.studio_receipt_sent_at as studioReceiptSentAt,
        o.created_at as orderDate
      FROM orders o
    `;
    const params = [];
    if (req.user.role === 'studio_admin') {
      queryText += ` WHERE o.user_id IN (SELECT u.id FROM users u WHERE u.studio_id = $1)`;
      params.push(req.user.studio_id);
    }
    queryText += ` ORDER BY o.created_at DESC`;

    const orders = await queryRows(queryText, params);
    
    const parsedOrders = [];
    for (const order of orders) {
      const items = await queryRows(
        `SELECT id, photo_id as photoId, photo_ids as photoIds, product_id as productId,
                quantity, price, crop_data as cropData
         FROM order_items WHERE order_id = $1`,
        [order.id]
      );
      const itemsWithPhotos = [];
      for (const item of items) {
        const photo = await queryRow(
          `SELECT id, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl
           FROM photos WHERE id = $1`,
          [item.photoId]
        );
        itemsWithPhotos.push({
          ...item,
          price: item.price || 0,
          cropData: item.cropData ? JSON.parse(item.cropData) : null,
          photoIds: item.photoIds ? JSON.parse(item.photoIds) : item.photoId ? [item.photoId] : [],
          photo: photo ? {
            id: photo.id,
            fileName: photo.filename ?? photo.fileName,
            thumbnailUrl: `/api/photos/${photo.id}/asset?variant=thumbnail`,
            url: `/api/photos/${photo.id}/asset?variant=full`,
          } : {
            id: item.photoId,
            fileName: `Photo #${item.photoId}`,
            thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
            url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`,
          },
        });
      }
      parsedOrders.push({
        ...order,
        status: order.status || 'Pending',
        isBatch: Boolean(order.isBatch),
        labSubmitted: Boolean(order.labSubmitted),
        shippingAddress: safeJsonParse(order.shippingAddress),
        batchShippingAddress: safeJsonParse(order.batchShippingAddress),
        batchReadyDate: order.batchReadyDate,
        batchQueueStatus: order.batchQueueStatus,
        batchLabVendor: order.batchLabVendor,
        labSubmittedAt: order.labSubmittedAt,
        items: itemsWithPhotos,
      });
    }
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order status (admin)
router.patch('/admin/:orderId/status', adminRequired, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({ error: 'orderId and status are required' });
    }

    const allowedStatuses = ['pending', 'processing', 'completed', 'shipped', 'cancelled'];
    if (!allowedStatuses.includes(String(status).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const order = await queryRow(
      `SELECT o.id, o.user_id as userId
       FROM orders o
       WHERE o.id = $1`,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (req.user.role === 'studio_admin') {
      const user = await queryRow(
        `SELECT studio_id as studioId FROM users WHERE id = $1`,
        [order.userId]
      );

      if (!user || user.studioId !== req.user.studio_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2`,
      [status, orderId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit batch orders to lab (admin)
router.post('/admin/submit-batch', adminRequired, async (req, res) => {
  try {
    const { orderIds, batchAddress, selectedLab } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds must be a non-empty array' });
    }

    if (!selectedLab || typeof selectedLab !== 'string') {
      return res.status(400).json({ error: 'selectedLab is required' });
    }

    if (
      !batchAddress ||
      !batchAddress.fullName ||
      !batchAddress.addressLine1 ||
      !batchAddress.city ||
      !batchAddress.state ||
      !batchAddress.zipCode ||
      !batchAddress.email
    ) {
      return res.status(400).json({ error: 'Valid batchAddress is required' });
    }

    const ids = orderIds.map((id) => Number(id)).filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid order IDs provided' });
    }

    let updatedCount = 0;
    let notReadyCount = 0;
    const now = new Date();

    for (const orderId of ids) {
      const order = await queryRow(
        `SELECT o.id, o.user_id as userId, o.is_batch as isBatch, o.lab_submitted as labSubmitted,
                o.batch_ready_date as batchReadyDate
         FROM orders o
         WHERE o.id = $1`,
        [orderId]
      );

      if (!order || !order.isBatch || order.labSubmitted) continue;

      if (order.batchReadyDate) {
        const readyDate = new Date(order.batchReadyDate);
        if (!Number.isNaN(readyDate.getTime()) && readyDate > now) {
          notReadyCount += 1;
          continue;
        }
      }

      if (req.user.role === 'studio_admin') {
        const user = await queryRow(
          `SELECT studio_id as studioId FROM users WHERE id = $1`,
          [order.userId]
        );

        if (!user || user.studioId !== req.user.studio_id) {
          continue;
        }
      }

      await query(
        `UPDATE orders
         SET lab_submitted = true,
             lab_submitted_at = CURRENT_TIMESTAMP,
             batch_shipping_address = $2,
             batch_lab_vendor = $3,
             batch_queue_status = 'submitted',
             status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END
         WHERE id = $1`,
        [orderId, JSON.stringify(batchAddress), selectedLab]
      );

      updatedCount += 1;
    }

    res.json({ success: true, selectedLab, updatedCount, notReadyCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get batch queue summary (admin)
router.get('/admin/batch-queue', adminRequired, async (req, res) => {
  try {
    let queryText = `
      SELECT
        o.id,
        o.user_id as userId,
        o.batch_ready_date as batchReadyDate,
        o.created_at as createdAt
      FROM orders o
      WHERE o.is_batch = 1
        AND (o.lab_submitted = 0 OR o.lab_submitted IS NULL)
    `;
    const params = [];
    if (req.user.role === 'studio_admin') {
      queryText += ` AND o.user_id IN (SELECT u.id FROM users u WHERE u.studio_id = $1)`;
      params.push(req.user.studio_id);
    }
    queryText += ` ORDER BY o.created_at ASC`;

    const queuedOrders = await queryRows(queryText, params);
    const now = new Date();
    const eligibleOrderIds = [];
    let nextBatchDate = null;

    for (const order of queuedOrders) {
      const readyDate = order.batchReadyDate ? new Date(order.batchReadyDate) : null;
      if (!readyDate || Number.isNaN(readyDate.getTime()) || readyDate <= now) {
        eligibleOrderIds.push(order.id);
        continue;
      }

      if (!nextBatchDate || readyDate < new Date(nextBatchDate)) {
        nextBatchDate = readyDate.toISOString();
      }
    }

    res.json({
      totalQueued: queuedOrders.length,
      eligibleCount: eligibleOrderIds.length,
      eligibleOrderIds,
      shouldPromptSubmission: eligibleOrderIds.length > 0,
      nextBatchDate,
      labOptions: ['roes', 'whcc', 'mpix'],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

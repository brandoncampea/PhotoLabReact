import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
const router = express.Router();

// Protect all order routes
router.use(authRequired);

// Get current user's orders
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await queryRows(`
      SELECT o.id, o.user_id as userId, o.total, o.shipping_address as shippingAddress,
             o.created_at as createdAt
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
      isBatch,
      labSubmitted 
    } = req.body;

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
        lab_submitted
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      !!isBatch,
      !!labSubmitted,
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
        INSERT INTO order_items (order_id, photo_id, photo_ids, product_id, quantity, price, crop_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        orderId,
        primaryPhotoId,
        JSON.stringify(photoIds),
        item.productId,
        item.quantity,
        item.price,
        item.cropData ? JSON.stringify(item.cropData) : null,
      ]);
    }

    // Return the created order
    const createdOrder = await queryRow('SELECT * FROM orders WHERE id = $1', [orderId]);
    res.status(201).json({
      id: createdOrder.id,
      userId: createdOrder.user_id,
      totalAmount: createdOrder.total,
      subtotal: createdOrder.subtotal,
      taxAmount: createdOrder.tax_amount,
      taxRate: createdOrder.tax_rate,
      status: createdOrder.status || 'Pending',
      orderDate: createdOrder.created_at,
      shippingAddress: createdOrder.shipping_address ? JSON.parse(createdOrder.shipping_address) : null,
      shippingOption: createdOrder.shipping_option,
      shippingCost: createdOrder.shipping_cost,
      isBatch: Boolean(createdOrder.is_batch),
      labSubmitted: Boolean(createdOrder.lab_submitted),
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
        o.lab_submitted as labSubmitted,
        o.created_at as orderDate,
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
    `, [userId]);
    
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
            thumbnailUrl: photo.thumbnailUrl,
            url: photo.fullImageUrl,
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
        shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
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
        o.lab_submitted as labSubmitted,
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
            thumbnailUrl: photo.thumbnailUrl,
            url: photo.fullImageUrl,
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
        shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
        items: itemsWithPhotos,
      });
    }
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';
import { db } from '../database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
const router = express.Router();

// Protect all order routes
router.use(authRequired);

// Get current user's orders
router.get('/user/:userId', (req, res) => {
  try {
    const userId = req.user.id;
    const orders = db.prepare(`
      SELECT o.id, o.user_id as userId, o.total, o.shipping_address as shippingAddress,
             o.created_at as createdAt,
             json_group_array(
               json_object(
                 'id', oi.id,
                 'photoId', oi.photo_id,
                 'photoIds', oi.photo_ids,
                 'productId', oi.product_id,
                 'quantity', oi.quantity,
                 'price', oi.price,
                 'cropData', oi.crop_data
               )
             ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all(userId);
    
    // Parse JSON items
    const parsedOrders = orders.map(order => ({
      ...order,
      shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
      items: order.items
        ? JSON.parse(order.items).map(item => ({
            ...item,
            cropData: item.cropData ? JSON.parse(item.cropData) : null,
            photoIds: item.photoIds ? JSON.parse(item.photoIds) : item.photoId ? [item.photoId] : []
          }))
        : []
    }));
    
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order for current user (requires active subscription for studio selling)
router.post('/', requireActiveSubscription, (req, res) => {
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
    const orderResult = db.prepare(`
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, 
      total,
      subtotal || 0, 
      taxAmount || 0,
      taxRate || 0,
      JSON.stringify(shippingAddress),
      shippingOption || 'direct',
      shippingCost || 0,
      discountCode || null,
      isBatch ? 1 : 0,
      labSubmitted ? 1 : 0
    );

    const orderId = orderResult.lastInsertRowid;

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

      db.prepare(`
        INSERT INTO order_items (order_id, photo_id, photo_ids, product_id, quantity, price, crop_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        primaryPhotoId,
        JSON.stringify(photoIds),
        item.productId,
        item.quantity,
        item.price,
        item.cropData ? JSON.stringify(item.cropData) : null
      );
    }

    // Return the created order
    const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
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
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const orders = db.prepare(`
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
        json_group_array(
          json_object(
            'id', oi.id,
            'photoId', oi.photo_id,
            'photoIds', oi.photo_ids,
            'productId', oi.product_id,
            'quantity', oi.quantity,
            'price', oi.price,
            'cropData', oi.crop_data
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all(userId);
    
    const parsedOrders = orders.map(order => {
      const parsedItems = order.items ? JSON.parse(order.items).filter(item => item.id !== null) : [];
      
      // Get actual photo URLs from photos table
      const itemsWithPhotos = parsedItems.map(item => {
        const photo = db.prepare(`
          SELECT id, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl
          FROM photos WHERE id = ?
        `).get(item.photoId);
        
        return {
          ...item,
          price: item.price || 0,
          cropData: item.cropData ? JSON.parse(item.cropData) : null,
          photoIds: item.photoIds ? JSON.parse(item.photoIds) : item.photoId ? [item.photoId] : [],
          photo: photo ? {
            id: photo.id,
            fileName: photo.fileName,
            thumbnailUrl: photo.thumbnailUrl,
            url: photo.fullImageUrl
          } : {
            id: item.photoId,
            fileName: `Photo #${item.photoId}`,
            thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
            url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`
          }
        };
      });
      
      return {
        ...order,
        status: order.status || 'Pending',
        isBatch: Boolean(order.isBatch),
        labSubmitted: Boolean(order.labSubmitted),
        shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
        items: itemsWithPhotos
      };
    });
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders (admin view)
router.get('/admin/all-orders', adminRequired, (req, res) => {
  try {
    // Studio admins should only see orders from their studio
    let query = `
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
        json_group_array(
          json_object(
            'id', oi.id,
            'photoId', oi.photo_id,
            'photoIds', oi.photo_ids,
            'productId', oi.product_id,
            'quantity', oi.quantity,
            'price', oi.price,
            'cropData', oi.crop_data
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;
    
    // Studio admins only see orders from their studio's customers
    if (req.user.role === 'studio_admin') {
      query += `
        WHERE o.user_id IN (
          SELECT u.id FROM users u WHERE u.studio_id = ?
        )
      `;
    }
    
    query += `
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;
    
    const orders = req.user.role === 'studio_admin'
      ? db.prepare(query).all(req.user.studio_id)
      : db.prepare(query).all();
    
    const parsedOrders = orders.map(order => {
      const parsedItems = order.items ? JSON.parse(order.items).filter(item => item.id !== null) : [];
      
      // Get actual photo URLs from photos table
      const itemsWithPhotos = parsedItems.map(item => {
        const photo = db.prepare(`
          SELECT id, file_name as fileName, thumbnail_url as thumbnailUrl, full_image_url as fullImageUrl
          FROM photos WHERE id = ?
        `).get(item.photoId);
        
        return {
          ...item,
          price: item.price || 0,
          cropData: item.cropData ? JSON.parse(item.cropData) : null,
          photoIds: item.photoIds ? JSON.parse(item.photoIds) : item.photoId ? [item.photoId] : [],
          photo: photo ? {
            id: photo.id,
            fileName: photo.fileName,
            thumbnailUrl: photo.thumbnailUrl,
            url: photo.fullImageUrl
          } : {
            id: item.photoId,
            fileName: `Photo #${item.photoId}`,
            thumbnailUrl: `https://picsum.photos/seed/photo${item.photoId}/300/300`,
            url: `https://picsum.photos/seed/photo${item.photoId}/1200/900`
          }
        };
      });
      
      return {
        ...order,
        status: order.status || 'Pending',
        isBatch: Boolean(order.isBatch),
        labSubmitted: Boolean(order.labSubmitted),
        shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
        items: itemsWithPhotos
      };
    });
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

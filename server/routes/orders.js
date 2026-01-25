import express from 'express';
import { db } from '../database.js';
import { authRequired } from '../middleware/auth.js';
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
      items: order.items ? JSON.parse(order.items) : []
    }));
    
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order for current user
router.post('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { items, total, shippingAddress } = req.body;

    // Insert order and get the returned id
    const orderResult = db.prepare(`
      INSERT INTO orders (user_id, total, shipping_address)
      VALUES (?, ?, ?)
    `).run(userId, total, JSON.stringify(shippingAddress));

    const orderId = orderResult.lastInsertRowid;

    // Insert order items
    for (const item of items) {
      db.prepare(`
        INSERT INTO order_items (order_id, photo_id, product_id, quantity, price, crop_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        item.photoId,
        item.productId,
        item.quantity,
        item.price,
        item.cropData ? JSON.stringify(item.cropData) : null
      );
    }

    res.status(201).json({ orderId, message: 'Order created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's orders (customer view)
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const orders = db.prepare(`
      SELECT o.id, o.user_id as userId, o.total, o.shipping_address as shippingAddress,
             o.created_at as createdAt,
             json_group_array(
               json_object(
                 'id', oi.id,
                 'photoId', oi.photo_id,
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
    
    const parsedOrders = orders.map(order => ({
      ...order,
      shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
      items: order.items ? JSON.parse(order.items) : []
    }));
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

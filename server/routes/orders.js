import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get user orders
router.get('/user/:userId', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, 
             json_group_array(
               json_object(
                 'id', oi.id,
                 'photo_id', oi.photo_id,
                 'product_id', oi.product_id,
                 'quantity', oi.quantity,
                 'price', oi.price,
                 'crop_data', oi.crop_data
               )
             ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all(req.params.userId);
    
    // Parse JSON items
    const parsedOrders = orders.map(order => ({
      ...order,
      items: JSON.parse(order.items)
    }));
    
    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order
router.post('/', (req, res) => {
  try {
    const { userId, items, total, shippingAddress } = req.body;

    // Insert order
    const orderResult = db.prepare(`
      INSERT INTO orders (user_id, total, shipping_address)
      VALUES (?, ?, ?)
    `).run(userId, total, JSON.stringify(shippingAddress));

    const orderId = orderResult.lastInsertRowid;

    // Insert order items
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, photo_id, product_id, quantity, price, crop_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    items.forEach(item => {
      insertItem.run(
        orderId,
        item.photoId,
        item.productId,
        item.quantity,
        item.price,
        item.cropData ? JSON.stringify(item.cropData) : null
      );
    });

    res.status(201).json({ orderId, message: 'Order created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders (admin)
router.get('/', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `).all();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

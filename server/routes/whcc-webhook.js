import express from 'express';
import mssql from '../mssql.cjs';
const { query, queryRow } = mssql;
const router = express.Router();

// WHCC Webhook Handler
router.post('/api/whcc-webhook', async (req, res) => {
  try {
    const event = req.body;
    // Handle WHCC verification POST (no orderId, may include verificationCode)
    if (!event || (!event.orderId && !event.verificationCode)) {
      // Accept and respond 200 OK for unknown/verification payloads
      return res.status(200).json({ success: true });
    }
    if (event.verificationCode) {
      // Echo the verification code if present (WHCC expects this)
      return res.status(200).json({ verificationCode: event.verificationCode });
    }
    if (!event.orderId) {
      return res.status(400).json({ error: 'Missing orderId in webhook payload' });
    }

    // Find local order by WHCC order ID
    const localOrder = await queryRow('SELECT * FROM orders WHERE whcc_order_id = $1', [event.orderId]);
    if (!localOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Map WHCC status to local status (customize as needed)
    let newStatus = localOrder.status;
    if (event.status) {
      switch (event.status) {
        case 'Shipped':
          newStatus = 'shipped';
          break;
        case 'Error':
          newStatus = 'error';
          break;
        case 'Cancelled':
          newStatus = 'cancelled';
          break;
        default:
          newStatus = event.status.toLowerCase();
      }
    }

    // Update local order with new status and tracking info
    await query(
      'UPDATE orders SET status = $1, tracking_number = $2, whcc_webhook_payload = $3 WHERE whcc_order_id = $4',
      [newStatus, event.trackingNumber || null, JSON.stringify(event), event.orderId]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

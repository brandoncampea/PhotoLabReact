// server/routes/frontendError.js
import express from 'express';
import { logAndNotifyError } from '../services/errorLogger.js';
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { error, info, url, userAgent, source, lineno, colno, stack, customerId, customerEmail } = req.body || {};
    await logAndNotifyError({
      error: { message: error, stack: stack || (info && info.componentStack) || '' },
      req: {
        originalUrl: url,
        method: 'POST',
        headers: { 'user-agent': userAgent },
        body: req.body,
      },
      customerId: customerId || null,
      customerEmail: customerEmail || null,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

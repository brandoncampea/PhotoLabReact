import express from 'express';
import { db } from '../database.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// Get Stripe configuration
router.get('/config', (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM stripe_config WHERE id = 1').get();
    
    if (!config) {
      return res.status(404).json({ error: 'Stripe config not found' });
    }
    
    // Don't expose secret key to frontend, transform to camelCase
    res.json({
      id: config.id,
      publishableKey: config.publishable_key,
      isLiveMode: Boolean(config.is_live_mode),
      isActive: Boolean(config.is_active),
      webhookSecret: config.webhook_secret,
    });
  } catch (error) {
    console.error('Error fetching Stripe config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test Stripe connection
router.post('/test-connection', async (req, res) => {
  try {
    const { secretKey } = req.body;
    
    if (!secretKey || !secretKey.trim()) {
      return res.status(400).json({ error: 'Secret key is required' });
    }

    const trimmedKey = secretKey.trim();
    
    // Check for placeholder keys
    if (trimmedKey.includes('example') || trimmedKey.includes('***') || trimmedKey === 'your-stripe-secret-key') {
      return res.status(400).json({ error: 'Please provide a valid Stripe secret key' });
    }

    // Dynamically import Stripe with the provided key
    const stripe = (await import('stripe')).default(trimmedKey);

    // Test the connection by retrieving the account
    const account = await stripe.accounts.retrieve();
    
    res.json({
      success: true,
      message: `Connected successfully to Stripe account: ${account.email || account.id}`,
      accountId: account.id,
      accountEmail: account.email,
      isLive: !trimmedKey.startsWith('sk_test_')
    });
  } catch (error) {
    console.error('Stripe test connection error:', error);
    
    if (error.type === 'StripeAuthenticationError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid Stripe API key. Please check your credentials.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to Stripe' 
    });
  }
});

// Update Stripe configuration (admin only)
router.put('/config', (req, res) => {
  try {
    const { publishableKey, secretKey, isLiveMode, isActive, webhookSecret } = req.body;
    
    // Ensure config exists
    const existing = db.prepare('SELECT * FROM stripe_config WHERE id = 1').get();
    
    if (!existing) {
      // Create if doesn't exist
      db.prepare(`
        INSERT INTO stripe_config (id, publishable_key, secret_key, is_live_mode, is_active, webhook_secret)
        VALUES (1, ?, ?, ?, ?, ?)
      `).run(publishableKey, secretKey, isLiveMode ? 1 : 0, isActive ? 1 : 0, webhookSecret || null);
    } else {
      // Update existing
      db.prepare(`
        UPDATE stripe_config
        SET publishable_key = ?, secret_key = ?, is_live_mode = ?, is_active = ?, webhook_secret = ?
        WHERE id = 1
      `).run(publishableKey, secretKey, isLiveMode ? 1 : 0, isActive ? 1 : 0, webhookSecret || null);
    }
    
    const updated = db.prepare('SELECT * FROM stripe_config WHERE id = 1').get();
    // Don't expose secret key
    const { secret_key, ...safeConfig } = updated;
    res.json(safeConfig);
  } catch (error) {
    console.error('Error updating Stripe config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create payment intent
router.post('/create-payment-intent', authRequired, async (req, res) => {
  try {
    const { items, shippingOption, shippingCost, discountAmount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty cart items' });
    }

    // Calculate total amount from items
    const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = shippingCost || 0;
    const discount = discountAmount || 0;
    const totalAmount = itemsTotal + shipping - discount;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }

    // Get Stripe config
    const config = db.prepare('SELECT * FROM stripe_config WHERE id = 1').get();
    
    if (!config || !config.secret_key || !config.is_active) {
      return res.status(503).json({ error: 'Stripe is not configured or inactive' });
    }

    // Guard against placeholder or obviously invalid keys to avoid hard 500s
    const trimmedKey = config.secret_key.trim();
    const looksPlaceholder = trimmedKey.includes('example') || trimmedKey.includes('***');
    if (!trimmedKey || looksPlaceholder) {
      return res.status(503).json({ error: 'Stripe API key is invalid. Update stripe_config.secret_key with a valid test key.' });
    }

    // Dynamically import Stripe with the secret key
    const stripe = (await import('stripe')).default(config.secret_key);

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Stripe expects cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        items: JSON.stringify(items.map(i => ({ photoId: i.photoId, quantity: i.quantity }))),
        shippingOption,
        shippingCost: shipping.toFixed(2),
        discountAmount: discount.toFixed(2),
      },
    });

    res.json({
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);

    if (error && error.type === 'StripeAuthenticationError') {
      return res.status(503).json({ error: 'Stripe authentication failed. Check your secret key.' });
    }

    res.status(500).json({ error: error.message });
  }
});

export default router;

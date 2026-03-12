import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './mssql.js';

import authRoutes from './routes/auth.js';
import albumRoutes from './routes/albums.js';
import photoRoutes from './routes/photos.js';
import orderRoutes from './routes/orders.js';
import productRoutes from './routes/products.js';
import analyticsRoutes from './routes/analytics.js';
import priceListRoutes from './routes/priceLists.js';
import priceListItemsRoutes from './routes/priceListItems.js';
import mpixProxyRoutes from './routes/mpixProxy.js';
import packageRoutes from './routes/packages.js';
import profileRoutes from './routes/profile.js';
import cartRoutes from './routes/cart.js';
import watermarkRoutes from './routes/watermarks.js';
import discountCodeRoutes from './routes/discountCodes.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import shippingRoutes from './routes/shipping.js';
import stripeRoutes from './routes/stripe.js';
import studiosRoutes from './routes/studios.js';
import webhookRoutes from './routes/webhooks.js';
import subscriptionPlansRoutes from './routes/subscriptionPlans.js';
import invoicesRoutes from './routes/invoices.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const clientDistPath = path.resolve(__dirname, '../dist');
const hasClientBuild = fs.existsSync(path.join(clientDistPath, 'index.html'));

// Stripe webhooks MUST be registered before express.json() so the raw
// request body is available for signature verification.
app.use('/api/webhooks', webhookRoutes);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/price-lists', priceListRoutes);
app.use('/api/price-lists', priceListItemsRoutes);
app.use('/api', mpixProxyRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/watermarks', watermarkRoutes);
app.use('/api/discount-codes', discountCodeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/studios', studiosRoutes);
app.use('/api/subscription-plans', subscriptionPlansRoutes);
app.use('/api/invoices', invoicesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Photo Lab API is running' });
});

// API root handler
app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Photo Lab API root',
    docs: '/api/health'
  });
});

// Quick health check for Azure startup probe (responds immediately)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve built frontend when available (single App Service deployment)
if (hasClientBuild) {
  app.use(express.static(clientDistPath));

  // SPA fallback for non-API routes
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // Root handler for API-only deployments/local debugging
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Photo Lab API root',
      docs: '/api/health'
    });
  });
}

// Initialize database and start server
console.log('Starting server...');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DB_HOST:', process.env.DB_HOST);

const startServer = () => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server listening on port ${PORT}`);
    console.log(`✓ API available at http://localhost:${PORT}/api`);
  });
};

const dbInitTimeout = setTimeout(() => {
  console.warn('⚠ Database initialization timeout - still waiting before accepting requests');
}, 8000);

initializeDatabase()
  .then(() => {
    clearTimeout(dbInitTimeout);
    console.log('✓ Database initialized successfully');
    startServer();
  })
  .catch((error) => {
    clearTimeout(dbInitTimeout);
    console.error('✗ Failed to initialize database:', error.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

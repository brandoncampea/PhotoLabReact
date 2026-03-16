import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './mssql.mjs';

import authRoutes from './routes/auth.js';
import albumRoutes from './routes/albums.js';
import photoRoutes from './routes/photos.js';
import orderRoutes from './routes/orders.js';
import productRoutes from './routes/products.js';
import analyticsRoutes from './routes/analytics.js';
import priceListRoutes from './routes/priceLists.js';
import priceListItemsRoutes from './routes/priceListItems.js';
import mpixProxyRoutes from './routes/mpixProxy.js';
import whccProxyRoutes from './routes/whccProxy.js';
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
import publicSearchRoutes from './routes/publicSearch.js';
import smugmugRoutes from './routes/smugmug.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
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
app.use('/api', whccProxyRoutes);
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
app.use('/api/public-search', publicSearchRoutes);
app.use('/api/smugmug', smugmugRoutes);

// Health check
// Read version from package.json
let appVersion = 'unknown';
try {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  appVersion = pkg.version || 'unknown';
} catch {}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Photo Lab API is running', version: appVersion });
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
console.log('APP VERSION:', appVersion);

const startServer = () => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server listening on port ${PORT}`);
    console.log(`✓ API available at http://localhost:${PORT}/api`);
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const initializeDatabaseWithRetry = async () => {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      await initializeDatabase();
      console.log(`✓ Database initialized successfully (attempt ${attempt})`);
      return;
    } catch (error) {
      const delayMs = Math.min(30000, 3000 * attempt);
      console.error(`✗ Database initialization failed (attempt ${attempt}):`, error?.message || error);
      console.warn(`⚠ Retrying database initialization in ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }
};

// Start HTTP listener immediately so Azure health/startup probes succeed quickly.
startServer();

// Initialize DB in the background (with retries) so transient DB startup issues
// do not crash the worker process during deployment.
initializeDatabaseWithRetry();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

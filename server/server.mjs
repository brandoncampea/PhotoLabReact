import frontendErrorRoutes from './routes/frontendError.js';
import { expireTrials } from './jobs/trialExpiry.js';
import { initializeDatabase } from './initializeDatabasePatch.js';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
console.log('Starting server/server.mjs...');
import fs from 'fs';
import express from 'express';

import taxRoutes from './routes/tax.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Must be declared before any usage
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import priceSuggestionsRoutes from './routes/priceSuggestions.js';
console.log('[server.mjs] Server entrypoint loaded');
console.log('ENV DEBUG: AZURE_STORAGE_CONTAINER:', process.env.AZURE_STORAGE_CONTAINER);
console.log('ENV DEBUG: AZURE_CONTAINER_NAME:', process.env.AZURE_CONTAINER_NAME);
console.log('ENV DEBUG: All env:', Object.keys(process.env).filter(k => k.toLowerCase().includes('azure')).reduce((acc, k) => { acc[k] = process.env[k]; return acc; }, {}));
// Load environment variables from .env.local (for WHCC and other secrets)
import dotenv from 'dotenv';
// (moved above for dotenv absolute path loading)
// __filename and __dirname already declared above
dotenv.config({ path: path.join(__dirname, '../.env.local') });
import adminDashboardRoutes from './routes/adminDashboard.js';
import studioDashboardRoutes from './routes/studioDashboard.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const blobSasRoutes = require('./routes/blobSas.cjs');
import labsRouter from './routes/labs.js';
import superPriceListsRouter from './routes/superPriceLists.js';
import studioPriceListsRouter from './routes/studioPriceLists.js';
import albumProductsRouter from './routes/albumProducts.js';
import photoRoutes from './routes/photos.js';
import '../server/startup/ensureOrderItemAttributesColumn.js';
import { logAndNotifyError } from './services/errorLogger.js';



import authRoutes from './routes/auth.js';
const infoRoutes = require('./routes/info.cjs');
import albumsModule from './routes/albums.js';
const albumRoutes = albumsModule.default || albumsModule;
import chunkedUploadRoutes from './routes/chunkedUpload.js';
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
import watermarkRoutes from './routes/watermarks.mjs';
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
import playerWatchlistRoutes from './routes/playerWatchlist.js';
import schoolWatchlistRoutes from './routes/schoolWatchlist.js';
import smugmugRoutes from './routes/smugmug.js';
import landingPagesRoutes from './routes/landingPages.js';
import publicLandingRoutes from './routes/publicLanding.js';
import instagramRoutes from './routes/instagram.js';
import { invitesRouter as studioAdminInvitesRouter, acceptRouter as adminInviteAcceptRouter } from './routes/studioAdminInvites.js';
import schedulingRoutes from './routes/scheduling.js';



import whccEditorRoutes from './routes/whccEditor.js';
import ticketRoutes from './tickets/routes.js';
import notifyWatchersRoutes from './routes/notifyWatchers.js';
import reportsRoutes from './routes/reports.js';

import runWhccEditorBackfillOnce from './startup/runWhccEditorBackfillOnce.js';
import runWhccVariantSchemaMigrations from './startup/runWhccVariantSchemaMigrations.js';
import './startup/ensureFreeBatchShippingColumn.js';
import './startup/ensurePackageOrderColumns.js';
import './startup/ensureOrderApprovalColumns.js';
import './startup/ensureWhccLabBillingColumns.js';
import './startup/ensureInstagramIntegrationTables.js';
import './startup/ensureStudioAdminInvitesTable.js';
import './startup/ensureUserReceiveOrderNotifications.js';
import './startup/ensureUserLastLoginColumn.js';
import './startup/ensureSchedulingTables.js';
import './startup/ensurePhotoSchema.js';
import './startup/ensureAlbumSchema.js';

import '../server/startup/ensureOrderItemAttributesColumn.js';
import { customDomainRedirect } from './middleware/customDomainRedirect.js';







const app = express();
// Register frontend error reporting route after app is initialized
app.use('/api/log-frontend-error', frontendErrorRoutes);

// ========================================
// SECURITY MIDDLEWARE (must come first)
// ========================================

// Helmet: Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.stripe.com', 'https://maps.googleapis.com', 'https://roeswebtest.com'],
      scriptSrcElem: ["'self'", "'unsafe-inline'", 'https://js.stripe.com', 'https://maps.googleapis.com', 'https://roeswebtest.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://roeswebtest.com'],
      styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://roeswebtest.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      frameSrc: ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: false, // Handled by frameAncestors in CSP above
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later.'
});

// Apply stricter limits to auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// CORS: allow frontend dev server and production origin
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = [
  // Only include localhost/dev origins if not in production
  ...(!isProduction ? [
    'http://localhost:3004',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3004',
  ] : []),
  process.env.FRONTEND_URL,
  process.env.CANONICAL_APP_URL || 'https://labs.campeaphotography.com',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, same-origin) or whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-acting-studio-id'],
}));

// Session middleware (must come after CORS)
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? undefined : 'dev-secret');
if (!sessionSecret) {
  throw new Error('SESSION_SECRET environment variable is required in production');
}
console.log('[SESSION] Using session secret from environment');
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: isProduction ? 'strict' : 'lax', // Stricter in production
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    // No domain property for local dev; let browser handle it
  }
}));
const PORT = process.env.PORT || 3000;
const clientDistPath = path.resolve(__dirname, '../dist');
const hasClientBuild = fs.existsSync(path.join(clientDistPath, 'index.html'));


// Ensure JSON body parsing is enabled before tax route
app.use(express.json({ limit: '500mb' }));

// Custom domain redirect middleware - check if request is for a custom domain
// Must come before API routes and static serving
app.use(customDomainRedirect);

app.use('/api/tax', taxRoutes);

// request body is available for signature verification.
app.use('/api/webhooks', webhookRoutes);
app.use('/api/info', infoRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Use routes
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/studio-dashboard', studioDashboardRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/photos/chunked-upload', chunkedUploadRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/price-lists', priceListRoutes);
app.use('/api/price-list-items', priceListItemsRoutes);
// New price list/product system
app.use('/api/labs', labsRouter);
app.use('/api/super-price-lists', superPriceListsRouter);
app.use('/api/studio-price-lists', studioPriceListsRouter);
app.use('/api/album-products', albumProductsRouter);
app.use('/api', mpixProxyRoutes);
app.use('/api', whccProxyRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/profile/landing-page', landingPagesRoutes);
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
app.use('/api/publicSearch', publicSearchRoutes);
app.use('/api/player-watchlist', playerWatchlistRoutes);
app.use('/api/school-watchlist', schoolWatchlistRoutes);
app.use('/api/blob-sas', blobSasRoutes);
app.use('/api/smugmug', smugmugRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/studios/:studioId/admin-invites', studioAdminInvitesRouter);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/admin-invites', adminInviteAcceptRouter);


app.use('/api/whcc-editor', whccEditorRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/reports', reportsRoutes);

// Notify watchers endpoint
app.use('/api/notify-watchers', notifyWatchersRoutes);

// Public landing pages
app.use('/studio', publicLandingRoutes);

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


// Register price suggestions route outside of the root handler
app.use('/api/price-suggestions', priceSuggestionsRoutes);


console.log('==============================');
console.log(' PHOTO LAB API SERVER STARTING ');
console.log('==============================');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('APP VERSION:', appVersion);
console.log('==============================');

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
      await runWhccVariantSchemaMigrations();
      await runWhccEditorBackfillOnce({ appVersion });
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
initializeDatabaseWithRetry().then(() => {
  setTimeout(async () => {
    try { await expireTrials(); } catch (e) { console.error('[trialExpiry] startup run failed:', e); }
    setInterval(async () => {
      try { await expireTrials(); } catch (e) { console.error('[trialExpiry] scheduled run failed:', e); }
    }, 24 * 60 * 60 * 1000);
  }, 10_000);
});

// Global error handler (must be after all routes)
app.use(async (err, req, res, next) => {
  console.error('[GLOBAL ERROR HANDLER]', err);
  if (process.env.NODE_ENV === 'production') {
    await logAndNotifyError({
      error: err,
      req,
      customerId: req?.user?.id || null,
      customerEmail: req?.user?.email || null,
    });
  }
  res.status(500).json({ error: 'Internal Server Error', details: err && err.message });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

// Log uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason && reason.stack ? reason.stack : reason);
});

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './database.js';

import authRoutes from './routes/auth.js';
import albumRoutes from './routes/albums.js';
import photoRoutes from './routes/photos.js';
import orderRoutes from './routes/orders.js';
import productRoutes from './routes/products.js';
import analyticsRoutes from './routes/analytics.js';
import priceListRoutes from './routes/priceLists.js';
import packageRoutes from './routes/packages.js';
import profileRoutes from './routes/profile.js';
import cartRoutes from './routes/cart.js';
import watermarkRoutes from './routes/watermarks.js';
import discountCodeRoutes from './routes/discountCodes.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/price-lists', priceListRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/watermarks', watermarkRoutes);
app.use('/api/discount-codes', discountCodeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Photo Lab API is running' });
});

// Root handler for convenience
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Photo Lab API root',
    docs: '/api/health'
  });
});

// Initialize database and start server
initDb();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

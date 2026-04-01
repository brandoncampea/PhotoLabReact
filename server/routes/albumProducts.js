// Album product listing for customers
import express from 'express';
const router = express.Router();

// GET available products/sizes for an album (with recommended/other split)
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '../campeaphotolab-test.db'));

router.get('/:albumId', async (req, res) => {
  const { albumId } = req.params;
  try {
    // Get album and price list
    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
    if (!album) return res.status(404).json({ error: 'Album not found' });
    let priceListId = album.price_list_id;
    if (!priceListId) {
      // Use studio default price list
      const studioDefault = db.prepare('SELECT id FROM studio_price_lists WHERE studio_id = ? AND is_default = 1').get(album.studio_id);
      priceListId = studioDefault?.id;
    }
    if (!priceListId) return res.status(404).json({ error: 'No price list for album/studio' });
    // Get all offered items
    const items = db.prepare(`
      SELECT spi.*, ps.name as size_name, ps.width, ps.height, ps.is_digital, p.name as product_name, p.category
      FROM studio_price_list_items spi
      JOIN product_sizes ps ON spi.product_size_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE spi.studio_price_list_id = ? AND spi.is_offered = 1
    `).all(priceListId);
    // Recommended: digital or best size match (stub: all digital, rest as other)
    const recommended = items.filter(i => i.is_digital);
    const other = items.filter(i => !i.is_digital);
    res.json({ recommended, other });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch album products' });
  }
});

export default router;

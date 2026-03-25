import express from 'express';
import { queryRow, queryRows, query } from '../mssql.mjs';
import { adminRequired } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
const router = express.Router();

const SIZE_DIMENSION_DELIMITER = '__';

const decodeSizeName = (storedName) => {
  const raw = String(storedName || '');
  if (!raw.includes(SIZE_DIMENSION_DELIMITER)) {
    const matched = raw.match(/^(.*?)(?:\s*\(?([0-9.]+)x([0-9.]+)\)?)?$/i);
    if (!matched) {
      return { name: raw, width: 0, height: 0 };
    }
    const width = Number(matched[2]) || 0;
    const height = Number(matched[3]) || 0;
    return { name: matched[1].trim() || raw, width, height };
  }

  const [namePart, dimensionPart] = raw.split(SIZE_DIMENSION_DELIMITER);
  const [widthPart, heightPart] = String(dimensionPart || '').split('x');
  return {
    name: (namePart || raw).trim(),
    width: Number(widthPart) || 0,
    height: Number(heightPart) || 0,
  };
};

const mapLegacyProducts = (products) => {
  return products.map((p) => {
    const opts = p.options ? JSON.parse(p.options) : null;
    const sizes = Array.isArray(opts?.sizes)
      ? opts.sizes.map((s, idx) => ({
          id: Number.isFinite(Number(s.id)) ? Number(s.id) : (p.id * 1000 + idx + 1),
          name: s.name,
          width: Number(s.width) || 0,
          height: Number(s.height) || 0,
          price: Number(s.price) || 0,
        }))
      : [];
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      description: p.description,
      sizes,
      isActive: opts?.isActive !== undefined ? !!opts.isActive : true,
      popularity: Number(opts?.popularity) || 0,
      isDigital: !!opts?.isDigital,
    };
  });
};

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await queryRows('SELECT * FROM products ORDER BY order_index ASC, category, name');
  router.put('/order', adminRequired, requireActiveSubscription, async (req, res) => {
    try {
      const { order } = req.body; // [{id: 1, orderIndex: 0}, ...]
      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'Invalid order payload' });
      }
      const updatePromises = order.map(({ id, orderIndex }) =>
        query(
          'UPDATE products SET order_index = $1 WHERE id = $2',
          [orderIndex, id]
        )
      );
      await Promise.all(updatePromises);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
    const parsedProducts = mapLegacyProducts(products);
    res.json(parsedProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active products (fallback to all if is_active column doesn't exist)
router.get('/active', async (req, res) => {
  try {
    const albumId = Number(req.query.albumId);
    if (Number.isInteger(albumId) && albumId > 0) {
      const album = await queryRow(
        `SELECT id, price_list_id as priceListId, studio_id as studioId
         FROM albums
         WHERE id = $1`,
        [albumId]
      );

      if (album?.priceListId) {
        const products = await queryRows(
          `SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.options
           FROM products p
           INNER JOIN price_list_products plp ON plp.product_id = p.id
           WHERE plp.price_list_id = $1
             AND (
               $2 IS NULL
               OR NOT EXISTS (
                 SELECT 1
                 FROM studio_price_list_offerings spo
                 WHERE spo.studio_id = $2
                   AND spo.price_list_id = plp.price_list_id
                   AND spo.product_id = p.id
                   AND spo.is_offered = 0
               )
             )
           ORDER BY p.category, p.name`,
          [album.priceListId, album.studioId || null]
        );

        const productSizes = await queryRows(
          `SELECT
              ps.id,
              ps.product_id as productId,
              ps.size_name as sizeName,
              COALESCE(spsso.price, ps.price) as price,
              ps.cost
           FROM product_sizes ps
           LEFT JOIN studio_price_list_size_overrides spsso
             ON spsso.product_size_id = ps.id
            AND spsso.price_list_id = ps.price_list_id
            AND spsso.studio_id = $2
           WHERE ps.price_list_id = $1
             AND (
               $2 IS NULL
               OR COALESCE(spsso.is_offered, 1) = 1
             )`,
          [album.priceListId, album.studioId || null]
        );

        const parsedProducts = products.map((product) => {
          const options = product.options ? JSON.parse(product.options) : null;
          const sizes = productSizes
            .filter((size) => Number(size.productId) === Number(product.id))
            .map((size) => {
              const decoded = decodeSizeName(size.sizeName);
              return {
                id: Number(size.id),
                name: decoded.name,
                width: decoded.width,
                height: decoded.height,
                price: Number(size.price) || 0,
                cost: Number(size.cost) || 0,
              };
            });

          return {
            id: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
            description: product.description,
            sizes,
            isActive: options?.isActive !== undefined ? !!options.isActive : true,
            popularity: Number(options?.popularity) || 0,
            isDigital: !!options?.isDigital,
          };
        });

        return res.json(parsedProducts.filter((product) => product.isActive !== false));
      }
    }

    const products = await queryRows('SELECT * FROM products ORDER BY order_index ASC, category, name');
    const parsedProducts = mapLegacyProducts(products);
    res.json(parsedProducts.filter((p) => p.isActive !== false));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product (requires active subscription)
router.post('/', adminRequired, requireActiveSubscription, async (req, res) => {
  try {
    const { name, category, price, description, options } = req.body;
    const result = await queryRow(`
      INSERT INTO products (name, category, price, description, options)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [name, category, price, description, options ? JSON.stringify(options) : null]);
    
    const product = await queryRow('SELECT * FROM products WHERE id = $1', [result.id]);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

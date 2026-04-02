
import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
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

// Get all products (studio-specific, super admin sees all)
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    let products;
    if (user?.role === 'super_admin') {
      products = await queryRows('SELECT * FROM products ORDER BY order_index ASC, category, name');
    } else {
      const studioId = user?.studio_id;
      if (!studioId) {
        return res.json([]); // No studio context, return nothing
      }
      products = await queryRows(
        'SELECT * FROM products WHERE studio_id = $1 ORDER BY order_index ASC, category, name',
        [studioId]
      );
    }
    const parsedProducts = mapLegacyProducts(products);
    res.json(parsedProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product order (admin only)
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

// Get active products (studio-specific, super admin sees all)
router.get('/active', async (req, res) => {
  try {
    const user = req.user;
    const isSuperAdmin = user?.role === 'super_admin';
    let studioId = user?.studio_id;
    const albumId = Number(req.query.albumId);
    if (Number.isInteger(albumId) && albumId > 0) {
      // Only allow super admin to see any album, others only their own
      const album = await queryRow(
        user?.role === 'super_admin' || !studioId
          ? `SELECT id, price_list_id as priceListId, studio_id as studioId FROM albums WHERE id = $1`
          : `SELECT id, price_list_id as priceListId, studio_id as studioId FROM albums WHERE id = $1 AND studio_id = $2`,
        user?.role === 'super_admin' || !studioId ? [albumId] : [albumId, studioId]
      );
      const effectiveStudioId = Number(studioId || album?.studioId || 0) || null;

      // ── NEW SYSTEM: studio_price_list_items (preferred) ──────────────────
      // Check if the album's studio has configured offerings in the new system
      if (effectiveStudioId) {
        // Prefer the album-linked studio price list when available.
        // (Important when a studio has multiple price lists with different offered items.)
        let studioPriceList = null;
        const albumLinkedStudioPriceListId = Number(album?.priceListId || 0) || null;
        if (albumLinkedStudioPriceListId) {
          studioPriceList = await queryRow(
            `SELECT TOP 1 id, super_price_list_id as superPriceListId
             FROM studio_price_lists
             WHERE id = $1 AND studio_id = $2`,
            [albumLinkedStudioPriceListId, effectiveStudioId]
          );
        }

        if (!studioPriceList?.id) {
          studioPriceList = await queryRow(
            `SELECT TOP 1 id, super_price_list_id as superPriceListId
             FROM studio_price_lists
             WHERE studio_id = $1
             ORDER BY is_default DESC, id ASC`,
            [effectiveStudioId]
          );
        }

        if (studioPriceList?.id) {
          const rows = await queryRows(
            `SELECT
               p.id as productId, p.name as productName, p.category, p.description, p.options,
               ps.id as sizeId, ps.size_name as sizeName, ps.cost as sizeCost,
               COALESCE(spi.price, ps.price) as sizePrice
             FROM studio_price_list_items spi
             JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
             JOIN product_sizes ps ON ps.id = spi.product_size_id
             JOIN products p ON p.id = ps.product_id
             LEFT JOIN super_price_list_items sspi
               ON sspi.super_price_list_id = spl.super_price_list_id
              AND sspi.product_size_id = spi.product_size_id
             WHERE spi.studio_price_list_id = $1
               AND spi.is_offered = 1
               AND COALESCE(sspi.is_active, 1) = 1
             ORDER BY p.category, p.name, ps.size_name`,
            [studioPriceList.id]
          );
          // Group rows by product
          const productMap = new Map();
          for (const row of rows) {
            const pid = Number(row.productId);
            if (!productMap.has(pid)) {
              const options = row.options ? JSON.parse(row.options) : null;
              productMap.set(pid, {
                id: pid,
                name: row.productName,
                category: row.category,
                description: row.description,
                price: 0,
                sizes: [],
                isActive: options?.isActive !== undefined ? !!options.isActive : true,
                popularity: Number(options?.popularity) || 0,
                isDigital: !!(options?.isDigital || String(row.productName || '').toLowerCase().includes('digital')),
              });
            }
            const decoded = decodeSizeName(row.sizeName);
            const sizePrice = Number(row.sizePrice) || 0;
            const entry = productMap.get(pid);
            entry.sizes.push({
              id: Number(row.sizeId),
              name: decoded.name,
              width: decoded.width,
              height: decoded.height,
              price: sizePrice,
              cost: Number(row.sizeCost) || 0,
            });
            // Product price = lowest offered size price
            if (entry.price === 0 || sizePrice < entry.price) {
              entry.price = sizePrice;
            }
          }
          const parsedProducts = Array.from(productMap.values()).filter((p) => p.isActive !== false);
          return res.json(parsedProducts);
        }
      }

      // ── OLD SYSTEM fallback: price_list_products + studio_product_offerings ─
      let priceListId = album?.priceListId;
      if ((!priceListId || priceListId === null) && effectiveStudioId) {
        const defaultPL = await queryRow(
          `SELECT TOP 1 id FROM price_lists WHERE studio_id = $1 AND is_default = 1`,
          [effectiveStudioId]
        );
        if (defaultPL?.id) {
          priceListId = defaultPL.id;
        } else {
          const anyPL = await queryRow(
            `SELECT TOP 1 id FROM price_lists WHERE studio_id = $1 ORDER BY id ASC`,
            [effectiveStudioId]
          );
          if (anyPL?.id) priceListId = anyPL.id;
        }
      }
      if (priceListId) {
        const products = await queryRows(
          isSuperAdmin || !effectiveStudioId
            ? `SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.options
                 FROM products p
                 INNER JOIN price_list_products plp ON plp.product_id = p.id
                 WHERE plp.price_list_id = $1
                 ORDER BY p.category, p.name`
            : `SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.options,
                        COALESCE(spo.price, p.price) as studio_price
                 FROM products p
                 INNER JOIN price_list_products plp ON plp.product_id = p.id
                 INNER JOIN studio_product_offerings spo
                   ON spo.product_id = p.id
                  AND spo.studio_id = $2
                  AND spo.price_list_id = $1
                  AND spo.is_offered = 1
                 WHERE plp.price_list_id = $1
                 ORDER BY p.category, p.name`,
          isSuperAdmin || !effectiveStudioId ? [priceListId] : [priceListId, effectiveStudioId]
        );
        const productSizes = await queryRows(
          isSuperAdmin || !effectiveStudioId
            ? `SELECT ps.id, ps.product_id as productId, ps.size_name as sizeName, ps.price, ps.cost
                 FROM product_sizes ps WHERE ps.price_list_id = $1`
            : `SELECT ps.id, ps.product_id as productId, ps.size_name as sizeName, ps.price, ps.cost
                 FROM product_sizes ps WHERE ps.price_list_id = $1`,
          [priceListId]
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
            price: Number(product.studio_price) || Number(product.price) || 0,
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
    // Fallback: only return products for this studio, or all for super admin
    let products;
    if (user?.role === 'super_admin') {
      products = await queryRows('SELECT * FROM products ORDER BY order_index ASC, category, name');
    } else {
      if (!studioId) {
        return res.json([]);
      }
      products = await queryRows('SELECT * FROM products WHERE studio_id = $1 ORDER BY order_index ASC, category, name', [studioId]);
    }
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

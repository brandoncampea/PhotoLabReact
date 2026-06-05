
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

const extractEditorConfig = (options) => {
  const direct = options || {};
  const nested = direct.whccEditor || direct.editor || {};

  const editorProviderRaw = String(
    direct.editorProvider ??
    direct.fulfillmentEditor ??
    nested.provider ??
    ''
  ).trim().toLowerCase();

  const whccEditorProductId = String(
    direct.whccEditorProductId ??
    direct.editorProductId ??
    direct.whcc_design_product_id ??
    nested.productId ??
    ''
  ).trim();

  const whccEditorDesignId = String(
    direct.whccEditorDesignId ??
    direct.editorDesignId ??
    direct.whcc_design_id ??
    nested.designId ??
    ''
  ).trim();

  const editorProvider = editorProviderRaw || (whccEditorProductId || whccEditorDesignId ? 'whcc' : null);
  const requiresWhccEditor =
    direct.useWhccEditor === true ||
    direct.requiresWhccEditor === true ||
    editorProvider === 'whcc' ||
    (!!whccEditorProductId && !!whccEditorDesignId);

  return {
    editorProvider,
    requiresWhccEditor,
    whccEditorProductId: whccEditorProductId || null,
    whccEditorDesignId: whccEditorDesignId || null,
  };
};

const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const normalizePositiveIntArray = (values) => {
  const arr = Array.isArray(values) ? values : [];
  return arr
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);
};

const normalizeNullableMoney = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
};

const buildVariantKey = (variant = {}) => {
  const id = Number(variant?.id || 0);
  if (Number.isInteger(id) && id > 0) return `id:${id}`;
  const uid = Number(variant?.whccProductUID || 0);
  const attrs = normalizePositiveIntArray(variant?.whccItemAttributeUIDs || []);
  const name = String(variant?.displayName || '').trim().toLowerCase();
  return `uid:${uid}|attrs:${attrs.join('-')}|name:${name}`;
};

const mapLegacyProducts = (products) => {
  return products.map((p) => {
    const opts = p.options ? JSON.parse(p.options) : null;
    const editor = extractEditorConfig(opts);
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
      isDigital: !!(opts?.isDigital || opts?.is_digital_only || opts?.digitalOnly || String(p.category || '').toLowerCase() === 'digital' || String(p.name || '').toLowerCase().includes('digital')),
      digitalDownloadScope: opts?.digitalDownloadScope ?? opts?.downloadScope ?? opts?.digital_download_scope ?? 'photo',
      digitalPricingMode: opts?.digitalPricingMode ?? opts?.pricingMode ?? opts?.digital_pricing_mode ?? null,
      superAdminPercentage: Number(opts?.superAdminPercentage ?? opts?.digitalCommissionPercent ?? opts?.super_admin_percentage ?? 0) || 0,
      ...editor,
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
    const requestedStudioId = Number(req.query.studioId);
    if (Number.isInteger(requestedStudioId) && requestedStudioId > 0) {
      if (isSuperAdmin) {
        studioId = requestedStudioId;
      } else if (!studioId || Number(studioId) !== requestedStudioId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const albumId = Number(req.query.albumId);

    const getOfferedProductsFromStudioPriceList = async (effectiveStudioId, preferredStudioPriceListId = null) => {
      if (!effectiveStudioId) return null;

      let studioPriceList = null;
      const preferredId = Number(preferredStudioPriceListId || 0) || null;
      if (preferredId) {
        studioPriceList = await queryRow(
          `SELECT TOP 1 id, super_price_list_id as superPriceListId
           FROM studio_price_lists
           WHERE id = $1 AND studio_id = $2`,
          [preferredId, effectiveStudioId]
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

      if (!studioPriceList?.id) {
        return null;
      }

      // Backfill missing studio rows for active source items so newly-added
      // super-admin products (including full-album digital products) are
      // available on customer album pages without manual refresh steps.
      const sourceItems = await queryRows(
        `SELECT product_size_id as productSizeId, base_cost as baseCost
         FROM super_price_list_items
         WHERE super_price_list_id = $1
           AND is_active = 1
           AND COALESCE(is_deleted, 0) = 0`,
        [studioPriceList.superPriceListId]
      );
      const studioItems = await queryRows(
        `SELECT id, product_size_id as productSizeId, is_deleted as isDeleted
         FROM studio_price_list_items
         WHERE studio_price_list_id = $1`,
        [studioPriceList.id]
      );
      const existingBySizeId = new Map(
        (studioItems || [])
          .map((row) => ({
            id: Number(row?.id || 0),
            productSizeId: Number(row?.productSizeId || 0),
            isDeleted: Number(row?.isDeleted || 0) === 1,
          }))
          .filter((row) => Number.isFinite(row.productSizeId) && row.productSizeId > 0)
          .map((row) => [row.productSizeId, row])
      );
      for (const source of sourceItems || []) {
        const sizeId = Number(source?.productSizeId);
        if (!Number.isFinite(sizeId) || sizeId <= 0) continue;
        const existing = existingBySizeId.get(sizeId);
        if (existing?.id) {
          if (existing.isDeleted) {
            await query(
              `UPDATE studio_price_list_items
               SET is_deleted = 0,
                   is_offered = 0,
                   price = COALESCE(price, $1)
               WHERE id = $2`,
              [Number(source?.baseCost) || 0, existing.id]
            );
            existingBySizeId.set(sizeId, { ...existing, isDeleted: false });
          }
          continue;
        }
        await query(
          `INSERT INTO studio_price_list_items (studio_price_list_id, product_size_id, price, is_offered)
           VALUES ($1, $2, $3, 0)`,
          [studioPriceList.id, sizeId, Number(source?.baseCost) || 0]
        );
        existingBySizeId.set(sizeId, { id: 0, productSizeId: sizeId, isDeleted: false });
      }

      const rows = await queryRows(
        `SELECT
           p.id as productId, p.name as productName, p.category, p.description, p.options,
           ps.id as sizeId, ps.size_name as sizeName, ps.cost as sizeCost,
           COALESCE(spi.price, ps.price) as sizePrice,
           spi.whcc_variants_json as whccVariantsJson,
           spi.is_recommended as isRecommended,
           spi.display_order as displayOrder,
           sspi.id as superItemId,
           sspi.crop_shape as sizeCropShape
         FROM studio_price_list_items spi
         JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
         JOIN product_sizes ps ON ps.id = spi.product_size_id
         JOIN products p ON p.id = ps.product_id
         LEFT JOIN super_price_list_items sspi
           ON sspi.super_price_list_id = spl.super_price_list_id
          AND sspi.product_size_id = spi.product_size_id
         WHERE spi.studio_price_list_id = $1
           AND spi.is_offered = 1
           AND COALESCE(spi.is_deleted, 0) = 0
           AND COALESCE(sspi.is_active, 1) = 1
           AND COALESCE(sspi.is_deleted, 0) = 0
         ORDER BY p.category, p.name, ps.size_name`,
        [studioPriceList.id]
      );

      const superItemIds = Array.from(new Set(
        (rows || [])
          .map((row) => Number(row?.superItemId || 0))
          .filter((value) => Number.isInteger(value) && value > 0)
      ));
      const variantsBySuperItemId = new Map();
      if (superItemIds.length > 0) {
        const placeholders = superItemIds.map((_, index) => `$${index + 1}`).join(', ');
        const variantRows = await queryRows(
          `SELECT v.super_price_list_item_id as superItemId,
                  v.id,
                  v.display_name as displayName,
                  v.whcc_product_uid as whccProductUID,
                  v.whcc_product_node_ids as whccProductNodeIDs,
                  v.whcc_item_attribute_uids as whccItemAttributeUIDs,
                  v.base_cost as baseCost,
              v.price,
                  v.is_default as isDefault,
                  v.is_active as isActive
           FROM super_price_list_item_whcc_variants v
           WHERE v.super_price_list_item_id IN (${placeholders})
           ORDER BY v.super_price_list_item_id ASC, v.is_default DESC, v.id ASC`,
          superItemIds
        );

        for (const variant of (variantRows || [])) {
          const superItemId = Number(variant?.superItemId || 0);
          if (!superItemId) continue;
          if (!variantsBySuperItemId.has(superItemId)) variantsBySuperItemId.set(superItemId, []);
          variantsBySuperItemId.get(superItemId).push({
            id: Number(variant?.id || 0) || null,
            displayName: String(variant?.displayName || ''),
            whccProductUID: Number(variant?.whccProductUID || 0) || null,
            whccProductNodeIDs: normalizePositiveIntArray(parseJsonArray(variant?.whccProductNodeIDs)),
            whccItemAttributeUIDs: normalizePositiveIntArray(parseJsonArray(variant?.whccItemAttributeUIDs)),
            baseCost: normalizeNullableMoney(variant?.baseCost),
            price: normalizeNullableMoney(variant?.price),
            isDefault: Boolean(variant?.isDefault),
            isActive: Boolean(variant?.isActive),
          });
        }
      }

      const productMap = new Map();
      for (const row of rows) {
        const pid = Number(row.productId);
        if (!productMap.has(pid)) {
          const options = row.options ? JSON.parse(row.options) : null;
          const editor = extractEditorConfig(options);
          const displayOrder = Number(row.displayOrder);
          productMap.set(pid, {
            id: pid,
            name: row.productName,
            category: row.category,
            description: row.description,
            price: 0,
            sizes: [],
            isActive: options?.isActive !== undefined ? !!options.isActive : true,
            popularity: Number(options?.popularity) || 0,
            isDigital: !!(options?.isDigital || options?.is_digital_only || options?.digitalOnly || String(row.category || '').toLowerCase() === 'digital' || String(row.productName || '').toLowerCase().includes('digital')),
            digitalDownloadScope: options?.digitalDownloadScope ?? options?.downloadScope ?? options?.digital_download_scope ?? 'photo',
            digitalPricingMode: options?.digitalPricingMode ?? options?.pricingMode ?? options?.digital_pricing_mode ?? null,
            superAdminPercentage: Number(options?.superAdminPercentage ?? options?.digitalCommissionPercent ?? options?.super_admin_percentage ?? 0) || 0,
            ...editor,
            studioIsRecommended: Boolean(Number(row.isRecommended)),
            studioDisplayOrder: Number.isFinite(displayOrder) ? displayOrder : null,
          });
        }
        const decoded = decodeSizeName(row.sizeName);
        const persistedVariants = variantsBySuperItemId.get(Number(row?.superItemId || 0)) || [];
        const studioOverrideVariants = parseJsonArray(row?.whccVariantsJson)
          .map((variant) => ({
            ...variant,
            studioPrice: variant?.studioPrice === null || variant?.studioPrice === undefined || variant?.studioPrice === ''
              ? null
              : Number(variant.studioPrice),
            studioMarkupPercent: variant?.studioMarkupPercent === null || variant?.studioMarkupPercent === undefined || variant?.studioMarkupPercent === ''
              ? null
              : Number(variant.studioMarkupPercent),
          }))
          .filter((variant) => Number.isFinite(Number(variant?.studioPrice)) || Number.isFinite(Number(variant?.studioMarkupPercent)));
        const overrideByKey = new Map(studioOverrideVariants.map((variant) => [buildVariantKey(variant), variant]));

        const mergedVariants = persistedVariants.map((variant) => {
          const matched = overrideByKey.get(buildVariantKey(variant));
          return {
            ...variant,
            studioPrice: Number.isFinite(Number(matched?.studioPrice))
              ? Number(Number(matched.studioPrice).toFixed(2))
              : null,
            studioMarkupPercent: Number.isFinite(Number(matched?.studioMarkupPercent))
              ? Number(Number(matched.studioMarkupPercent).toFixed(2))
              : null,
          };
        });

        const activeVariants = mergedVariants.filter((variant) => variant?.isActive !== false);
        const selectedVariant = activeVariants.find((variant) => variant?.isDefault && variant?.isActive)
          || activeVariants.find((variant) => variant?.isActive)
          || activeVariants[0]
          || null;
        const sizePrice = Number(
          selectedVariant?.studioPrice ??
          selectedVariant?.price ??
          row.sizePrice
        ) || 0;
        const entry = productMap.get(pid);
        const rowDisplayOrder = Number(row.displayOrder);
        const existingDisplayOrder = Number(entry.studioDisplayOrder);
        if (Number.isFinite(rowDisplayOrder)) {
          entry.studioDisplayOrder = Number.isFinite(existingDisplayOrder)
            ? Math.min(existingDisplayOrder, rowDisplayOrder)
            : rowDisplayOrder;
        }
        entry.studioIsRecommended = !!entry.studioIsRecommended || Boolean(Number(row.isRecommended));
        entry.sizes.push({
          id: Number(row.sizeId),
          name: decoded.name,
          width: decoded.width,
          height: decoded.height,
          price: sizePrice,
          cost: Number(row.sizeCost) || 0,
          whccVariants: activeVariants,
          cropShape: row.sizeCropShape === 'circle' ? 'circle' : 'rect',
        });
        if (entry.price === 0 || sizePrice < entry.price) {
          entry.price = sizePrice;
        }
      }

      return Array.from(productMap.values())
        .filter((p) => p.isActive !== false)
        .sort((a, b) => {
          const aOrder = Number(a?.studioDisplayOrder);
          const bOrder = Number(b?.studioDisplayOrder);
          const aHasOrder = Number.isFinite(aOrder);
          const bHasOrder = Number.isFinite(bOrder);
          if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
          if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

          const aRecommended = !!a?.studioIsRecommended;
          const bRecommended = !!b?.studioIsRecommended;
          if (aRecommended !== bRecommended) return aRecommended ? -1 : 1;

          const aCategory = String(a?.category || '');
          const bCategory = String(b?.category || '');
          const catCompare = aCategory.localeCompare(bCategory);
          if (catCompare !== 0) return catCompare;

          return String(a?.name || '').localeCompare(String(b?.name || ''));
        });
    };

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
      if (effectiveStudioId) {
        const parsedProducts = await getOfferedProductsFromStudioPriceList(effectiveStudioId, album?.priceListId || null);
        if (Array.isArray(parsedProducts)) {
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
          const editor = extractEditorConfig(options);
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
            isDigital: !!(options?.isDigital || options?.is_digital_only || options?.digitalOnly || String(product.category || '').toLowerCase() === 'digital' || String(product.name || '').toLowerCase().includes('digital')),
            digitalDownloadScope: options?.digitalDownloadScope ?? options?.downloadScope ?? options?.digital_download_scope ?? 'photo',
            digitalPricingMode: options?.digitalPricingMode ?? options?.pricingMode ?? options?.digital_pricing_mode ?? null,
            superAdminPercentage: Number(options?.superAdminPercentage ?? options?.digitalCommissionPercent ?? options?.super_admin_percentage ?? 0) || 0,
            ...editor,
          };
        });
        return res.json(parsedProducts.filter((product) => product.isActive !== false));
      }
    }

    // Studio-scoped offered products without album context
    if (studioId) {
      const parsedProducts = await getOfferedProductsFromStudioPriceList(Number(studioId), null);
      if (Array.isArray(parsedProducts)) {
        return res.json(parsedProducts);
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

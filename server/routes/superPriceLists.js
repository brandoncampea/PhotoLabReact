
import mssql from '../mssql.js';
import { getWhccCatalogMap, matchWhccProduct } from '../services/whccCatalog.js';
// Super Admin Price List Routes
import express from 'express';
import multer from 'multer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';
import { superAdminRequired } from '../middleware/auth.js';
const router = express.Router();


const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const categoryImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const ensureProductImagesTable = async () => {
  try {
    await mssql.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'super_price_list_product_images')
      CREATE TABLE super_price_list_product_images (
        id INT IDENTITY(1,1) PRIMARY KEY,
        super_price_list_id INT NOT NULL,
        product_id INT NOT NULL,
        image_url NVARCHAR(2048),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);
  } catch (_) { /* table may already exist */ }
};
// GET product images for a price list (by product_id)
router.get('/:id/product-images', async (req, res) => {
  const { id } = req.params;
  await ensureProductImagesTable();
  try {
    const rows = await mssql.query('SELECT product_id, image_url FROM super_price_list_product_images WHERE super_price_list_id = @p1', [id]);
    // Return as an object: { [product_id]: image_url }
    const result = {};
    rows.forEach(row => { result[row.product_id] = row.image_url; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload/replace a product image (by product_id)
router.post('/:id/product-image', imageUpload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { product_id } = req.body;
  if (!req.file || !product_id) return res.status(400).json({ error: 'image and product_id required' });
  await ensureProductImagesTable();
  try {
    const blobName = `price-list-products/${id}/${product_id}/${Date.now()}-${req.file.originalname}`;
    const imageUrl = await uploadImageBufferToAzure(req.file.buffer, blobName, req.file.mimetype);
    const existing = await mssql.query('SELECT TOP 1 id FROM super_price_list_product_images WHERE super_price_list_id = @p1 AND product_id = @p2', [id, product_id]);
    if (existing.length) {
      await mssql.query('UPDATE super_price_list_product_images SET image_url = @p1, updated_at = GETDATE() WHERE super_price_list_id = @p2 AND product_id = @p3', [imageUrl, id, product_id]);
    } else {
      await mssql.query('INSERT INTO super_price_list_product_images (super_price_list_id, product_id, image_url) VALUES (@p1, @p2, @p3)', [id, product_id, imageUrl]);
    }
    // Also update the products table so image is available everywhere
    await mssql.query('UPDATE products SET image_url = @p1 WHERE id = @p2', [imageUrl, product_id]);
    res.json({ success: true, image_url: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ensureCategoryImagesTable = async () => {
  try {
    await mssql.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'super_price_list_category_images')
      CREATE TABLE super_price_list_category_images (
        id INT IDENTITY(1,1) PRIMARY KEY,
        super_price_list_id INT NOT NULL,
        category_name NVARCHAR(255) NOT NULL,
        image_url NVARCHAR(2048),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);
  } catch (_) { /* table may already exist */ }
};

const ensureWhccVariantsTable = async () => {
  try {
    await mssql.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'super_price_list_item_whcc_variants')
      CREATE TABLE super_price_list_item_whcc_variants (
        id INT IDENTITY(1,1) PRIMARY KEY,
        super_price_list_item_id INT NOT NULL,
        display_name NVARCHAR(255) NULL,
        whcc_product_uid INT NOT NULL,
        whcc_product_node_ids NVARCHAR(MAX) NULL,
        whcc_item_attribute_uids NVARCHAR(MAX) NULL,
        base_cost DECIMAL(10,2) NULL,
        price DECIMAL(10,2) NULL,
        is_default BIT NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      )
    `);
    await mssql.query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_super_price_list_item_whcc_variants_item_id'
          AND object_id = OBJECT_ID('super_price_list_item_whcc_variants')
      )
      CREATE INDEX IX_super_price_list_item_whcc_variants_item_id
      ON super_price_list_item_whcc_variants (super_price_list_item_id)
    `);
    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'base_cost') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD base_cost DECIMAL(10,2) NULL
      END
    `);
    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'price') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD price DECIMAL(10,2) NULL
      END
    `);
  } catch (_) { /* table may already exist */ }
};

const ensureSuperPriceListItemWhccMetadataColumns = async () => {
  try {
    await mssql.query(`
      IF COL_LENGTH('super_price_list_items', 'whcc_product_uid') IS NULL
      BEGIN
        ALTER TABLE super_price_list_items ADD whcc_product_uid INT NULL
      END
      IF COL_LENGTH('super_price_list_items', 'whcc_product_node_id') IS NULL
      BEGIN
        ALTER TABLE super_price_list_items ADD whcc_product_node_id INT NULL
      END
      IF COL_LENGTH('super_price_list_items', 'whcc_item_attribute_uids') IS NULL
      BEGIN
        ALTER TABLE super_price_list_items ADD whcc_item_attribute_uids NVARCHAR(MAX) NULL
      END
      IF COL_LENGTH('super_price_list_items', 'whcc_attribute_categories') IS NULL
      BEGIN
        ALTER TABLE super_price_list_items ADD whcc_attribute_categories NVARCHAR(MAX) NULL
      END
      IF COL_LENGTH('super_price_list_items', 'crop_shape') IS NULL
      BEGIN
        ALTER TABLE super_price_list_items ADD crop_shape NVARCHAR(20) NULL
      END
      IF COL_LENGTH('super_price_list_items', 'is_deleted') IS NULL
      BEGIN
        ALTER TABLE super_price_list_items ADD is_deleted BIT NOT NULL DEFAULT 0
      END
      IF COL_LENGTH('studio_price_list_items', 'is_deleted') IS NULL
      BEGIN
        ALTER TABLE studio_price_list_items ADD is_deleted BIT NOT NULL DEFAULT 0
      END
    `);
  } catch (_) { /* columns may already exist */ }
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
    .map(v => Number(v))
    .filter(v => Number.isInteger(v) && v > 0);
};

const normalizeNullableMoney = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
};

const firstPositiveInt = (...values) => {
  for (const raw of values) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
};

const normalizeBaseProductName = (name) => {
  return String(name || '')
    .replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\s*$/i, '')
    .replace(/\s*[-–]\s*\d+(?:\.\d+)?x\d+(?:\.\d+)?\s*$/i, '')
    .replace(/\s*\(\d+(?:\.\d+)?x\d+(?:\.\d+)?\)\s*$/i, '')
    .trim()
    .toLowerCase();
};

const getCatalogProductUID = (product) => firstPositiveInt(
  product?.ProductCode,
  product?.ProductUID,
  product?.productUID,
  product?.ProductId,
  product?.productId,
  product?.Id,
  product?.id
);

const getCatalogProductNodeID = (product) => {
  const directNode = firstPositiveInt(
    product?.ProductNodeId,
    product?.ProductNodeID,
    product?.productNodeID,
    product?.DefaultProductNodeID,
    product?.defaultProductNodeID
  );
  if (directNode) return directNode;

  const nodes = [
    ...(Array.isArray(product?.ProductNodes) ? product.ProductNodes : []),
    ...(Array.isArray(product?.productNodes) ? product.productNodes : []),
  ];

  for (const node of nodes) {
    const nodeId = firstPositiveInt(
      node?.DP2NodeID,
      node?.dp2NodeID,
      node?.ProductNodeID,
      node?.productNodeID,
      node?.ProductNodeId,
      node?.productNodeId
    );
    if (nodeId) return nodeId;
  }

  return null;
};

const ATTRIBUTE_PRICE_ROUNDING_SUFFIXES = ['.00', '.05', '.25', '.50', '.95', '.99'];

const normalizeAttributePriceRoundingSuffix = (value) => {
  const normalized = String(value || '').trim();
  return ATTRIBUTE_PRICE_ROUNDING_SUFFIXES.includes(normalized) ? normalized : '.95';
};

const normalizeWhccAttributeCategories = (categories) => {
  if (!Array.isArray(categories)) return [];

  return categories
    .map((category) => {
      const id = Number(category?.id ?? category?.Id ?? 0) || null;
      const requiredLevel = Number(category?.requiredLevel ?? category?.RequiredLevel ?? -1);
      const sortOrder = Number(category?.sortOrder ?? category?.SortOrder ?? 0);
      const attributes = Array.isArray(category?.attributes ?? category?.Attributes)
        ? (category.attributes ?? category.Attributes)
            .map((attribute) => {
              const uid = Number(attribute?.uid ?? attribute?.Id ?? attribute?.AttributeUID ?? attribute?.id ?? 0);
              if (!Number.isInteger(uid) || uid <= 0) return null;
              return {
                uid,
                parentUid: Number(attribute?.parentUid ?? attribute?.ParentAttributeUID ?? 0) || 0,
                name: String(attribute?.name ?? attribute?.AttributeName ?? attribute?.DisplayName ?? '').trim(),
                sortOrder: Number(attribute?.sortOrder ?? attribute?.SortOrder ?? 0),
              };
            })
            .filter(Boolean)
            .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name)))
        : [];

      return {
        id,
        name: String(category?.name ?? category?.AttributeCategoryName ?? '').trim(),
        requiredLevel: Number.isFinite(requiredLevel) ? requiredLevel : -1,
        multValueAllowed: Boolean(category?.multValueAllowed ?? category?.MultValueAllowedFlag),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        attributes,
      };
    })
    .filter((category) => category.attributes.length > 0)
    .sort((a, b) => (a.requiredLevel - b.requiredLevel) || (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
};

const normalizeVariantDisplayName = (categoryName, attributeName) => {
  const rawName = String(attributeName || '').trim();
  const category = String(categoryName || '').trim().toLowerCase();
  if (!rawName) return '';
  if (category.includes('paper')) return rawName.replace(/\s+paper$/i, '').trim();
  if (category.includes('coating')) return rawName.replace(/\s+coating$/i, '').trim();
  if (category.includes('texture')) return rawName.replace(/\s+texture$/i, '').trim();
  return rawName;
};

const buildDefaultWhccVariantsFromCategories = ({ whccProductUID, whccProductNodeID, attributeCategories, baseCost, basePrice }) => {
  const productUID = Number(whccProductUID || 0);
  if (!Number.isInteger(productUID) || productUID <= 0) return [];

  const categories = normalizeWhccAttributeCategories(attributeCategories);
  if (!categories.length) return [];

  const attrLookup = new Map();
  for (const category of categories) {
    for (const attribute of category.attributes) {
      attrLookup.set(attribute.uid, { ...attribute, categoryName: category.name, requiredLevel: category.requiredLevel });
    }
  }

  const expandWithParents = (uid, acc = []) => {
    const numericUid = Number(uid || 0);
    if (!Number.isInteger(numericUid) || numericUid <= 0 || acc.includes(numericUid)) return acc;
    const attribute = attrLookup.get(numericUid);
    if (attribute?.parentUid) expandWithParents(attribute.parentUid, acc);
    if (!acc.includes(numericUid)) acc.push(numericUid);
    return acc;
  };

  const baseRequiredAttrUids = [];
  let variantChoiceCategory = null;

  for (const category of categories) {
    if (!Array.isArray(category.attributes) || !category.attributes.length) continue;
    if (category.requiredLevel >= 0) {
      if (!variantChoiceCategory && category.attributes.length > 1) {
        variantChoiceCategory = category;
        continue;
      }
      expandWithParents(category.attributes[0].uid, baseRequiredAttrUids);
    }
  }

  if (!variantChoiceCategory) {
    variantChoiceCategory = categories.find((category) => category.attributes.length > 1) || null;
  }

  const nodeIds = Number(whccProductNodeID || 0) > 0 ? [Number(whccProductNodeID)] : [];
  const normalizedBaseCost = normalizeNullableMoney(baseCost);
  const normalizedBasePrice = normalizeNullableMoney(basePrice);

  if (!variantChoiceCategory) {
    const fallbackAttrs = baseRequiredAttrUids.length
      ? [...baseRequiredAttrUids]
      : expandWithParents(categories[0].attributes[0].uid, []);
    return [{
      displayName: normalizeVariantDisplayName(categories[0].name, categories[0].attributes[0].name),
      whccProductUID: productUID,
      whccProductNodeIDs: nodeIds,
      whccItemAttributeUIDs: fallbackAttrs,
      baseCost: normalizedBaseCost,
      price: normalizedBasePrice,
      isDefault: true,
      isActive: true,
    }];
  }

  return variantChoiceCategory.attributes.map((attribute, index) => {
    const attrUids = [...baseRequiredAttrUids];
    expandWithParents(attribute.uid, attrUids);
    return {
      displayName: normalizeVariantDisplayName(variantChoiceCategory.name, attribute.name),
      whccProductUID: productUID,
      whccProductNodeIDs: nodeIds,
      whccItemAttributeUIDs: [...new Set(attrUids)],
      baseCost: normalizedBaseCost,
      price: normalizedBasePrice,
      isDefault: index === 0,
      isActive: true,
    };
  });
};

const hasMeaningfulWhccVariantRows = (variants) => {
  if (!Array.isArray(variants) || variants.length === 0) return false;
  return variants.some((variant) => {
    const displayName = String(variant?.displayName ?? variant?.display_name ?? '').trim();
    const attrUids = Array.isArray(variant?.whccItemAttributeUIDs)
      ? variant.whccItemAttributeUIDs
      : Array.isArray(variant?.whcc_item_attribute_uids)
      ? variant.whcc_item_attribute_uids
      : normalizePositiveIntArray(parseJsonArray(variant?.whcc_item_attribute_uids));
    return displayName.length > 0 || (Array.isArray(attrUids) && attrUids.length > 0);
  });
};

const shouldReplaceExistingWhccVariants = (existingVariants, generatedVariants) => {
  if (!Array.isArray(generatedVariants) || generatedVariants.length === 0) return false;
  return true;
};

const mergeMissingWhccOptions = (optionsJson, { whccProductUID, whccProductNodeID, rawAttrUIDs, whccAttributeCostMultiplierPercent, whccAttributeCategories }) => {
  let existing = {};
  try {
    existing = optionsJson ? JSON.parse(optionsJson) : {};
  } catch (_) {
    existing = {};
  }

  const next = { ...existing };
  let changed = false;

  if (whccProductUID) {
    const existingUID = Number(existing?.whccProductUID || 0) || null;
    if (existingUID !== whccProductUID) {
      next.whccProductUID = whccProductUID;
      changed = true;
    }
  }
  if (whccProductNodeID) {
    const existingNode = Number(existing?.whccProductNodeID || 0) || null;
    if (existingNode !== whccProductNodeID) {
      next.whccProductNodeID = whccProductNodeID;
      changed = true;
    }
  }
  if (rawAttrUIDs && rawAttrUIDs.length) {
    const existingAttrs = Array.isArray(existing?.whccItemAttributeUIDs)
      ? existing.whccItemAttributeUIDs.map(Number).filter(v => Number.isInteger(v) && v > 0)
      : [];
    const normalizedIncoming = rawAttrUIDs.map(Number).filter(v => Number.isInteger(v) && v > 0);
    const sameLength = existingAttrs.length === normalizedIncoming.length;
    const sameValues = sameLength && existingAttrs.every((v, i) => v === normalizedIncoming[i]);
    if (!sameValues) {
      next.whccItemAttributeUIDs = normalizedIncoming;
      changed = true;
    }
  }
  if (whccAttributeCostMultiplierPercent !== undefined) {
    const normalizedMultiplier = Number(whccAttributeCostMultiplierPercent);
    const safeMultiplier = Number.isFinite(normalizedMultiplier) ? normalizedMultiplier : 0;
    const existingMultiplier = Number(existing?.whccAttributeCostMultiplierPercent ?? 0);
    if (existingMultiplier !== safeMultiplier) {
      next.whccAttributeCostMultiplierPercent = safeMultiplier;
      changed = true;
    }
  }
  if (Array.isArray(whccAttributeCategories) && whccAttributeCategories.length) {
    const normalizedIncomingCategories = normalizeWhccAttributeCategories(whccAttributeCategories);
    const existingCategories = normalizeWhccAttributeCategories(existing?.whccAttributeCategories);
    if (JSON.stringify(existingCategories) !== JSON.stringify(normalizedIncomingCategories)) {
      next.whccAttributeCategories = normalizedIncomingCategories;
      changed = true;
    }
  }

  return { changed, json: JSON.stringify(next) };
};

const parseJsonObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
};

const buildWhccVariantPayloadFromRow = (row) => ({
  id: Number(row.id || 0) || null,
  displayName: String(row.display_name || ''),
  whccProductUID: Number(row.whcc_product_uid || 0) || null,
  whccProductNodeIDs: normalizePositiveIntArray(parseJsonArray(row.whcc_product_node_ids)),
  whccItemAttributeUIDs: normalizePositiveIntArray(parseJsonArray(row.whcc_item_attribute_uids)),
  baseCost: normalizeNullableMoney(row.base_cost),
  price: normalizeNullableMoney(row.price),
  isDefault: Boolean(row.is_default),
  isActive: Boolean(row.is_active),
});

const pickPreferredWhccVariant = (variants) => {
  const normalized = Array.isArray(variants) ? variants : [];
  if (!normalized.length) return null;
  return normalized.find((v) => v.isDefault && v.isActive)
    || normalized.find((v) => v.isActive)
    || normalized.find((v) => v.isDefault)
    || normalized[0]
    || null;
};

const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
};

const loadWhccCsvCostMap = async () => {
  const csvPath = path.resolve(process.cwd(), 'whcc_all_products_full.csv');
  const raw = await readFile(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();

  const header = parseCsvLine(lines[0]).map((h) => String(h || '').trim().toLowerCase());
  const codeIdx = header.indexOf('product code');
  const priceIdx = header.indexOf('price');
  if (codeIdx < 0 || priceIdx < 0) {
    throw new Error('CSV missing required headers: Product Code, Price');
  }

  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const code = Number(cols[codeIdx]);
    const price = Number(cols[priceIdx]);
    if (Number.isInteger(code) && Number.isFinite(price)) {
      map.set(code, price);
    }
  }
  return map;
};

// POST import multiple products/sizes to super price list (no digital restriction)
router.post('/:id/import-items', async (req, res) => {
  const { id } = req.params;
  const items = req.body.items;
  // ...existing code...
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' });
  try {
    await ensureWhccVariantsTable();
    await ensureSuperPriceListItemWhccMetadataColumns();
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errorSamples = [];
    const mappingSummary = {
      resolvedUidCount: 0,
      resolvedNodeIdCount: 0,
      appliedUidCount: 0,
      appliedNodeIdCount: 0,
      missingUidCount: 0,
      missingNodeIdCount: 0,
    };

    // Fetch WHCC catalog once for all items
    let whccCatalogMap = null;
    const whccNodeToUidMap = new Map();
    const whccUidToNodeMap = new Map();
    try {
      whccCatalogMap = await getWhccCatalogMap();
      for (const row of whccCatalogMap.values()) {
        const uid = getCatalogProductUID(row);
        const node = getCatalogProductNodeID(row);
        if (uid && node) {
          if (!whccNodeToUidMap.has(node)) whccNodeToUidMap.set(node, uid);
          if (!whccUidToNodeMap.has(uid)) whccUidToNodeMap.set(uid, node);
        }
      }
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch WHCC catalog from API', details: err?.message || String(err) });
    }

    // Fetch linked studio price list IDs once — used to propagate new/updated items
    const linkedStudioRows = await mssql.query('SELECT id FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    const linkedStudioIds = linkedStudioRows.map(r => Number(r.id)).filter(v => Number.isInteger(v) && v > 0);

    // Bridge price list for creating local product_sizes rows used by super price list items
    let bridgePriceListId = null;
    try {
      const bridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id ASC", ['WHCC Import Bridge']);
      bridgePriceListId = bridge[0]?.id || null;
      if (!bridgePriceListId) {
        await mssql.query('INSERT INTO price_lists (studio_id, name, description) VALUES (NULL, @p1, @p2)', ['WHCC Import Bridge', 'System bridge price list for WHCC imports']);
        const createdBridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id DESC", ['WHCC Import Bridge']);
        bridgePriceListId = createdBridge[0]?.id || null;
      }
    } catch (bridgeErr) {
      // If this fails, item-level error handling below will surface details.
    }

    for (const item of items) {
      try {
        let { product_size_id, base_cost, markup_percent } = item;
        let resolvedProductSizeId = Number(product_size_id || 0);
        const productName = (item.product_name || item.name || item.display_name || `WHCC Product ${resolvedProductSizeId || ''}`).toString().trim();
        const rawSizeName = item.size_name ?? item.size;
        const sizeName = (rawSizeName === undefined || rawSizeName === null)
          ? productName
          : String(rawSizeName).trim();
        const category = (item.category || 'whcc').toString().trim();
        const description = (item.description || 'Imported from WHCC').toString();

        // Prefer explicit WHCC mapping sent by UI; only fallback to live catalog if missing.
        let whccProductUID = firstPositiveInt(
          item.whccProductUID,
          item.whcc_product_uid,
          item.whccEditorProductId,
          item.productUID,
          item.ProductUID,
          item.ProductCode
        );
        let whccProductNodeID = firstPositiveInt(
          item.whccProductNodeID,
          item.whcc_product_node_id,
          item.whccEditorProductNodeId,
          item.ProductNodeId,
          item.ProductNodeID,
          item.productNodeID
        );
        let whccProductMatch = null;
        if (!whccProductUID || !whccProductNodeID) {
          try {
            const normalizeCatalogKey = (value) => String(value || '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            const normalizedProduct = normalizeCatalogKey(productName);
            const normalizedSize = normalizeCatalogKey(sizeName);
            const strippedProduct = normalizeCatalogKey(
              sizeName && productName.toLowerCase() !== sizeName.toLowerCase()
                ? productName.replace(sizeName, '').trim()
                : productName
            );

            const candidateKeys = [
              `${strippedProduct}|${normalizedSize}`,
              `${normalizedProduct}|${normalizedSize}`,
              `${normalizedProduct}|`,
              `${strippedProduct}|`,
            ].filter((key, idx, arr) => key && arr.indexOf(key) === idx);

            for (const key of candidateKeys) {
              if (whccCatalogMap.has(key)) {
                whccProductMatch = whccCatalogMap.get(key);
                break;
              }
            }

            if (!whccProductMatch) {
              whccProductMatch = await matchWhccProduct({ productName, sizeName });
            }
          } catch (_) {}
          if (whccProductMatch) {
            if (!whccProductUID) {
              whccProductUID = getCatalogProductUID(whccProductMatch);
            }
            if (!whccProductNodeID) {
              whccProductNodeID = getCatalogProductNodeID(whccProductMatch);
            }
          }
        }

        // Final reconciliation from catalog lookup maps.
        if (!whccProductUID && whccProductNodeID) {
          whccProductUID = Number(whccNodeToUidMap.get(whccProductNodeID) || 0) || null;
        }
        if (!whccProductNodeID && whccProductUID) {
          whccProductNodeID = Number(whccUidToNodeMap.get(whccProductUID) || 0) || null;
        }
        const whccAttributeCostMultiplierPercent = Number(item.whccAttributeCostMultiplierPercent ?? 0) || 0;
        const whccAttributeCategories = normalizeWhccAttributeCategories(item.whccAttributeCategories);
        const rawAttrUIDs = Array.isArray(item.whccItemAttributeUIDs)
          ? item.whccItemAttributeUIDs.map(Number).filter(v => Number.isInteger(v) && v > 0)
          : null;
        if (whccProductUID) mappingSummary.resolvedUidCount++;
        else mappingSummary.missingUidCount++;
        if (whccProductNodeID) mappingSummary.resolvedNodeIdCount++;
        else mappingSummary.missingNodeIdCount++;
        const generatedWhccVariants = buildDefaultWhccVariantsFromCategories({
          whccProductUID,
          whccProductNodeID,
          attributeCategories: whccAttributeCategories,
          baseCost: base_cost ?? null,
          basePrice: base_cost ?? null,
        });
        // Build the options JSON that submitOrderToWhcc() will use to resolve correct WHCC IDs
        const whccOptionsJson = (whccProductUID || whccProductNodeID || (rawAttrUIDs && rawAttrUIDs.length) || whccAttributeCostMultiplierPercent || whccAttributeCategories.length)
          ? JSON.stringify({
              ...(whccProductUID ? { whccProductUID } : {}),
              ...(whccProductNodeID ? { whccProductNodeID } : {}),
              ...(rawAttrUIDs && rawAttrUIDs.length ? { whccItemAttributeUIDs: rawAttrUIDs } : {}),
              ...(whccAttributeCostMultiplierPercent ? { whccAttributeCostMultiplierPercent } : {}),
              ...(whccAttributeCategories.length ? { whccAttributeCategories } : {}),
            })
          : null;

        // If product_size_id is not a real local product_sizes.id, first try to match an existing list row by product/category/size.
        let sizeExists = [];
        if (resolvedProductSizeId > 0) {
          sizeExists = await mssql.query('SELECT TOP 1 id FROM product_sizes WHERE id = @p1', [resolvedProductSizeId]);
          // If caller passed an external/non-local ID, treat it as unresolved and continue
          // through name/category matching or product/size creation.
          if (!sizeExists.length) {
            resolvedProductSizeId = 0;
          }
        }

        if (!sizeExists.length && productName && sizeName) {
          // Search without category filter so we match items that exist under a different category.
          const matchedExistingRow = await mssql.query(`
            SELECT TOP 1 spi.product_size_id, p.id AS product_id, p.options AS product_options, p.category AS existing_category
            FROM super_price_list_items spi
            JOIN product_sizes ps ON spi.product_size_id = ps.id
            JOIN products p ON ps.product_id = p.id
            WHERE spi.super_price_list_id = @p1
              AND LOWER(LTRIM(RTRIM(p.name))) = LOWER(LTRIM(RTRIM(@p2)))
              AND LOWER(LTRIM(RTRIM(ps.size_name))) = LOWER(LTRIM(RTRIM(@p3)))
              AND spi.is_deleted = 0
            ORDER BY CASE WHEN LOWER(LTRIM(RTRIM(p.category))) = LOWER(LTRIM(RTRIM(@p4))) THEN 0 ELSE 1 END, spi.id
          `, [id, productName, sizeName, category]);

          if (matchedExistingRow.length) {
            resolvedProductSizeId = Number(matchedExistingRow[0].product_size_id || 0);
            // If the product is in a different category, move it to the imported category.
            if (
              matchedExistingRow[0]?.product_id &&
              String(matchedExistingRow[0]?.existing_category || '').toLowerCase() !== String(category || '').toLowerCase()
            ) {
              await mssql.query('UPDATE products SET category = @p1 WHERE id = @p2', [category, matchedExistingRow[0].product_id]);
            }
            if (matchedExistingRow[0]?.product_id && whccOptionsJson) {
              const mergedOptions = mergeMissingWhccOptions(matchedExistingRow[0]?.product_options, { whccProductUID, whccProductNodeID, rawAttrUIDs, whccAttributeCostMultiplierPercent, whccAttributeCategories });
              if (mergedOptions.changed) {
                await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [mergedOptions.json, matchedExistingRow[0].product_id]);
              }
            }
          }
        }

        if (!sizeExists.length && !resolvedProductSizeId) {
          // Find or create product — check with correct category first, then any category.
          let productRows = await mssql.query('SELECT TOP 1 id, options, category FROM products WHERE name = @p1 AND category = @p2', [productName, category]);
          if (!productRows.length) {
            // Look for the same product name in a different category within this super list.
            const crossCatRows = await mssql.query(`
              SELECT TOP 1 p.id, p.options, p.category
              FROM products p
              INNER JOIN product_sizes ps ON ps.product_id = p.id
              INNER JOIN super_price_list_items spi ON spi.product_size_id = ps.id
              WHERE spi.super_price_list_id = @p1
                AND LOWER(LTRIM(RTRIM(p.name))) = LOWER(LTRIM(RTRIM(@p2)))
              ORDER BY p.id DESC
            `, [id, productName]);
            if (crossCatRows.length) {
              // Move the existing product to the imported category instead of duplicating it.
              await mssql.query('UPDATE products SET category = @p1 WHERE id = @p2', [category, crossCatRows[0].id]);
              productRows = [{ ...crossCatRows[0], category }];
            }
          }
          let productId = productRows[0]?.id;
          if (!productId) {
            // Try schema with price/cost first (MSSQL bootstrap table), then fallback schema with is_digital.
            try {
              await mssql.query(
                'INSERT INTO products (name, category, price, description, cost, options) VALUES (@p1, @p2, @p3, @p4, @p5, @p6)',
                [productName, category, Number(base_cost ?? 0), description, Number(base_cost ?? 0), whccOptionsJson]
              );
            } catch (insertErr1) {
              await mssql.query('INSERT INTO products (name, category, is_digital, description) VALUES (@p1, @p2, 0, @p3)', [productName, category, description]);
            }
            productRows = await mssql.query('SELECT TOP 1 id, options FROM products WHERE name = @p1 AND category = @p2 ORDER BY id DESC', [productName, category]);
            productId = productRows[0]?.id;
          }

          if (productId && whccOptionsJson) {
            try {
              const mergedOptions = mergeMissingWhccOptions(productRows[0]?.options, { whccProductUID, whccProductNodeID, rawAttrUIDs, whccAttributeCostMultiplierPercent, whccAttributeCategories });
              if (mergedOptions.changed) {
                await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [mergedOptions.json, productId]);
              }
            } catch (_) { /* non-fatal — catalog match will still work as fallback */ }
          }

          if (!productId) {
            skippedCount++;
            continue;
          }

          // Find or create product size (schema: product_sizes has price_list_id + size_name)
          let sizeRows = await mssql.query(
            'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
            [bridgePriceListId, productId, sizeName]
          );
          if (!sizeRows.length) {
            await mssql.query(
              'INSERT INTO product_sizes (price_list_id, product_id, size_name, price, cost) VALUES (@p1, @p2, @p3, @p4, @p5)',
              [bridgePriceListId, productId, sizeName, Number(base_cost ?? 0), Number(base_cost ?? 0)]
            );
            sizeRows = await mssql.query(
              'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
              [bridgePriceListId, productId, sizeName]
            );
          }
          resolvedProductSizeId = Number(sizeRows[0]?.id || 0);
        }

        if (!resolvedProductSizeId) {
          skippedCount++;
          continue;
        }

        // Upsert super price list item but only fill missing information on existing rows.
        const existing = await mssql.query(`
          SELECT TOP 1 spi.id, spi.base_cost, spi.markup_percent, spi.is_active, spi.is_deleted,
                 spi.whcc_product_uid AS existing_whcc_product_uid,
                 spi.whcc_product_node_id AS existing_whcc_product_node_id,
                 p.id AS product_id, p.options AS product_options
          FROM super_price_list_items spi
          JOIN product_sizes ps ON spi.product_size_id = ps.id
          JOIN products p ON ps.product_id = p.id
          WHERE spi.super_price_list_id = @p1 AND spi.product_size_id = @p2
        `, [id, resolvedProductSizeId]);

        if (existing.length) {
          const updateParts = [];
          const updateParams = [];
          // Restore soft-deleted items on re-import
          if (existing[0].is_deleted) {
            updateParts.push('is_deleted = 0');
          }
          // Always update these fields with the latest import value
          if (base_cost !== null && base_cost !== undefined) {
            updateParams.push(base_cost);
            updateParts.push(`base_cost = @p${updateParams.length}`);
          }
          if (markup_percent !== null && markup_percent !== undefined) {
            updateParams.push(markup_percent);
            updateParts.push(`markup_percent = @p${updateParams.length}`);
          }
          const existingWhccUid = Number(existing[0]?.existing_whcc_product_uid || 0) || null;
          const existingWhccNode = Number(existing[0]?.existing_whcc_product_node_id || 0) || null;
          const nextWhccUid = whccProductUID || existingWhccUid || null;
          const nextWhccNode = whccProductNodeID || existingWhccNode || null;

          updateParams.push(nextWhccUid);
          updateParts.push(`whcc_product_uid = @p${updateParams.length}`);
          updateParams.push(nextWhccNode);
          updateParts.push(`whcc_product_node_id = @p${updateParams.length}`);
          updateParams.push(rawAttrUIDs && rawAttrUIDs.length ? JSON.stringify(rawAttrUIDs) : null);
          updateParts.push(`whcc_item_attribute_uids = @p${updateParams.length}`);
          updateParams.push(whccAttributeCategories.length ? JSON.stringify(whccAttributeCategories) : null);
          updateParts.push(`whcc_attribute_categories = @p${updateParams.length}`);

          let optionsChanged = false;
          if (existing[0]?.product_id && whccOptionsJson) {
            const mergedOptions = mergeMissingWhccOptions(existing[0]?.product_options, { whccProductUID, whccProductNodeID, rawAttrUIDs, whccAttributeCostMultiplierPercent, whccAttributeCategories });
            if (mergedOptions.changed) {
              await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [mergedOptions.json, existing[0].product_id]);
              optionsChanged = true;
            }
          }

          if (generatedWhccVariants.length) {
            await ensureWhccVariantsTable();
            const existingVariantRows = await mssql.query(
              `SELECT id,
                      display_name,
                      whcc_product_uid,
                      whcc_product_node_ids,
                      whcc_item_attribute_uids,
                      base_cost,
                      price,
                      is_default,
                      is_active
               FROM super_price_list_item_whcc_variants
               WHERE super_price_list_item_id = @p1
               ORDER BY is_default DESC, id ASC`,
              [existing[0].id]
            );
            const normalizedExistingVariants = (existingVariantRows || []).map(buildWhccVariantPayloadFromRow);
            if (shouldReplaceExistingWhccVariants(normalizedExistingVariants, generatedWhccVariants)) {
              if (normalizedExistingVariants.length) {
                await mssql.query(
                  'DELETE FROM super_price_list_item_whcc_variants WHERE super_price_list_item_id = @p1',
                  [existing[0].id]
                );
              }
              for (const variant of generatedWhccVariants) {
                await mssql.query(
                  `INSERT INTO super_price_list_item_whcc_variants (
                    super_price_list_item_id, display_name, whcc_product_uid, whcc_product_node_ids,
                    whcc_item_attribute_uids, base_cost, price, is_default, is_active
                  ) VALUES (
                    @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9
                  )`,
                  [
                    existing[0].id,
                    variant.displayName || '',
                    variant.whccProductUID,
                    JSON.stringify(Array.isArray(variant.whccProductNodeIDs) ? variant.whccProductNodeIDs : []),
                    JSON.stringify(Array.isArray(variant.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs : []),
                    variant.baseCost ?? null,
                    variant.price ?? null,
                    variant.isDefault ? 1 : 0,
                    variant.isActive === false ? 0 : 1,
                  ]
                );
              }
              optionsChanged = true;
            }
          }

          if (updateParts.length) {
            updateParams.push(existing[0].id);
            await mssql.query(`UPDATE super_price_list_items SET ${updateParts.join(', ')} WHERE id = @p${updateParams.length}`, updateParams);
            if (nextWhccUid) mappingSummary.appliedUidCount++;
            if (nextWhccNode) mappingSummary.appliedNodeIdCount++;
            // Propagate base_cost fill-in to linked studio items that still have no price set
            if (base_cost !== null && base_cost !== undefined && linkedStudioIds.length) {
              for (const studioListId of linkedStudioIds) {
                await mssql.query(
                  'UPDATE studio_price_list_items SET price = @p1 WHERE studio_price_list_id = @p2 AND product_size_id = @p3 AND price IS NULL',
                  [base_cost, studioListId, resolvedProductSizeId]
                );
              }
            }
          }

          if (updateParts.length || optionsChanged) updatedCount++;
          else skippedCount++;
        } else {
          await mssql.query(
            `INSERT INTO super_price_list_items (
              super_price_list_id, product_size_id, base_cost, markup_percent, is_active,
              whcc_product_uid, whcc_product_node_id, whcc_item_attribute_uids, whcc_attribute_categories
            ) VALUES (
              @p1, @p2, @p3, @p4, 1,
              @p5, @p6, @p7, @p8
            )`,
            [
              id,
              resolvedProductSizeId,
              base_cost ?? null,
              markup_percent ?? null,
              whccProductUID,
              whccProductNodeID,
              rawAttrUIDs && rawAttrUIDs.length ? JSON.stringify(rawAttrUIDs) : null,
              whccAttributeCategories.length ? JSON.stringify(whccAttributeCategories) : null,
            ]
          );
          const createdItem = await mssql.query(
            'SELECT TOP 1 id FROM super_price_list_items WHERE super_price_list_id = @p1 AND product_size_id = @p2 ORDER BY id DESC',
            [id, resolvedProductSizeId]
          );
          const createdItemId = Number(createdItem[0]?.id || 0);
          if (createdItemId) {
            if (whccProductUID) mappingSummary.appliedUidCount++;
            if (whccProductNodeID) mappingSummary.appliedNodeIdCount++;
          }
          if (createdItemId && generatedWhccVariants.length) {
            await ensureWhccVariantsTable();
            for (const variant of generatedWhccVariants) {
              await mssql.query(
                `INSERT INTO super_price_list_item_whcc_variants (
                  super_price_list_item_id, display_name, whcc_product_uid, whcc_product_node_ids,
                  whcc_item_attribute_uids, base_cost, price, is_default, is_active
                ) VALUES (
                  @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9
                )`,
                [
                  createdItemId,
                  variant.displayName || '',
                  variant.whccProductUID,
                  JSON.stringify(Array.isArray(variant.whccProductNodeIDs) ? variant.whccProductNodeIDs : []),
                  JSON.stringify(Array.isArray(variant.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs : []),
                  variant.baseCost ?? null,
                  variant.price ?? null,
                  variant.isDefault ? 1 : 0,
                  variant.isActive === false ? 0 : 1,
                ]
              );
            }
          }
          importedCount++;
          // Propagate new item to each linked studio price list (skip if already present)
          if (linkedStudioIds.length) {
            for (const studioListId of linkedStudioIds) {
              const alreadyPresent = await mssql.query(
                'SELECT TOP 1 id FROM studio_price_list_items WHERE studio_price_list_id = @p1 AND product_size_id = @p2',
                [studioListId, resolvedProductSizeId]
              );
              if (!alreadyPresent.length) {
                await mssql.query(
                  'INSERT INTO studio_price_list_items (studio_price_list_id, product_size_id, price, is_offered) VALUES (@p1, @p2, @p3, 1)',
                  [studioListId, resolvedProductSizeId, base_cost ?? null]
                );
              }
            }
          }
        }
      } catch (itemErr) {
        skippedCount++;
        if (errorSamples.length < 10) {
          errorSamples.push({
            product_size_id: item?.product_size_id,
            product_name: item?.product_name,
            size_name: item?.size_name,
            error: itemErr?.originalError?.info?.message || itemErr?.message || String(itemErr),
          });
        }
      }
    }

    // Auto-backfill missing UIDs from raw WHCC catalog + variants + node maps
    try {
      const uidByNode = new Map();

      // Prefer raw catalog products to avoid flattening gaps on certain product families.
      const consumerKey = String(process.env.WHCC_CONSUMER_KEY || '').trim();
      const consumerSecret = String(process.env.WHCC_CONSUMER_SECRET || '').trim();
      const isSandbox = process.env.WHCC_SANDBOX === 'true';
      const baseUrl = isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';

      if (consumerKey && consumerSecret) {
        const axios = (await import('axios')).default;
        const tokenResponse = await axios.get(`${baseUrl}/api/AccessToken`, {
          params: {
            grant_type: 'consumer_credentials',
            consumer_key: consumerKey,
            consumer_secret: consumerSecret,
          },
          headers: { Accept: 'application/json' },
        });

        const token = tokenResponse.data?.Token || tokenResponse.data?.token || null;
        if (token) {
          const catalogResponse = await axios.get(`${baseUrl}/api/catalog`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          });
          const categories = Array.isArray(catalogResponse.data?.Categories) ? catalogResponse.data.Categories : [];
          const products = categories.flatMap((c) => (Array.isArray(c?.ProductList) ? c.ProductList : []));
          for (const product of products) {
            const uid = getCatalogProductUID(product);
            const node = getCatalogProductNodeID(product);
            if (uid && node && !uidByNode.has(node)) {
              uidByNode.set(node, uid);
            }
          }
        }
      }

      // Fallback: include flattened-map rows as a secondary source.
      if (!uidByNode.size) {
        const whccCatalogMap = await getWhccCatalogMap();
        for (const row of whccCatalogMap.values()) {
          const uid = getCatalogProductUID(row);
          const node = getCatalogProductNodeID(row);
          if (uid && node && !uidByNode.has(node)) {
            uidByNode.set(node, uid);
          }
        }
      }

      const variantRows = await mssql.query(`
        SELECT v.super_price_list_item_id, v.whcc_product_uid, v.is_default, v.id
        FROM super_price_list_item_whcc_variants v
        INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
        WHERE spi.super_price_list_id = @p1
        ORDER BY v.super_price_list_item_id ASC, v.is_default DESC, v.id ASC
      `, [id]);

      const variantUidByItemId = new Map();
      for (const row of variantRows) {
        const itemId = Number(row.super_price_list_item_id || 0);
        const uid = Number(row.whcc_product_uid || 0);
        if (!itemId || !uid) continue;
        if (!variantUidByItemId.has(itemId)) variantUidByItemId.set(itemId, uid);
      }

      const itemRows = await mssql.query(`
        SELECT spi.id,
               spi.whcc_product_uid,
               spi.whcc_product_node_id,
               p.id as product_id,
               p.options as product_options
        FROM super_price_list_items spi
        JOIN product_sizes ps ON spi.product_size_id = ps.id
        JOIN products p ON ps.product_id = p.id
        WHERE spi.super_price_list_id = @p1
          AND spi.is_deleted = 0
      `, [id]);

      let backfillCount = 0;
      for (const row of itemRows) {
        const itemId = Number(row.id || 0);
        const existingUid = Number(row.whcc_product_uid || 0);
        if (existingUid > 0) continue;

        let options = {};
        try {
          options = row.product_options ? JSON.parse(row.product_options) : {};
        } catch (_) {
          options = {};
        }

        const node = firstPositiveInt(row.whcc_product_node_id, options?.whccProductNodeID, options?.productNodeID);
        const repairedUid = firstPositiveInt(
          options?.whccProductUID,
          options?.productUID,
          variantUidByItemId.get(itemId),
          uidByNode.get(node)
        );

        if (!(repairedUid > 0)) continue;

        await mssql.query('UPDATE super_price_list_items SET whcc_product_uid = @p1 WHERE id = @p2', [repairedUid, itemId]);
        backfillCount++;

        const optionsUid = Number(options?.whccProductUID || 0);
        if (optionsUid !== repairedUid && Number(row.product_id || 0) > 0) {
          const nextOptions = {
            ...(options || {}),
            whccProductUID: repairedUid,
            ...(node > 0 ? { whccProductNodeID: node } : {}),
          };
          await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(nextOptions), row.product_id]);
        }
      }

      mappingSummary.autoBackfillCount = backfillCount;
    } catch (backfillErr) {
      console.error('[SuperPriceLists] Auto-backfill error:', backfillErr?.message || String(backfillErr));
    }

    // ...existing code...
    res.status(201).json({ success: true, importedCount, updatedCount, skippedCount, errorSamples, mappingSummary });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import items to super price list', details: err?.message || String(err) });
  }
});

// POST sync costs from whcc_all_products_full.csv based on stored WHCC IDs
router.post('/:id/sync-whcc-costs', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const onlyIfZero = req.body?.onlyIfZero === true;
    const csvCostMap = await loadWhccCsvCostMap();
    if (!csvCostMap.size) {
      return res.status(400).json({ error: 'No WHCC cost rows found in whcc_all_products_full.csv' });
    }

    const linkedStudioRows = await mssql.query('SELECT id FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    const linkedStudioIds = linkedStudioRows.map(r => Number(r.id)).filter(v => Number.isInteger(v) && v > 0);

    const rows = await mssql.query(`
      SELECT spi.id, spi.product_size_id, spi.base_cost, p.options AS product_options
      FROM super_price_list_items spi
      JOIN product_sizes ps ON spi.product_size_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
    `, [id]);

    let updatedCount = 0;
    let unchangedCount = 0;
    let unmatchedCount = 0;
    let skippedNonZeroCount = 0;

    for (const row of rows) {
      let options = {};
      try {
        options = row.product_options ? JSON.parse(row.product_options) : {};
      } catch (_) {
        options = {};
      }

      const whccUid = Number(options?.whccProductUID ?? options?.productUID ?? 0) || 0;
      const whccNode = Number(options?.whccProductNodeID ?? options?.productNodeID ?? 0) || 0;
      const candidateIds = [whccUid, whccNode].filter((v) => Number.isInteger(v) && v > 0);

      let matchedPrice = null;
      for (const candidate of candidateIds) {
        if (csvCostMap.has(candidate)) {
          matchedPrice = Number(csvCostMap.get(candidate));
          break;
        }
      }

      if (!Number.isFinite(matchedPrice)) {
        unmatchedCount++;
        continue;
      }

      const currentCost = row.base_cost === null || row.base_cost === undefined ? null : Number(row.base_cost);

      if (onlyIfZero && currentCost !== null && Number.isFinite(currentCost) && Math.abs(currentCost) > 0.0001) {
        skippedNonZeroCount++;
        continue;
      }

      if (currentCost !== null && Math.abs(currentCost - matchedPrice) < 0.0001) {
        unchangedCount++;
        continue;
      }

      await mssql.query('UPDATE super_price_list_items SET base_cost = @p1 WHERE id = @p2', [matchedPrice, row.id]);
      await mssql.query('UPDATE product_sizes SET cost = @p1 WHERE id = @p2', [matchedPrice, row.product_size_id]);

      // Propagate to linked studio lists only when the price appears inherited/unset.
      for (const studioListId of linkedStudioIds) {
        if (onlyIfZero) {
          await mssql.query(
            `UPDATE studio_price_list_items
             SET price = @p1
             WHERE studio_price_list_id = @p2
               AND product_size_id = @p3
               AND (price IS NULL OR ABS(price) < 0.0001)`,
            [matchedPrice, studioListId, row.product_size_id]
          );
        } else {
          await mssql.query(
            `UPDATE studio_price_list_items
             SET price = @p1
             WHERE studio_price_list_id = @p2
               AND product_size_id = @p3
               AND (
                 price IS NULL
                 OR (@p4 IS NOT NULL AND ABS(price - @p4) < 0.0001)
               )`,
            [matchedPrice, studioListId, row.product_size_id, currentCost]
          );
        }
      }

      updatedCount++;
    }

    res.json({
      success: true,
      onlyIfZero,
      updatedCount,
      unchangedCount,
      unmatchedCount,
      skippedNonZeroCount,
      totalRows: rows.length,
      csvRows: csvCostMap.size,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync WHCC costs', details: err?.message || String(err) });
  }
});

// POST fill missing WHCC node IDs from live WHCC catalog for products in this super price list
router.post('/:id/fill-missing-whcc-node-ids', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const consumerKey = String(process.env.WHCC_CONSUMER_KEY || '').trim();
    const consumerSecret = String(process.env.WHCC_CONSUMER_SECRET || '').trim();
    const isSandbox = process.env.WHCC_SANDBOX === 'true';
    const baseUrl = isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';

    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({ error: 'WHCC credentials are not configured' });
    }

    const axios = (await import('axios')).default;

    const tokenResponse = await axios.get(`${baseUrl}/api/AccessToken`, {
      params: {
        grant_type: 'consumer_credentials',
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
      headers: { Accept: 'application/json' },
    });

    const token = tokenResponse.data?.Token || tokenResponse.data?.token || null;
    if (!token) {
      return res.status(502).json({ error: 'WHCC token response did not include a token' });
    }

    const catalogResponse = await axios.get(`${baseUrl}/api/catalog`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    const categories = Array.isArray(catalogResponse.data?.Categories) ? catalogResponse.data.Categories : [];
    const products = categories.flatMap((c) => (Array.isArray(c?.ProductList) ? c.ProductList : []));

    const nodeByUid = new Map();
    for (const product of products) {
      const uid = Number(product?.ProductUID ?? product?.productUID ?? product?.ProductId ?? product?.productId ?? product?.Id ?? product?.id ?? 0);
      if (!Number.isInteger(uid) || uid <= 0 || nodeByUid.has(uid)) continue;

      const node = Number(
        product?.ProductNodeID ??
        product?.productNodeID ??
        product?.DefaultProductNodeID ??
        product?.defaultProductNodeID ??
        (Array.isArray(product?.ProductNodes)
          ? (product.ProductNodes[0]?.DP2NodeID ?? product.ProductNodes[0]?.ProductNodeID)
          : null) ??
        (Array.isArray(product?.productNodes)
          ? (product.productNodes[0]?.dp2NodeID ?? product.productNodes[0]?.productNodeID)
          : null)
      );

      if (Number.isInteger(node) && node > 0) {
        nodeByUid.set(uid, node);
      }
    }

    const rows = await mssql.query(`
      SELECT DISTINCT p.id as product_id, p.options as product_options
      FROM super_price_list_items spi
      JOIN product_sizes ps ON spi.product_size_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
    `, [id]);

    let updatedCount = 0;
    let alreadySetCount = 0;
    let missingUidCount = 0;
    let noCatalogNodeCount = 0;

    for (const row of rows) {
      let options = {};
      try {
        options = row.product_options ? JSON.parse(row.product_options) : {};
      } catch (_) {
        options = {};
      }

      const whccUid = Number(options?.whccProductUID ?? options?.productUID ?? 0) || 0;
      const whccNode = Number(options?.whccProductNodeID ?? options?.productNodeID ?? 0) || 0;

      if (whccNode > 0) {
        alreadySetCount++;
        continue;
      }
      if (whccUid <= 0) {
        missingUidCount++;
        continue;
      }

      const catalogNode = Number(nodeByUid.get(whccUid) || 0);
      if (!(catalogNode > 0)) {
        noCatalogNodeCount++;
        continue;
      }

      const next = {
        ...options,
        whccProductUID: whccUid,
        whccProductNodeID: catalogNode,
      };
      await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(next), row.product_id]);
      updatedCount++;
    }

    res.json({
      success: true,
      totalProductsInList: rows.length,
      updatedCount,
      alreadySetCount,
      missingUidCount,
      noCatalogNodeCount,
      catalogNodeMapSize: nodeByUid.size,
      sandbox: isSandbox,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fill missing WHCC node IDs', details: err?.message || String(err) });
  }
});

// POST fill missing WHCC UIDs for items in this super price list
router.post('/:id/fill-missing-whcc-uids', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    await ensureWhccVariantsTable();
    await ensureSuperPriceListItemWhccMetadataColumns();

    const uidByNode = new Map();

    // Prefer raw catalog products to avoid flattening gaps on certain product families.
    const consumerKey = String(process.env.WHCC_CONSUMER_KEY || '').trim();
    const consumerSecret = String(process.env.WHCC_CONSUMER_SECRET || '').trim();
    const isSandbox = process.env.WHCC_SANDBOX === 'true';
    const baseUrl = isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';

    if (consumerKey && consumerSecret) {
      const axios = (await import('axios')).default;
      const tokenResponse = await axios.get(`${baseUrl}/api/AccessToken`, {
        params: {
          grant_type: 'consumer_credentials',
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
        },
        headers: { Accept: 'application/json' },
      });

      const token = tokenResponse.data?.Token || tokenResponse.data?.token || null;
      if (token) {
        const catalogResponse = await axios.get(`${baseUrl}/api/catalog`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        const categories = Array.isArray(catalogResponse.data?.Categories) ? catalogResponse.data.Categories : [];
        const products = categories.flatMap((c) => (Array.isArray(c?.ProductList) ? c.ProductList : []));
        for (const product of products) {
          const uid = getCatalogProductUID(product);
          const node = getCatalogProductNodeID(product);
          if (uid && node && !uidByNode.has(node)) {
            uidByNode.set(node, uid);
          }
        }
      }
    }

    // Fallback: include flattened-map rows as a secondary source.
    if (!uidByNode.size) {
      const whccCatalogMap = await getWhccCatalogMap();
      for (const row of whccCatalogMap.values()) {
        const uid = getCatalogProductUID(row);
        const node = getCatalogProductNodeID(row);
        if (uid && node && !uidByNode.has(node)) {
          uidByNode.set(node, uid);
        }
      }
    }

    const variantRows = await mssql.query(`
      SELECT v.super_price_list_item_id, v.whcc_product_uid, v.is_default, v.id
      FROM super_price_list_item_whcc_variants v
      INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
      ORDER BY v.super_price_list_item_id ASC, v.is_default DESC, v.id ASC
    `, [id]);

    const variantUidByItemId = new Map();
    for (const row of variantRows) {
      const itemId = Number(row.super_price_list_item_id || 0);
      const uid = Number(row.whcc_product_uid || 0);
      if (!itemId || !uid) continue;
      if (!variantUidByItemId.has(itemId)) variantUidByItemId.set(itemId, uid);
    }

    const rows = await mssql.query(`
      SELECT spi.id,
             spi.whcc_product_uid,
             spi.whcc_product_node_id,
             p.id as product_id,
             p.options as product_options
      FROM super_price_list_items spi
      JOIN product_sizes ps ON spi.product_size_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
    `, [id]);

    let alreadySetCount = 0;
    let updatedCount = 0;
    let optionsUpdatedCount = 0;
    let unresolvedCount = 0;

    for (const row of rows) {
      const itemId = Number(row.id || 0);
      const existingUid = Number(row.whcc_product_uid || 0);
      if (existingUid > 0) {
        alreadySetCount++;
        continue;
      }

      let options = {};
      try {
        options = row.product_options ? JSON.parse(row.product_options) : {};
      } catch (_) {
        options = {};
      }

      const node = firstPositiveInt(row.whcc_product_node_id, options?.whccProductNodeID, options?.productNodeID);
      const repairedUid = firstPositiveInt(
        options?.whccProductUID,
        options?.productUID,
        variantUidByItemId.get(itemId),
        uidByNode.get(node)
      );

      if (!(repairedUid > 0)) {
        unresolvedCount++;
        continue;
      }

      await mssql.query('UPDATE super_price_list_items SET whcc_product_uid = @p1 WHERE id = @p2', [repairedUid, itemId]);
      updatedCount++;

      const optionsUid = Number(options?.whccProductUID || 0);
      if (optionsUid !== repairedUid && Number(row.product_id || 0) > 0) {
        const nextOptions = {
          ...(options || {}),
          whccProductUID: repairedUid,
          ...(node > 0 ? { whccProductNodeID: node } : {}),
        };
        await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(nextOptions), row.product_id]);
        optionsUpdatedCount++;
      }
    }

    res.json({
      success: true,
      totalItems: rows.length,
      alreadySetCount,
      updatedCount,
      optionsUpdatedCount,
      unresolvedCount,
      uidByNodeMapSize: uidByNode.size,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fill missing WHCC UIDs', details: err?.message || String(err) });
  }
});



// GET all super price lists
router.get('/', async (req, res) => {
  try {
    const lists = await mssql.query(`
      SELECT
        spl.id,
        spl.name,
        spl.description,
        spl.is_active AS isActive,
        COUNT(DISTINCT spi.id) AS productCount,
        COUNT(DISTINCT stpl.id) AS linkedStudioCount
      FROM super_price_lists spl
      LEFT JOIN super_price_list_items spi
        ON spi.super_price_list_id = spl.id AND spi.is_deleted = 0
      LEFT JOIN studio_price_lists stpl
        ON stpl.super_price_list_id = spl.id
      GROUP BY spl.id, spl.name, spl.description, spl.is_active
      ORDER BY spl.name
    `);
    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch super price lists' });
  }
});

// POST create new super price list
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    await mssql.query('INSERT INTO super_price_lists (name, description, is_active) VALUES (@p1, @p2, 1)', [name, description || '']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create super price list' });
  }
});

// DELETE super price list and dependent studio links
router.delete('/:id', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await mssql.query('SELECT TOP 1 id, name FROM super_price_lists WHERE id = @p1', [id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Super price list not found' });
    }

    const linkedStudioLists = await mssql.query('SELECT id FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    const studioListIds = linkedStudioLists.map(row => Number(row.id)).filter(value => Number.isInteger(value) && value > 0);

    if (studioListIds.length) {
      for (const studioListId of studioListIds) {
        await mssql.query('DELETE FROM studio_price_list_items WHERE studio_price_list_id = @p1', [studioListId]);
      }
      await mssql.query('DELETE FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    }

    await mssql.query('DELETE FROM super_price_list_category_images WHERE super_price_list_id = @p1', [id]);
    await mssql.query('DELETE FROM super_price_list_items WHERE super_price_list_id = @p1', [id]);
    await mssql.query('DELETE FROM super_price_lists WHERE id = @p1', [id]);

    res.json({
      success: true,
      deletedSuperPriceListId: Number(id),
      deletedLinkedStudioLists: studioListIds.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete super price list' });
  }
});

// GET all items for a super price list
router.get('/:id/items', async (req, res) => {
  const { id } = req.params;
  try {
    await ensureWhccVariantsTable();
    await ensureSuperPriceListItemWhccMetadataColumns();
    const rows = await mssql.query(`
      SELECT spi.id, spi.super_price_list_id, spi.product_size_id, spi.base_cost,
             spi.markup_percent, spi.is_active,
             spi.whcc_product_uid, spi.whcc_product_node_id,
             spi.whcc_item_attribute_uids, spi.whcc_attribute_categories,
             ps.size_name, p.id as product_id, p.name as product_name, p.category as product_category,
             p.options as product_options
      FROM super_price_list_items spi
      LEFT JOIN product_sizes ps ON spi.product_size_id = ps.id
      LEFT JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
      ORDER BY p.category, p.name, ps.size_name
    `, [id]);

    const variantRows = await mssql.query(`
      SELECT v.id,
             v.super_price_list_item_id,
             v.display_name,
             v.whcc_product_uid,
             v.whcc_product_node_ids,
             v.whcc_item_attribute_uids,
              v.base_cost,
          v.price,
             v.is_default,
             v.is_active
      FROM super_price_list_item_whcc_variants v
      INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
      ORDER BY v.super_price_list_item_id ASC, v.is_default DESC, v.id ASC
    `, [id]);

    const variantsByItemId = new Map();
    for (const row of variantRows) {
      const itemId = Number(row.super_price_list_item_id || 0);
      if (!itemId) continue;
      if (!variantsByItemId.has(itemId)) variantsByItemId.set(itemId, []);
      variantsByItemId.get(itemId).push({
        id: Number(row.id),
        displayName: row.display_name || '',
        whccProductUID: Number(row.whcc_product_uid || 0) || null,
        whccProductNodeIDs: normalizePositiveIntArray(parseJsonArray(row.whcc_product_node_ids)),
        whccItemAttributeUIDs: normalizePositiveIntArray(parseJsonArray(row.whcc_item_attribute_uids)),
        baseCost: normalizeNullableMoney(row.base_cost),
        price: normalizeNullableMoney(row.price),
        isDefault: Boolean(row.is_default),
        isActive: Boolean(row.is_active),
      });
    }

    const items = rows.map(item => {
      let options = {};
      try {
        options = item.product_options ? JSON.parse(item.product_options) : {};
      } catch (_) {
        options = {};
      }

      const digitalDownloadScope = String(options?.digitalDownloadScope ?? options?.downloadScope ?? options?.digital_download_scope ?? 'photo').trim().toLowerCase() === 'album'
        ? 'album'
        : 'photo';
      const digitalPricingMode = String(options?.digitalPricingMode ?? options?.pricingMode ?? options?.digital_pricing_mode ?? 'fixed').trim().toLowerCase() === 'percentage'
        ? 'percentage'
        : 'fixed';
      const superAdminPercentage = Number(options?.superAdminPercentage ?? options?.digitalCommissionPercent ?? options?.commissionPercent ?? 0);
      const attributePricingPercent = Number(options?.attributePricingPercent ?? options?.attribute_pricing_percent ?? 0);
      const attributePriceRoundingSuffix = normalizeAttributePriceRoundingSuffix(options?.attributePriceRoundingSuffix ?? options?.attribute_price_rounding_suffix ?? '.95');

      const itemId = Number(item.id || 0);
      const persistedVariants = variantsByItemId.get(itemId) || [];
      const itemLevelCategories = parseJsonArray(item.whcc_attribute_categories);
      const itemLevelAttrUids = normalizePositiveIntArray(parseJsonArray(item.whcc_item_attribute_uids));
      const legacyNodeId = Number(item.whcc_product_node_id || options?.whccProductNodeID || 0) || null;
      const legacyAttrUids = itemLevelAttrUids.length
        ? itemLevelAttrUids
        : Array.isArray(options?.whccItemAttributeUIDs)
        ? normalizePositiveIntArray(options.whccItemAttributeUIDs)
        : [];
      const legacyUid = Number(item.whcc_product_uid || options?.whccProductUID || 0) || null;
      const fallbackVariant = legacyUid
        ? [{
            id: null,
            displayName: '',
            whccProductUID: legacyUid,
            whccProductNodeIDs: legacyNodeId ? [legacyNodeId] : [],
            whccItemAttributeUIDs: legacyAttrUids,
            isDefault: true,
            isActive: true,
          }]
        : [];
      const whccVariants = persistedVariants.length ? persistedVariants : fallbackVariant;

      const finalUid = Number(item.whcc_product_uid || options?.whccProductUID || 0);
      const finalNode = Number(item.whcc_product_node_id || options?.whccProductNodeID || 0);

      return {
        ...item,
        isDigital: options?.isDigital === true || options?.is_digital_only === true,
        digitalDownloadScope,
        digitalPricingMode,
        superAdminPercentage: Number.isFinite(superAdminPercentage)
          ? Math.max(0, Math.min(100, superAdminPercentage))
          : 0,
        attributePricingPercent: Number.isFinite(attributePricingPercent) ? Math.max(0, attributePricingPercent) : 0,
        attributePriceRoundingSuffix,
        whccProductUID: finalUid > 0 ? String(finalUid) : '',
        whccProductNodeID: finalNode > 0 ? String(finalNode) : '',
        whccItemAttributeUIDs: itemLevelAttrUids.length ? itemLevelAttrUids : (Array.isArray(options?.whccItemAttributeUIDs) ? options.whccItemAttributeUIDs : []),
        whccAttributeCategories: itemLevelCategories.length ? itemLevelCategories : (Array.isArray(options?.whccAttributeCategories) ? options.whccAttributeCategories : []),
        whccVariants,
        cropShape: item.crop_shape === 'circle' ? 'circle' : 'rect',
      };
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch super price list items' });
  }
});

// POST bootstrap missing WHCC variant rows and backfill queued batch order snapshots
router.post('/:id/bootstrap-whcc-variants', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    await ensureWhccVariantsTable();
    await ensureSuperPriceListItemWhccMetadataColumns();

    const superItems = await mssql.query(`
      SELECT spi.id,
             spi.product_size_id,
             spi.base_cost,
             spi.markup_percent,
             spi.whcc_product_uid,
             spi.whcc_product_node_id,
             spi.whcc_item_attribute_uids,
             spi.whcc_attribute_categories,
             p.options as product_options
      FROM super_price_list_items spi
      INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
      INNER JOIN products p ON p.id = ps.product_id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
    `, [id]);

    const existingVariantRows = await mssql.query(`
      SELECT v.*
      FROM super_price_list_item_whcc_variants v
      INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
      WHERE spi.super_price_list_id = @p1
        AND spi.is_deleted = 0
      ORDER BY v.super_price_list_item_id, v.is_default DESC, v.id ASC
    `, [id]);

    const variantsByItemId = new Map();
    for (const row of existingVariantRows) {
      const itemId = Number(row.super_price_list_item_id || 0);
      if (!itemId) continue;
      if (!variantsByItemId.has(itemId)) variantsByItemId.set(itemId, []);
      variantsByItemId.get(itemId).push(buildWhccVariantPayloadFromRow(row));
    }

    let createdVariantRows = 0;
    let hydratedQueuedOrderItems = 0;

    for (const item of superItems) {
      const itemId = Number(item.id || 0);
      if (!itemId) continue;
      const options = parseJsonObject(item.product_options);
      const fallbackUid = Number(item.whcc_product_uid || options?.whccProductUID || 0);
      if (!Number.isInteger(fallbackUid) || fallbackUid <= 0) continue;

      const fallbackNode = Number(item.whcc_product_node_id || options?.whccProductNodeID || 0);
      const fallbackAttrs = parseJsonArray(item.whcc_item_attribute_uids).length
        ? normalizePositiveIntArray(parseJsonArray(item.whcc_item_attribute_uids))
        : Array.isArray(options?.whccItemAttributeUIDs)
        ? normalizePositiveIntArray(options.whccItemAttributeUIDs)
        : [];
      const baseCost = normalizeNullableMoney(item.base_cost);
      const markupPercent = Number(item.markup_percent || 0);
      const price = baseCost !== null && Number.isFinite(markupPercent)
        ? Number((baseCost + (baseCost * markupPercent / 100)).toFixed(2))
        : null;
      const generatedVariants = buildDefaultWhccVariantsFromCategories({
        whccProductUID: fallbackUid,
        whccProductNodeID: fallbackNode,
        attributeCategories: parseJsonArray(item.whcc_attribute_categories).length ? parseJsonArray(item.whcc_attribute_categories) : options?.whccAttributeCategories,
        baseCost,
        basePrice: price,
      });

      const existing = variantsByItemId.get(itemId) || [];
      if (existing.length && !shouldReplaceExistingWhccVariants(existing, generatedVariants)) continue;

      if (existing.length) {
        await mssql.query(
          'DELETE FROM super_price_list_item_whcc_variants WHERE super_price_list_item_id = @p1',
          [itemId]
        );
      }

      const variantsToInsert = generatedVariants.length
        ? generatedVariants
        : [{
            displayName: '',
            whccProductUID: fallbackUid,
            whccProductNodeIDs: fallbackNode > 0 ? [fallbackNode] : [],
            whccItemAttributeUIDs: fallbackAttrs,
            baseCost,
            price,
            isDefault: true,
            isActive: true,
          }];

      for (const variant of variantsToInsert) {
        await mssql.query(`
          INSERT INTO super_price_list_item_whcc_variants (
            super_price_list_item_id,
            display_name,
            whcc_product_uid,
            whcc_product_node_ids,
            whcc_item_attribute_uids,
            base_cost,
            price,
            is_default,
            is_active
          ) VALUES (
            @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9
          )
        `, [
          itemId,
          variant.displayName || '',
          variant.whccProductUID,
          JSON.stringify(Array.isArray(variant.whccProductNodeIDs) ? variant.whccProductNodeIDs : []),
          JSON.stringify(Array.isArray(variant.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs : []),
          variant.baseCost ?? null,
          variant.price ?? null,
          variant.isDefault ? 1 : 0,
          variant.isActive === false ? 0 : 1,
        ]);
      }

      createdVariantRows += variantsToInsert.length;
      variantsByItemId.set(itemId, variantsToInsert);
    }

    // Refresh rows so each item has persisted variant IDs/default flags
    const refreshedVariantRows = await mssql.query(`
      SELECT v.*,
             spi.product_size_id
      FROM super_price_list_item_whcc_variants v
      INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
      WHERE spi.super_price_list_id = @p1
      ORDER BY spi.product_size_id, v.is_default DESC, v.id ASC
    `, [id]);

    const variantsByProductSizeId = new Map();
    for (const row of refreshedVariantRows) {
      const productSizeId = Number(row.product_size_id || 0);
      if (!productSizeId) continue;
      if (!variantsByProductSizeId.has(productSizeId)) variantsByProductSizeId.set(productSizeId, []);
      variantsByProductSizeId.get(productSizeId).push(buildWhccVariantPayloadFromRow(row));
    }

    const productSizeIds = Array.from(variantsByProductSizeId.keys()).filter((v) => Number.isInteger(v) && v > 0);
    if (productSizeIds.length) {
      const placeholders = productSizeIds.map((_, index) => `@p${index + 1}`).join(',');
      const queuedItems = await mssql.query(`
        SELECT oi.id,
               oi.product_size_id,
               oi.product_options_snapshot,
               p.options as product_options
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
        LEFT JOIN products p ON p.id = ps.product_id
        WHERE oi.product_size_id IN (${placeholders})
          AND o.is_batch = 1
          AND (o.lab_submitted = 0 OR o.lab_submitted IS NULL)
          AND LOWER(ISNULL(o.status, '')) <> 'cancelled'
      `, productSizeIds);

      for (const queuedItem of queuedItems) {
        const productSizeId = Number(queuedItem.product_size_id || 0);
        if (!productSizeId) continue;

        const variants = variantsByProductSizeId.get(productSizeId) || [];
        if (!variants.length) continue;
        const preferred = pickPreferredWhccVariant(variants);
        if (!preferred?.whccProductUID) continue;

        const snapshot = {
          ...parseJsonObject(queuedItem.product_options_snapshot || queuedItem.product_options),
          whccVariants: variants,
          whccProductUID: preferred.whccProductUID,
          whccProductNodeID: Array.isArray(preferred.whccProductNodeIDs) && preferred.whccProductNodeIDs.length
            ? preferred.whccProductNodeIDs[0]
            : null,
          whccItemAttributeUIDs: Array.isArray(preferred.whccItemAttributeUIDs)
            ? preferred.whccItemAttributeUIDs
            : [],
          whccSelectedVariantId: preferred.id,
        };

        await mssql.query(
          'UPDATE order_items SET product_options_snapshot = @p1 WHERE id = @p2',
          [JSON.stringify(snapshot), queuedItem.id]
        );
        hydratedQueuedOrderItems += 1;
      }
    }

    res.json({
      success: true,
      createdVariantRows,
      hydratedQueuedOrderItems,
      productSizeCount: productSizeIds.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bootstrap WHCC variants', details: err?.message || String(err) });
  }
});

// POST add product/size to super price list
router.post('/:id/items', async (req, res) => {
  const { id } = req.params;
  const { product_size_id, base_cost, markup_percent } = req.body;
  try {
    const forceDigitalOnly = req.body?.is_digital_only === true;
    const requestedDownloadScope = String(req.body?.digital_download_scope || req.body?.downloadScope || '').trim().toLowerCase() === 'album' ? 'album' : 'photo';
    const requestedDigitalPricingMode = String(req.body?.digital_pricing_mode || req.body?.digitalPricingMode || '').trim().toLowerCase() === 'percentage' ? 'percentage' : null;
    const requestedSuperAdminPercentage = Number(req.body?.super_admin_percentage ?? req.body?.superAdminPercentage);
    const normalizedSuperAdminPercentage = Number.isFinite(requestedSuperAdminPercentage)
      ? Math.max(0, Math.min(100, requestedSuperAdminPercentage))
      : null;
    let resolvedProductSizeId = Number(product_size_id || 0);

    // Check existing size id first
    let sizeExists = [];
    if (resolvedProductSizeId > 0) {
      sizeExists = await mssql.query('SELECT TOP 1 id FROM product_sizes WHERE id = @p1', [resolvedProductSizeId]);
    }

    // If missing/non-existent, allow manual creation via product/size fields
    if (!sizeExists.length) {
      const productName = (req.body.product_name || req.body.name || req.body.display_name || '').toString().trim();
      const sizeName = (req.body.size_name || req.body.size || '').toString().trim();
      const category = (req.body.category || (forceDigitalOnly ? 'Digital' : 'General')).toString().trim();
      const description = (req.body.description || (forceDigitalOnly ? 'Digital download product' : 'Added manually')).toString();

      if (!productName || !sizeName) {
        return res.status(400).json({ error: 'Provide valid product_size_id or product_name + size_name' });
      }

      // Ensure bridge price list exists (same approach as import endpoint)
      let bridgePriceListId = null;
      const bridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id ASC", ['WHCC Import Bridge']);
      bridgePriceListId = bridge[0]?.id || null;
      if (!bridgePriceListId) {
        await mssql.query('INSERT INTO price_lists (studio_id, name, description) VALUES (NULL, @p1, @p2)', ['WHCC Import Bridge', 'System bridge price list for imports/manual additions']);
        const createdBridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id DESC", ['WHCC Import Bridge']);
        bridgePriceListId = createdBridge[0]?.id || null;
      }

      // Find or create product
      let productRows = await mssql.query('SELECT TOP 1 id, options FROM products WHERE name = @p1 AND category = @p2', [productName, category]);
      let productId = productRows[0]?.id;
      if (!productId) {
        const optionsPayload = {
          isDigital: forceDigitalOnly,
          isActive: true,
          ...(forceDigitalOnly ? { digitalDownloadScope: requestedDownloadScope } : {}),
          ...(forceDigitalOnly && requestedDigitalPricingMode ? { digitalPricingMode: requestedDigitalPricingMode } : {}),
          ...(forceDigitalOnly && requestedDigitalPricingMode === 'percentage' && normalizedSuperAdminPercentage !== null
            ? { superAdminPercentage: normalizedSuperAdminPercentage }
            : {}),
        };
        const optionsJson = JSON.stringify(optionsPayload);
        try {
          await mssql.query(
            'INSERT INTO products (name, category, price, description, cost, options) VALUES (@p1, @p2, @p3, @p4, @p5, @p6)',
            [productName, category, Number(base_cost ?? 0), description, Number(base_cost ?? 0), optionsJson]
          );
        } catch (_) {
          await mssql.query('INSERT INTO products (name, category, is_digital, description) VALUES (@p1, @p2, @p3, @p4)', [productName, category, forceDigitalOnly ? 1 : 0, description]);
        }
        productRows = await mssql.query('SELECT TOP 1 id, options FROM products WHERE name = @p1 AND category = @p2 ORDER BY id DESC', [productName, category]);
        productId = productRows[0]?.id;
      } else if (forceDigitalOnly) {
        // Ensure existing product used by manual add is marked digital for checkout/lab routing
        let currentOptions = {};
        try {
          currentOptions = productRows[0]?.options ? JSON.parse(productRows[0].options) : {};
        } catch (_) {
          currentOptions = {};
        }
        const nextOptions = {
          ...currentOptions,
          isDigital: true,
          isActive: currentOptions?.isActive !== false,
          digitalDownloadScope: requestedDownloadScope,
          ...(requestedDigitalPricingMode ? { digitalPricingMode: requestedDigitalPricingMode } : {}),
        };
        if (requestedDigitalPricingMode === 'percentage' && normalizedSuperAdminPercentage !== null) {
          nextOptions.superAdminPercentage = normalizedSuperAdminPercentage;
        }
        await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(nextOptions), productId]);
      }

      if (!productId || !bridgePriceListId) {
        return res.status(400).json({ error: 'Unable to resolve product/size for manual add' });
      }

      // Find or create product size
      let sizeRows = await mssql.query(
        'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
        [bridgePriceListId, productId, sizeName]
      );
      if (!sizeRows.length) {
        await mssql.query(
          'INSERT INTO product_sizes (price_list_id, product_id, size_name, price, cost) VALUES (@p1, @p2, @p3, @p4, @p5)',
          [bridgePriceListId, productId, sizeName, Number(base_cost ?? 0), Number(base_cost ?? 0)]
        );
        sizeRows = await mssql.query(
          'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
          [bridgePriceListId, productId, sizeName]
        );
      }
      resolvedProductSizeId = Number(sizeRows[0]?.id || 0);
    }

    if (!resolvedProductSizeId) {
      return res.status(400).json({ error: 'Invalid product size' });
    }

    // Upsert into super price list
    const existing = await mssql.query(
      'SELECT TOP 1 id FROM super_price_list_items WHERE super_price_list_id = @p1 AND product_size_id = @p2',
      [id, resolvedProductSizeId]
    );
    if (existing.length) {
      await mssql.query(
        'UPDATE super_price_list_items SET base_cost = @p1, markup_percent = @p2, is_active = 1 WHERE id = @p3',
        [base_cost ?? null, markup_percent ?? null, existing[0].id]
      );
    } else {
      await mssql.query(
        'INSERT INTO super_price_list_items (super_price_list_id, product_size_id, base_cost, markup_percent, is_active) VALUES (@p1, @p2, @p3, @p4, 1)',
        [id, resolvedProductSizeId, base_cost ?? null, markup_percent ?? null]
      );
    }
    res.status(201).json({ success: true, product_size_id: resolvedProductSizeId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add item to super price list' });
  }
});

// PUT update product/size cost/markup/active in super price list
router.put('/:id/items/:itemId', async (req, res) => {
  const { itemId } = req.params;
  const {
    base_cost,
    markup_percent,
    is_active,
    whccProductUID,
    whccProductNodeID,
    whccItemAttributeUIDs,
    digital_download_scope,
    downloadScope,
    digital_pricing_mode,
    digitalPricingMode,
    super_admin_percentage,
    superAdminPercentage,
    attribute_pricing_percent,
    attributePricingPercent,
    attribute_price_rounding_suffix,
    attributePriceRoundingSuffix,
    whccVariants,
    cropShape,
    sizeName,
    sizeWidth,
    sizeHeight,
    productName,
  } = req.body;
  try {
    await ensureWhccVariantsTable();
    await ensureSuperPriceListItemWhccMetadataColumns();
    // Build dynamic SET to avoid overwriting fields not in payload
    const parts = [];
    const params = [];
    if (base_cost !== undefined) { params.push(base_cost); parts.push(`base_cost = @p${params.length}`); }
    if (markup_percent !== undefined) { params.push(markup_percent); parts.push(`markup_percent = @p${params.length}`); }
    if (is_active !== undefined) { params.push(is_active ? 1 : 0); parts.push(`is_active = @p${params.length}`); }
    if (cropShape !== undefined) {
      const normalizedCropShape = cropShape === 'circle' ? 'circle' : 'rect';
      // Only write to DB if explicitly circle, or if overriding an existing non-null value back to rect
      params.push(normalizedCropShape === 'rect' ? null : normalizedCropShape);
      parts.push(`crop_shape = @p${params.length}`);
    }
    if (parts.length) {
      params.push(itemId);
      await mssql.query(`UPDATE super_price_list_items SET ${parts.join(', ')} WHERE id = @p${params.length}`, params);
    }

    // Update product_sizes.size_name (re-encode with dimensions) and products.name
    const hasSizeEdit = sizeName !== undefined || sizeWidth !== undefined || sizeHeight !== undefined;
    const hasProductNameEdit = productName !== undefined;
    if (hasSizeEdit || hasProductNameEdit) {
      const sizeRow = await mssql.query(`
        SELECT ps.id as sizeId, ps.size_name as storedSizeName, ps.product_id as productId, p.name as productName
        FROM super_price_list_items spi
        JOIN product_sizes ps ON spi.product_size_id = ps.id
        JOIN products p ON ps.product_id = p.id
        WHERE spi.id = @p1
      `, [itemId]);
      if (sizeRow.length) {
        const { sizeId, storedSizeName, productId } = sizeRow[0];
        if (hasSizeEdit) {
          // Decode existing stored name to get current parts
          const delimiter = '__';
          let currentDisplayName = storedSizeName || '';
          let currentW = 0, currentH = 0;
          if (storedSizeName && storedSizeName.includes(delimiter)) {
            const [namePart, dimPart] = storedSizeName.split(delimiter);
            currentDisplayName = namePart;
            const [wp, hp] = (dimPart || '').split('x');
            currentW = Number(wp) || 0;
            currentH = Number(hp) || 0;
          } else if (storedSizeName) {
            const m = storedSizeName.match(/^(.*?)\s*\(?([0-9.]+)x([0-9.]+)\)?$/i);
            if (m) { currentDisplayName = m[1].trim(); currentW = Number(m[2]) || 0; currentH = Number(m[3]) || 0; }
          }
          const newDisplayName = sizeName !== undefined ? String(sizeName).trim() : currentDisplayName;
          const newW = sizeWidth !== undefined ? Number(sizeWidth) || 0 : currentW;
          const newH = sizeHeight !== undefined ? Number(sizeHeight) || 0 : currentH;
          const newStoredName = (newW > 0 && newH > 0)
            ? `${newDisplayName}${delimiter}${newW}x${newH}`
            : newDisplayName;
          await mssql.query('UPDATE product_sizes SET size_name = @p1 WHERE id = @p2', [newStoredName, sizeId]);
        }
        if (hasProductNameEdit && productName !== undefined) {
          const trimmedProductName = String(productName).trim();
          if (trimmedProductName) {
            await mssql.query('UPDATE products SET name = @p1 WHERE id = @p2', [trimmedProductName, productId]);
          }
        }
      }
    }

    const hasWhccVariantsUpdate = Array.isArray(whccVariants);
    const hasWhccMappingUpdate = whccProductUID !== undefined || whccProductNodeID !== undefined || whccItemAttributeUIDs !== undefined || hasWhccVariantsUpdate;
    const hasCropShapeUpdate = cropShape !== undefined;
    const hasDigitalConfigUpdate =
      digital_download_scope !== undefined ||
      downloadScope !== undefined ||
      digital_pricing_mode !== undefined ||
      digitalPricingMode !== undefined ||
      super_admin_percentage !== undefined ||
      superAdminPercentage !== undefined;
    const hasAttributePricingConfigUpdate =
      attribute_pricing_percent !== undefined ||
      attributePricingPercent !== undefined ||
      attribute_price_rounding_suffix !== undefined ||
      attributePriceRoundingSuffix !== undefined;
    if (hasWhccMappingUpdate || hasDigitalConfigUpdate || hasAttributePricingConfigUpdate || hasCropShapeUpdate) {
      if (hasWhccMappingUpdate) {
        const itemParts = [];
        const itemParams = [];

        if (whccProductUID !== undefined) {
          const normalizedUID = Number(whccProductUID);
          itemParams.push(Number.isInteger(normalizedUID) && normalizedUID > 0 ? normalizedUID : null);
          itemParts.push(`whcc_product_uid = @p${itemParams.length}`);
        }

        if (whccProductNodeID !== undefined) {
          const normalizedNodeID = Number(whccProductNodeID);
          itemParams.push(Number.isInteger(normalizedNodeID) && normalizedNodeID > 0 ? normalizedNodeID : null);
          itemParts.push(`whcc_product_node_id = @p${itemParams.length}`);
        }

        if (whccItemAttributeUIDs !== undefined) {
          const normalizedAttributeUIDs = Array.isArray(whccItemAttributeUIDs)
            ? whccItemAttributeUIDs.map(Number).filter(value => Number.isInteger(value) && value > 0)
            : String(whccItemAttributeUIDs || '')
                .split(',')
                .map(value => Number(value.trim()))
                .filter(value => Number.isInteger(value) && value > 0);
          itemParams.push(normalizedAttributeUIDs.length ? JSON.stringify(normalizedAttributeUIDs) : null);
          itemParts.push(`whcc_item_attribute_uids = @p${itemParams.length}`);
        }

        if (itemParts.length) {
          itemParams.push(itemId);
          await mssql.query(`UPDATE super_price_list_items SET ${itemParts.join(', ')} WHERE id = @p${itemParams.length}`, itemParams);
        }
      }

      const itemRows = await mssql.query(`
        SELECT TOP 1 p.id as product_id, p.options as product_options
        FROM super_price_list_items spi
        LEFT JOIN product_sizes ps ON spi.product_size_id = ps.id
        LEFT JOIN products p ON ps.product_id = p.id
        WHERE spi.id = @p1
      `, [itemId]);

      const productId = itemRows[0]?.product_id;
      if (!productId) {
        return res.status(400).json({ error: 'Unable to resolve product for item' });
      }

      let options = {};
      try {
        options = itemRows[0]?.product_options ? JSON.parse(itemRows[0].product_options) : {};
      } catch (_) {
        options = {};
      }

      const nextOptions = { ...options };

      if (whccProductUID !== undefined) {
        const normalizedUID = Number(whccProductUID);
        if (Number.isInteger(normalizedUID) && normalizedUID > 0) nextOptions.whccProductUID = normalizedUID;
        else delete nextOptions.whccProductUID;
      }

      if (whccProductNodeID !== undefined) {
        const normalizedNodeID = Number(whccProductNodeID);
        if (Number.isInteger(normalizedNodeID) && normalizedNodeID > 0) nextOptions.whccProductNodeID = normalizedNodeID;
        else delete nextOptions.whccProductNodeID;
      }

      if (whccItemAttributeUIDs !== undefined) {
        const normalizedAttributeUIDs = Array.isArray(whccItemAttributeUIDs)
          ? whccItemAttributeUIDs.map(Number).filter(value => Number.isInteger(value) && value > 0)
          : String(whccItemAttributeUIDs || '')
              .split(',')
              .map(value => Number(value.trim()))
              .filter(value => Number.isInteger(value) && value > 0);

        if (normalizedAttributeUIDs.length) nextOptions.whccItemAttributeUIDs = normalizedAttributeUIDs;
        else delete nextOptions.whccItemAttributeUIDs;
      }

      if (hasWhccVariantsUpdate) {
        await ensureWhccVariantsTable();

        await mssql.query('DELETE FROM super_price_list_item_whcc_variants WHERE super_price_list_item_id = @p1', [itemId]);

        const normalizedVariants = whccVariants
          .map((variant) => {
            const uid = Number(variant?.whccProductUID || 0);
            if (!Number.isInteger(uid) || uid <= 0) return null;
            const nodeIds = normalizePositiveIntArray(variant?.whccProductNodeIDs || []);
            const attrIds = normalizePositiveIntArray(variant?.whccItemAttributeUIDs || []);
            const displayName = String(variant?.displayName || '').trim();
            return {
              whccProductUID: uid,
              whccProductNodeIDs: nodeIds,
              whccItemAttributeUIDs: attrIds,
              displayName,
              baseCost: normalizeNullableMoney(variant?.baseCost),
              price: normalizeNullableMoney(variant?.price),
              isDefault: Boolean(variant?.isDefault),
              isActive: variant?.isActive === undefined ? true : Boolean(variant?.isActive),
            };
          })
          .filter(Boolean);

        let hasDefault = normalizedVariants.some((variant) => variant.isDefault);
        if (!hasDefault && normalizedVariants.length > 0) {
          normalizedVariants[0].isDefault = true;
          hasDefault = true;
        }

        for (const variant of normalizedVariants) {
          await mssql.query(
            `INSERT INTO super_price_list_item_whcc_variants
              (super_price_list_item_id, display_name, whcc_product_uid, whcc_product_node_ids, whcc_item_attribute_uids, base_cost, price, is_default, is_active)
             VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9)`,
            [
              itemId,
              variant.displayName || null,
              variant.whccProductUID,
              JSON.stringify(variant.whccProductNodeIDs || []),
              JSON.stringify(variant.whccItemAttributeUIDs || []),
              variant.baseCost,
              variant.price,
              variant.isDefault ? 1 : 0,
              variant.isActive ? 1 : 0,
            ]
          );
        }

        const defaultVariant = normalizedVariants.find((variant) => variant.isDefault && variant.isActive)
          || normalizedVariants.find((variant) => variant.isActive)
          || normalizedVariants[0]
          || null;

        if (defaultVariant) {
          nextOptions.whccProductUID = defaultVariant.whccProductUID;
          if (Array.isArray(defaultVariant.whccProductNodeIDs) && defaultVariant.whccProductNodeIDs.length > 0) {
            nextOptions.whccProductNodeID = defaultVariant.whccProductNodeIDs[0];
          } else {
            delete nextOptions.whccProductNodeID;
          }

          if (Array.isArray(defaultVariant.whccItemAttributeUIDs) && defaultVariant.whccItemAttributeUIDs.length > 0) {
            nextOptions.whccItemAttributeUIDs = defaultVariant.whccItemAttributeUIDs;
          } else {
            delete nextOptions.whccItemAttributeUIDs;
          }
        } else {
          delete nextOptions.whccProductUID;
          delete nextOptions.whccProductNodeID;
          delete nextOptions.whccItemAttributeUIDs;
        }

        await mssql.query(
          `UPDATE super_price_list_items
           SET whcc_product_uid = @p1,
               whcc_product_node_id = @p2,
               whcc_item_attribute_uids = @p3
           WHERE id = @p4`,
          [
            defaultVariant?.whccProductUID || null,
            Array.isArray(defaultVariant?.whccProductNodeIDs) && defaultVariant.whccProductNodeIDs.length
              ? defaultVariant.whccProductNodeIDs[0]
              : null,
            Array.isArray(defaultVariant?.whccItemAttributeUIDs) && defaultVariant.whccItemAttributeUIDs.length
              ? JSON.stringify(defaultVariant.whccItemAttributeUIDs)
              : null,
            itemId,
          ]
        );

        const derivedParts = [];
        const derivedParams = [];
        const derivedBaseCost = normalizeNullableMoney(defaultVariant?.baseCost);
        const derivedPrice = normalizeNullableMoney(defaultVariant?.price);
        if (base_cost === undefined && derivedBaseCost !== null) {
          derivedParams.push(derivedBaseCost);
          derivedParts.push(`base_cost = @p${derivedParams.length}`);
        }
        if (markup_percent === undefined && derivedBaseCost !== null && derivedPrice !== null && derivedBaseCost > 0) {
          const derivedMarkupPercent = Number((((derivedPrice - derivedBaseCost) / derivedBaseCost) * 100).toFixed(2));
          derivedParams.push(derivedMarkupPercent);
          derivedParts.push(`markup_percent = @p${derivedParams.length}`);
        }
        if (derivedParts.length) {
          derivedParams.push(itemId);
          await mssql.query(`UPDATE super_price_list_items SET ${derivedParts.join(', ')} WHERE id = @p${derivedParams.length}`, derivedParams);
        }
      }

      if (hasDigitalConfigUpdate) {
        nextOptions.isDigital = true;
        nextOptions.isActive = nextOptions?.isActive !== false;

        const normalizedDownloadScope = String(digital_download_scope ?? downloadScope ?? '').trim().toLowerCase() === 'album'
          ? 'album'
          : 'photo';
        const normalizedPricingMode = String(digital_pricing_mode ?? digitalPricingMode ?? '').trim().toLowerCase() === 'percentage'
          ? 'percentage'
          : 'fixed';

        nextOptions.digitalDownloadScope = normalizedDownloadScope;
        nextOptions.digitalPricingMode = normalizedPricingMode;

        const requestedSuperAdminPercentage = Number(super_admin_percentage ?? superAdminPercentage);
        if (normalizedPricingMode === 'percentage') {
          nextOptions.superAdminPercentage = Number.isFinite(requestedSuperAdminPercentage)
            ? Math.max(0, Math.min(100, requestedSuperAdminPercentage))
            : 0;
        } else {
          delete nextOptions.superAdminPercentage;
        }
      }

      if (hasAttributePricingConfigUpdate) {
        const requestedAttributePct = Number(attribute_pricing_percent ?? attributePricingPercent);
        if (Number.isFinite(requestedAttributePct) && requestedAttributePct >= 0) {
          nextOptions.attributePricingPercent = Number(requestedAttributePct.toFixed(2));
        } else if ((attribute_pricing_percent ?? attributePricingPercent) !== undefined) {
          delete nextOptions.attributePricingPercent;
        }

        if ((attribute_price_rounding_suffix ?? attributePriceRoundingSuffix) !== undefined) {
          nextOptions.attributePriceRoundingSuffix = normalizeAttributePriceRoundingSuffix(
            attribute_price_rounding_suffix ?? attributePriceRoundingSuffix
          );
        }
      }

      if (cropShape !== undefined) {
        if (cropShape === 'circle') nextOptions.cropShape = 'circle';
        else delete nextOptions.cropShape; // null/rect = default, don't pollute options
      }

      await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(nextOptions), productId]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// POST create an empty category within a super price list
router.post('/:id/categories', async (req, res) => {
  const { id } = req.params;
  const category = String(req.body?.category || '').trim();
  if (!category) {
    return res.status(400).json({ error: 'category is required' });
  }
  try {
    await ensureCategoryImagesTable();
    const existing = await mssql.query(
      'SELECT TOP 1 id FROM super_price_list_category_images WHERE super_price_list_id = @p1 AND category_name = @p2',
      [id, category]
    );
    if (existing.length) {
      return res.json({ success: true, alreadyExists: true });
    }
    await mssql.query(
      'INSERT INTO super_price_list_category_images (super_price_list_id, category_name, image_url) VALUES (@p1, @p2, NULL)',
      [id, category]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT rename a category within a super price list
router.put('/:id/categories/rename', async (req, res) => {
  const { id } = req.params;
  const fromCategory = String(req.body?.fromCategory || '').trim();
  const toCategory = String(req.body?.toCategory || '').trim();
  if (!fromCategory || !toCategory) {
    return res.status(400).json({ error: 'fromCategory and toCategory are required' });
  }
  try {
    await mssql.query(
      `UPDATE p
       SET p.category = @p1
       FROM products p
       INNER JOIN product_sizes ps ON ps.product_id = p.id
       INNER JOIN super_price_list_items spi ON spi.product_size_id = ps.id
       WHERE spi.super_price_list_id = @p2
         AND p.category = @p3`,
      [toCategory, id, fromCategory]
    );

    await ensureCategoryImagesTable();
    await mssql.query(
      `UPDATE super_price_list_category_images
       SET category_name = @p1, updated_at = GETDATE()
       WHERE super_price_list_id = @p2 AND category_name = @p3`,
      [toCategory, id, fromCategory]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename category' });
  }
});

// DELETE a category (removes all items in this category from the super list and linked studio lists)
router.delete('/:id/categories', async (req, res) => {
  const { id } = req.params;
  const category = String(req.body?.category || req.query?.category || '').trim();
  if (!category) return res.status(400).json({ error: 'category is required' });
  try {
    await mssql.query(
      `UPDATE spi
       SET spi.is_deleted = 1
       FROM studio_price_list_items spi
       INNER JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
       INNER JOIN super_price_list_items sspi
         ON sspi.product_size_id = spi.product_size_id
        AND sspi.super_price_list_id = spl.super_price_list_id
       INNER JOIN product_sizes ps ON ps.id = sspi.product_size_id
       INNER JOIN products p ON p.id = ps.product_id
       WHERE spl.super_price_list_id = @p1
         AND p.category = @p2`,
      [id, category]
    );

    await mssql.query(
      `UPDATE sspi
       SET sspi.is_deleted = 1
       FROM super_price_list_items sspi
       INNER JOIN product_sizes ps ON ps.id = sspi.product_size_id
       INNER JOIN products p ON p.id = ps.product_id
       WHERE sspi.super_price_list_id = @p1
         AND p.category = @p2`,
      [id, category]
    );

    await ensureCategoryImagesTable();
    await mssql.query(
      'DELETE FROM super_price_list_category_images WHERE super_price_list_id = @p1 AND category_name = @p2',
      [id, category]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// DELETE a single item (size) from this super price list and all linked studio lists
router.delete('/:id/items/:itemId', async (req, res) => {
  const { id, itemId } = req.params;
  try {
    // Find the product_size_id so we can also remove from linked studio lists
    const rows = await mssql.query(
      `SELECT TOP 1 spi.product_size_id
       FROM super_price_list_items spi
       WHERE spi.super_price_list_id = @p1 AND spi.id = @p2`,
      [id, Number(itemId)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found in this super price list' });

    const productSizeId = Number(rows[0].product_size_id);

    // Soft-delete from linked studio lists
    await mssql.query(
      `UPDATE spi
       SET spi.is_deleted = 1
       FROM studio_price_list_items spi
       INNER JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
       WHERE spl.super_price_list_id = @p1
         AND spi.product_size_id = @p2`,
      [id, productSizeId]
    );

    // Soft-delete the super list item
    await mssql.query(
      'UPDATE super_price_list_items SET is_deleted = 1 WHERE super_price_list_id = @p1 AND id = @p2',
      [id, Number(itemId)]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// DELETE all items for a product group from this super price list (and linked studio lists)
router.delete('/:id/products/:productId', async (req, res) => {
  const { id, productId } = req.params;
  try {
    // Get all super list item ids and product_size_ids for this product
    const rows = await mssql.query(
      `SELECT spi.id AS item_id, spi.product_size_id
       FROM super_price_list_items spi
       INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
       WHERE spi.super_price_list_id = @p1
         AND ps.product_id = @p2`,
      [id, Number(productId)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found in this super price list' });

    const productSizeIds = rows.map(r => Number(r.product_size_id));
    const superItemIds = rows.map(r => Number(r.item_id));

    for (const sizeId of productSizeIds) {
      await mssql.query(
        `UPDATE spi
         SET spi.is_deleted = 1
         FROM studio_price_list_items spi
         INNER JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
         WHERE spl.super_price_list_id = @p1
           AND spi.product_size_id = @p2`,
        [id, sizeId]
      );
    }

    await mssql.query(
      `UPDATE spi
       SET spi.is_deleted = 1
       FROM super_price_list_items spi
       INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
       WHERE spi.super_price_list_id = @p1
         AND ps.product_id = @p2`,
      [id, Number(productId)]
    );

    res.json({ success: true, deletedCount: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// PUT move all sizes of a product to a different category
router.put('/:id/products/:productId/category', async (req, res) => {
  const { id, productId } = req.params;
  const targetCategory = String(req.body?.targetCategory || '').trim();
  if (!targetCategory) return res.status(400).json({ error: 'targetCategory is required' });
  try {
    const belongs = await mssql.query(
      `SELECT TOP 1 p.id, p.name
       FROM products p
       INNER JOIN product_sizes ps ON ps.product_id = p.id
       INNER JOIN super_price_list_items spi ON spi.product_size_id = ps.id
       WHERE spi.super_price_list_id = @p1
         AND p.id = @p2`,
      [id, Number(productId)]
    );
    if (!belongs.length) return res.status(404).json({ error: 'Product not found in this super price list' });

    const selectedBaseName = normalizeBaseProductName(belongs[0]?.name || '');

    const listProducts = await mssql.query(
      `SELECT DISTINCT p.id, p.name
       FROM products p
       INNER JOIN product_sizes ps ON ps.product_id = p.id
       INNER JOIN super_price_list_items spi ON spi.product_size_id = ps.id
       WHERE spi.super_price_list_id = @p1`,
      [id]
    );

    const productIdsToMove = listProducts
      .filter((row) => normalizeBaseProductName(row?.name || '') === selectedBaseName)
      .map((row) => Number(row?.id || 0))
      .filter((v, idx, arr) => Number.isInteger(v) && v > 0 && arr.indexOf(v) === idx);

    if (!productIdsToMove.length) {
      productIdsToMove.push(Number(productId));
    }

    for (const pid of productIdsToMove) {
      await mssql.query('UPDATE products SET category = @p1 WHERE id = @p2', [targetCategory, pid]);
    }

    res.json({ success: true, movedProductCount: productIdsToMove.length, movedProductIds: productIdsToMove });
  } catch (err) {
    res.status(500).json({ error: 'Failed to move product category' });
  }
});

// PUT move a single size item to another category (creates a new parent product if necessary)
router.put('/:id/items/:itemId/move-category', async (req, res) => {
  const { id, itemId } = req.params;
  const targetCategory = String(req.body?.targetCategory || '').trim();
  const requestedTargetProductName = String(req.body?.targetProductName || '').trim();
  if (!targetCategory) return res.status(400).json({ error: 'targetCategory is required' });

  try {
    await ensureSuperPriceListItemWhccMetadataColumns();
    const sourceRows = await mssql.query(
      `SELECT TOP 1
              spi.id as super_item_id,
              spi.product_size_id,
              spi.base_cost,
              ps.price_list_id,
              ps.size_name,
              ps.price as size_price,
              ps.cost as size_cost,
              p.name as product_name,
              p.description as product_description,
              p.options as product_options,
              p.image_url as product_image_url
       FROM super_price_list_items spi
       INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
       INNER JOIN products p ON p.id = ps.product_id
       WHERE spi.super_price_list_id = @p1
         AND spi.id = @p2
         AND ISNULL(spi.is_deleted, 0) = 0`,
      [id, Number(itemId)]
    );

    const source = sourceRows[0];
    if (!source) return res.status(404).json({ error: 'Item not found in this super price list' });

    const targetProductName = requestedTargetProductName || String(source.product_name || '').trim();
    if (!targetProductName) return res.status(400).json({ error: 'targetProductName is required' });

    let targetProductRows = await mssql.query(
      'SELECT TOP 1 id FROM products WHERE name = @p1 AND category = @p2 ORDER BY id DESC',
      [targetProductName, targetCategory]
    );

    let targetProductId = targetProductRows[0]?.id;
    if (!targetProductId) {
      await mssql.query(
        `INSERT INTO products (name, category, price, description, cost, options, image_url)
         VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7)`,
        [
          targetProductName,
          targetCategory,
          Number(source.base_cost ?? source.size_price ?? 0),
          String(source.product_description || ''),
          Number(source.base_cost ?? source.size_cost ?? 0),
          source.product_options || null,
          source.product_image_url || null,
        ]
      );

      targetProductRows = await mssql.query(
        'SELECT TOP 1 id FROM products WHERE name = @p1 AND category = @p2 ORDER BY id DESC',
        [targetProductName, targetCategory]
      );
      targetProductId = targetProductRows[0]?.id;
    }

    if (!targetProductId) return res.status(500).json({ error: 'Failed to resolve target product' });

    let targetSizeRows = await mssql.query(
      `SELECT TOP 1 id
       FROM product_sizes
       WHERE price_list_id = @p1
         AND product_id = @p2
         AND size_name = @p3
       ORDER BY id DESC`,
      [Number(source.price_list_id), Number(targetProductId), String(source.size_name || '')]
    );

    let targetProductSizeId = targetSizeRows[0]?.id;
    if (!targetProductSizeId) {
      await mssql.query(
        `INSERT INTO product_sizes (price_list_id, product_id, size_name, price, cost)
         VALUES (@p1, @p2, @p3, @p4, @p5)`,
        [
          Number(source.price_list_id),
          Number(targetProductId),
          String(source.size_name || ''),
          Number(source.size_price ?? source.base_cost ?? 0),
          Number(source.size_cost ?? source.base_cost ?? 0),
        ]
      );

      targetSizeRows = await mssql.query(
        `SELECT TOP 1 id
         FROM product_sizes
         WHERE price_list_id = @p1
           AND product_id = @p2
           AND size_name = @p3
         ORDER BY id DESC`,
        [Number(source.price_list_id), Number(targetProductId), String(source.size_name || '')]
      );
      targetProductSizeId = targetSizeRows[0]?.id;
    }

    if (!targetProductSizeId) return res.status(500).json({ error: 'Failed to resolve target size' });

    const oldProductSizeId = Number(source.product_size_id);

    // If another active super item already points at the target size in this same list,
    // keep that existing item and soft-delete the moved source item to avoid duplicate-key collisions.
    const existingTargetItemRows = await mssql.query(
      `SELECT TOP 1 id
       FROM super_price_list_items
       WHERE super_price_list_id = @p1
         AND product_size_id = @p2
         AND ISNULL(is_deleted, 0) = 0
         AND id <> @p3
       ORDER BY id DESC`,
      [Number(id), Number(targetProductSizeId), Number(itemId)]
    );
    const existingTargetSuperItemId = Number(existingTargetItemRows[0]?.id || 0);

    if (existingTargetSuperItemId > 0) {
      await mssql.query(
        `UPDATE super_price_list_items
         SET is_deleted = 1,
             is_active = 0
         WHERE id = @p1`,
        [Number(itemId)]
      );
    } else {
      await mssql.query(
        'UPDATE super_price_list_items SET product_size_id = @p1 WHERE id = @p2',
        [Number(targetProductSizeId), Number(itemId)]
      );
    }

    // Move studio rows safely: first update where target size is not already present,
    // then soft-delete remaining source rows that would conflict.
    await mssql.query(
      `UPDATE spi
       SET spi.product_size_id = @p1
       FROM studio_price_list_items spi
       INNER JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
       WHERE spl.super_price_list_id = @p2
         AND spi.product_size_id = @p3
         AND ISNULL(spi.is_deleted, 0) = 0
         AND NOT EXISTS (
           SELECT 1
           FROM studio_price_list_items existing
           WHERE existing.studio_price_list_id = spi.studio_price_list_id
             AND existing.product_size_id = @p1
             AND ISNULL(existing.is_deleted, 0) = 0
         )`,
      [Number(targetProductSizeId), Number(id), oldProductSizeId]
    );

    await mssql.query(
      `UPDATE spi
       SET spi.is_deleted = 1,
           spi.is_offered = 0
       FROM studio_price_list_items spi
       INNER JOIN studio_price_lists spl ON spl.id = spi.studio_price_list_id
       WHERE spl.super_price_list_id = @p2
         AND spi.product_size_id = @p3
         AND ISNULL(spi.is_deleted, 0) = 0
         AND EXISTS (
           SELECT 1
           FROM studio_price_list_items existing
           WHERE existing.studio_price_list_id = spi.studio_price_list_id
             AND existing.product_size_id = @p1
             AND ISNULL(existing.is_deleted, 0) = 0
         )`,
      [Number(targetProductSizeId), id, oldProductSizeId]
    );

    res.json({ success: true, product_size_id: Number(targetProductSizeId), product_id: Number(targetProductId) });
  } catch (err) {
    const detail = String(err?.message || '').trim();
    res.status(500).json({ error: detail ? `Failed to move item category: ${detail}` : 'Failed to move item category' });
  }
});

// PATCH bulk set is_active for a set of items
router.patch('/:id/items/bulk-active', async (req, res) => {
  const { item_ids, is_active } = req.body;
  if (!Array.isArray(item_ids) || !item_ids.length) return res.status(400).json({ error: 'item_ids required' });
  try {
    for (const itemId of item_ids) {
      await mssql.query('UPDATE super_price_list_items SET is_active = @p1 WHERE id = @p2', [is_active ? 1 : 0, itemId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH apply markup_percent to all active items in a super price list
router.patch('/:id/bulk-markup', async (req, res) => {
  const { id } = req.params;
  const { markup_percent } = req.body;
  if (markup_percent === undefined || markup_percent === null) return res.status(400).json({ error: 'markup_percent required' });
  try {
    await ensureSuperPriceListItemWhccMetadataColumns();
    await ensureWhccVariantsTable();
    const markupValue = Number(markup_percent);
    if (!Number.isFinite(markupValue) || markupValue < 0) return res.status(400).json({ error: 'markup_percent must be a non-negative number' });

    // Set-based updates (single round-trip) for all active items and active variants.
    const result = await mssql.query(
      `SET NOCOUNT ON;

       UPDATE spi
       SET spi.markup_percent = @p2
       FROM super_price_list_items spi
       WHERE spi.super_price_list_id = @p1
         AND spi.is_active = 1
         AND ISNULL(spi.is_deleted, 0) = 0
         AND spi.base_cost IS NOT NULL
         AND spi.base_cost > 0;

       DECLARE @updatedItems INT = @@ROWCOUNT;

       UPDATE v
       SET v.price = ROUND(CAST(v.base_cost AS DECIMAL(18,6)) * (1 + (@p2 / 100.0)), 2)
       FROM super_price_list_item_whcc_variants v
       INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
       WHERE spi.super_price_list_id = @p1
         AND spi.is_active = 1
         AND ISNULL(spi.is_deleted, 0) = 0
         AND v.is_active = 1
         AND v.base_cost IS NOT NULL
         AND v.base_cost > 0;

       DECLARE @updatedVariants INT = @@ROWCOUNT;

       SELECT @updatedItems AS updatedItems, @updatedVariants AS updatedVariants;`,
      [id, markupValue]
    );

    const meta = Array.isArray(result) && result[0]
      ? result[0]
      : { updatedItems: 0, updatedVariants: 0 };

    res.json({
      success: true,
      markup_percent: markupValue,
      updatedItems: Number(meta.updatedItems || 0),
      updatedVariants: Number(meta.updatedVariants || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET category images for a price list
router.get('/:id/category-images', async (req, res) => {
  const { id } = req.params;
  await ensureCategoryImagesTable();
  try {
    const rows = await mssql.query('SELECT category_name, image_url FROM super_price_list_category_images WHERE super_price_list_id = @p1', [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload/replace a category image
router.post('/:id/category-image', categoryImageUpload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { category_name } = req.body;
  if (!req.file || !category_name) return res.status(400).json({ error: 'image and category_name required' });
  await ensureCategoryImagesTable();
  try {
    const blobName = `price-list-categories/${id}/${Date.now()}-${req.file.originalname}`;
    const imageUrl = await uploadImageBufferToAzure(req.file.buffer, blobName, req.file.mimetype);
    const existing = await mssql.query('SELECT TOP 1 id FROM super_price_list_category_images WHERE super_price_list_id = @p1 AND category_name = @p2', [id, category_name]);
    if (existing.length) {
      await mssql.query('UPDATE super_price_list_category_images SET image_url = @p1, updated_at = GETDATE() WHERE super_price_list_id = @p2 AND category_name = @p3', [imageUrl, id, category_name]);
    } else {
      await mssql.query('INSERT INTO super_price_list_category_images (super_price_list_id, category_name, image_url) VALUES (@p1, @p2, @p3)', [id, category_name, imageUrl]);
    }
    res.json({ success: true, image_url: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

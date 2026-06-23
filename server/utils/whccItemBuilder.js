/**
 * Shared helpers for building WHCC OrderImport payloads.
 * Used by both orders.js (full order submission) and shipping.js (live quote).
 */

const parseNullableNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// extractWhccItemConfig
// Reads a product options snapshot and returns the resolved variant's
// productUID, productNodeID, and itemAttributeUIDs.
// ---------------------------------------------------------------------------
export function extractWhccItemConfig(productOptions) {
  const direct = productOptions || {};
  const nested = direct.whcc || direct.whccConfig || {};

  const variants = Array.isArray(direct.whccVariants)
    ? direct.whccVariants
        .map((variant) => {
          const uid = Number(variant?.whccProductUID || 0);
          if (!Number.isInteger(uid) || uid <= 0) return null;
          const nodeIds = Array.isArray(variant?.whccProductNodeIDs)
            ? variant.whccProductNodeIDs.map(Number).filter((v) => Number.isInteger(v) && v > 0)
            : [];
          const attrIds = Array.isArray(variant?.whccItemAttributeUIDs)
            ? variant.whccItemAttributeUIDs.map(Number).filter((v) => Number.isInteger(v) && v > 0)
            : [];
          return {
            id: Number.isInteger(Number(variant?.id)) ? Number(variant.id) : null,
            localId: String(variant?.localId || ''),
            displayName: String(variant?.displayName || ''),
            whccProductUID: uid,
            whccProductNodeIDs: nodeIds,
            whccItemAttributeUIDs: attrIds,
            baseCost: parseNullableNumber(variant?.baseCost ?? variant?.base_cost),
            price: parseNullableNumber(variant?.price),
            isDefault: Boolean(variant?.isDefault),
            isActive: variant?.isActive === undefined ? true : Boolean(variant?.isActive),
          };
        })
        .filter(Boolean)
    : [];

  const selectedVariantId =
    Number(direct.whccSelectedVariantId ?? direct.selectedWhccVariantId ?? direct.selectedVariantId) || null;
  const selectedVariantLocalId = String(
    direct.whccSelectedVariantLocalId ?? direct.selectedWhccVariantLocalId ?? ''
  ).trim();

  const selectedVariant =
    variants.find((v) => v?.id && selectedVariantId && Number(v.id) === selectedVariantId) ||
    variants.find((v) => selectedVariantLocalId && v?.localId === selectedVariantLocalId) ||
    variants.find((v) => v?.isDefault && v?.isActive) ||
    variants.find((v) => v?.isActive) ||
    variants.find((v) => v?.isDefault) ||
    variants[0] ||
    null;

  return {
    productUID:
      Number(
        selectedVariant?.whccProductUID ??
        direct.whccProductUID ??
        direct.productUID ??
        nested.productUID ??
        nested.ProductUID
      ) || null,
    productNodeIDs:
      Array.isArray(selectedVariant?.whccProductNodeIDs) && selectedVariant.whccProductNodeIDs.length
        ? selectedVariant.whccProductNodeIDs
        : [],
    itemAttributeUIDs:
      Array.isArray(selectedVariant?.whccItemAttributeUIDs) && selectedVariant.whccItemAttributeUIDs.length
        ? selectedVariant.whccItemAttributeUIDs
        : Array.isArray(direct.whccItemAttributeUIDs)
        ? direct.whccItemAttributeUIDs
        : Array.isArray(direct.itemAttributeUIDs)
        ? direct.itemAttributeUIDs
        : Array.isArray(nested.itemAttributeUIDs)
        ? nested.itemAttributeUIDs
        : [],
    variantDisplayName: selectedVariant?.displayName || null,
  };
}

// ---------------------------------------------------------------------------
// getCatalogProducts
// Flattens various WHCC catalog response shapes into a flat array of products.
// ---------------------------------------------------------------------------
export function getCatalogProducts(catalogPayload) {
  if (Array.isArray(catalogPayload?.Products)) return catalogPayload.Products;
  if (Array.isArray(catalogPayload?.products)) return catalogPayload.products;
  if (Array.isArray(catalogPayload?.Categories)) {
    return catalogPayload.Categories.flatMap((c) => {
      const catName = c?.Name ?? c?.CategoryName ?? c?.name ?? '';
      return (Array.isArray(c?.ProductList) ? c.ProductList : []).map((p) => {
        p._whccCategoryName = catName;
        return p;
      });
    });
  }
  if (Array.isArray(catalogPayload?.categories)) {
    return catalogPayload.categories.flatMap((c) => {
      const catName = c?.name ?? c?.categoryName ?? '';
      return (Array.isArray(c?.productList) ? c.productList : []).map((p) => {
        p._whccCategoryName = catName;
        return p;
      });
    });
  }
  if (Array.isArray(catalogPayload)) return catalogPayload;
  return [];
}

// ---------------------------------------------------------------------------
// getCatalogProductUID
// ---------------------------------------------------------------------------
export function getCatalogProductUID(product) {
  return (
    Number(
      product?.ProductUID ??
      product?.productUID ??
      product?.ProductId ??
      product?.productId ??
      product?.Id ??
      product?.id ??
      product?.UID
    ) || null
  );
}

// ---------------------------------------------------------------------------
// getCatalogProductNodeIDs
// Returns all ProductNode IDs for a catalog product (multi-node aware).
// ---------------------------------------------------------------------------
export function getCatalogProductNodeIDs(catalogProduct) {
  const nodes = catalogProduct?.ProductNodes ?? catalogProduct?.productNodes ?? [];
  if (Array.isArray(nodes) && nodes.length > 0) {
    const ids = nodes
      .map((n) => Number(n?.DP2NodeID ?? n?.dp2NodeID ?? n?.ProductNodeID ?? n?.productNodeID ?? 0))
      .filter((v) => v > 0);
    if (ids.length > 0) return ids;
  }
  const single = Number(
    catalogProduct?.ProductNodeID ??
    catalogProduct?.productNodeID ??
    catalogProduct?.DP2NodeID ??
    0
  ) || null;
  return [single || 10000];
}

// ---------------------------------------------------------------------------
// resolveAttributeParents
// Given a list of selected attribute UIDs and the catalog product, adds any
// required parent attribute UIDs so WHCC doesn't reject the import.
// Mirrors the PATCH logic in orders.js submitOrderToWhcc.
// ---------------------------------------------------------------------------
export function resolveAttributeParents(selectedUIDs, catalogProduct) {
  const attributeCategories =
    catalogProduct?.AttributeCategories ??
    catalogProduct?.attributeCategories ??
    [];

  if (!Array.isArray(attributeCategories) || attributeCategories.length === 0) {
    return Array.from(new Set(selectedUIDs));
  }

  const getOptions = (category) =>
    Array.isArray(category?.Attributes)
      ? category.Attributes
      : Array.isArray(category?.attributes)
      ? category.attributes
      : [];

  const getAttrUid = (attr) =>
    Number(attr?.Id ?? attr?.AttributeUID ?? attr?.attributeUID ?? attr?.id ?? 0) || null;
  const getParentUid = (attr) =>
    Number(attr?.ParentAttributeUID ?? attr?.parentAttributeUID ?? 0) || null;

  const uidToAttr = new Map();
  const uidToCategory = new Map();
  for (const category of attributeCategories) {
    for (const attr of getOptions(category)) {
      const uid = getAttrUid(attr);
      if (uid > 0) {
        uidToAttr.set(uid, attr);
        uidToCategory.set(uid, category);
      }
    }
  }

  const selected = Array.from(new Set(selectedUIDs.map(Number).filter((v) => Number.isInteger(v) && v > 0)));

  const resolveParentDeps = () => {
    let changed = true;
    const visited = new Set();
    while (changed) {
      changed = false;
      for (const uid of [...selected]) {
        if (visited.has(uid)) continue;
        visited.add(uid);
        const attr = uidToAttr.get(uid);
        if (!attr) continue;
        const parentUid = getParentUid(attr);
        if (!parentUid || selected.includes(parentUid)) continue;
        // Remove conflicting siblings from the parent's category
        const parentCat = uidToCategory.get(parentUid);
        if (parentCat) {
          const catAttrIds = getOptions(parentCat).map((a) => getAttrUid(a)).filter((v) => v > 0);
          for (const conflictUid of catAttrIds) {
            if (conflictUid !== parentUid) {
              const idx = selected.indexOf(conflictUid);
              if (idx !== -1) selected.splice(idx, 1);
            }
          }
        }
        if (!selected.includes(parentUid)) selected.push(parentUid);
        changed = true;
      }
    }
  };

  resolveParentDeps();
  return selected;
}

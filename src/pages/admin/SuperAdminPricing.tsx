
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// ...existing imports...

type ProductWhccAttrsState = {
  [prodKey: string]: {
    loading: boolean;
    attrs: null | {
      required: Array<{ name: string; description?: string }>;
      optional: Array<{ name: string; description?: string }>;
      whccCost?: string;
    };
    error?: string;
    shown: boolean;
  }
};



import AdminLayout from '../../components/AdminLayout';
import AdminWhccImport from '../../components/AdminWhccImport';
import AdminMpixImport from '../../components/AdminMpixImport';
import Modal from '../../components/Modal/Modal';
import { PriceList } from '../../types/index';
import { superPriceListService } from '../../services/superPriceListService';
import { whccService } from '../../services/whccService';

// ...existing code...



type SuperPriceListRow = PriceList & { linkedStudioCount?: number };

// Indeterminate checkbox helper
const IndeterminateCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, indeterminate, onChange, disabled }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      disabled={disabled}
      onClick={e => e.stopPropagation()}
    />
  );
};

// Strip trailing dimension tokens so "Photo Print 4x6" and "Photo Print 5x7"
// both group under "Photo Print", with size kept from size_name or extracted.
function baseProductName(name: string): string {
  return (name || 'Unknown')
    .replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\s*$/i, '')
    .replace(/\s*[-–]\s*\d+(?:\.\d+)?x\d+(?:\.\d+)?\s*$/i, '')
    .replace(/\s*\(\d+(?:\.\d+)?x\d+(?:\.\d+)?\)\s*$/i, '')
    .trim() || (name || 'Unknown');
}

function sizeLabel(item: any): string {
  if (item.size_name && item.size_name.trim()) return item.size_name.trim();
  const m = (item.product_name || '').match(/(\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?)/i);
  return m ? m[1] : (item.product_name || '');
}

function groupItems(items: any[]): Record<string, Record<string, any[]>> {
  const grouped: Record<string, Record<string, any[]>> = {};
  items.forEach(item => {
    const cat = item.product_category || 'Uncategorized';
    const prod = baseProductName(item.product_name || 'Unknown');
    if (!grouped[cat]) grouped[cat] = {};
    if (!grouped[cat][prod]) grouped[cat][prod] = [];
    item._sizeLabel = sizeLabel(item);
    grouped[cat][prod].push(item);
  });
  // sort sizes naturally within each product group
  Object.values(grouped).forEach(prods =>
    Object.values(prods).forEach(sizes =>
      sizes.sort((a, b) =>
        a._sizeLabel.localeCompare(b._sizeLabel, undefined, { numeric: true })
      )
    )
  );
  return grouped;
}

type ItemDraft = {
  base_cost: string;
  markup_percent: string;
  whccProductUID: string;
  whccProductNodeID: string;
  whccItemAttributeUIDs: string;
  whccVariantsJson: string;
  digitalDownloadScope: 'photo' | 'album';
  digitalPricingMode: 'fixed' | 'percentage';
  superAdminPercentage: string;
};

type WhccVariant = {
  id?: number | null;
  displayName?: string;
  whccProductUID: number;
  whccProductNodeIDs?: number[];
  whccItemAttributeUIDs?: number[];
  baseCost?: number | null;
  price?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
};

type EditableWhccVariant = {
  localId: string;
  displayName: string;
  baseCost: string;
  price: string;
  whccProductUID: string;
  whccProductNodeIDs: string;
  whccItemAttributeUIDs: string;
  isDefault: boolean;
  isActive: boolean;
};

type AttributePricingConfig = {
  percent: string;
  roundingSuffix: string;
};

const ATTRIBUTE_ROUNDING_OPTIONS = ['.00', '.05', '.25', '.50', '.95', '.99'] as const;
const DEFAULT_ATTRIBUTE_ROUNDING_SUFFIX = '.95';

const normalizeRoundingSuffix = (value: string): string => {
  const normalized = String(value || '').trim();
  return ATTRIBUTE_ROUNDING_OPTIONS.includes(normalized as typeof ATTRIBUTE_ROUNDING_OPTIONS[number])
    ? normalized
    : DEFAULT_ATTRIBUTE_ROUNDING_SUFFIX;
};

const normalizeMoneyString = (value: string): string => {
  if (value === '' || value === null || value === undefined) return '';
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '';
};

const hasMeaningfulVariantContent = (variant: {
  displayName?: string;
  whccItemAttributeUIDs?: number[];
} | null | undefined): boolean => {
  const displayName = String(variant?.displayName || '').trim();
  const attrCount = Array.isArray(variant?.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs.length : 0;
  return displayName.length > 0 || attrCount > 0;
};

const pruneBlankVariants = <T extends { displayName?: string; whccItemAttributeUIDs?: number[]; isDefault?: boolean; isActive?: boolean }>(variants: T[]): T[] => {
  if (!Array.isArray(variants) || variants.length === 0) return [];
  const hasMeaningful = variants.some((variant) => hasMeaningfulVariantContent(variant));
  if (!hasMeaningful) return variants;

  const filtered = variants.filter((variant) => hasMeaningfulVariantContent(variant));
  if (!filtered.some((variant) => variant.isDefault) && filtered.length > 0) {
    filtered[0] = {
      ...filtered[0],
      isDefault: true,
      isActive: true,
    };
  }
  return filtered;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
};

const roundPriceToSuffix = (rawValue: number, suffix: string): number => {
  if (!Number.isFinite(rawValue)) return 0;
  const normalizedSuffix = normalizeRoundingSuffix(suffix);
  const suffixNumber = Number(normalizedSuffix);
  const whole = Math.floor(rawValue);
  let candidate = Number((whole + suffixNumber).toFixed(2));
  if (candidate + 0.0001 < rawValue) {
    candidate = Number((whole + 1 + suffixNumber).toFixed(2));
  }
  return candidate;
};

const normalizeWhccAttributeCategories = (categories: any[]): Array<{
  id: number | null;
  name: string;
  requiredLevel: number;
  multValueAllowed: boolean;
  sortOrder: number;
  attributes: Array<{ uid: number; parentUid: number; name: string; sortOrder: number }>;
}> => {
  if (!Array.isArray(categories)) return [];

  return categories
    .map((category: any) => {
      const attributes = Array.isArray(category?.attributes ?? category?.Attributes)
        ? (category.attributes ?? category.Attributes)
            .map((attribute: any) => {
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
            .sort((a: any, b: any) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name)))
        : [];

      return {
        id: Number(category?.id ?? category?.Id ?? 0) || null,
        name: String(category?.name ?? category?.AttributeCategoryName ?? '').trim(),
        requiredLevel: Number(category?.requiredLevel ?? category?.RequiredLevel ?? -1),
        multValueAllowed: Boolean(category?.multValueAllowed ?? category?.MultValueAllowedFlag),
        sortOrder: Number(category?.sortOrder ?? category?.SortOrder ?? 0),
        attributes,
      };
    })
    .filter((category) => category.attributes.length > 0)
    .sort((a, b) => (a.requiredLevel - b.requiredLevel) || (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
};

const normalizeVariantDisplayName = (categoryName: string, attributeName: string): string => {
  const rawName = String(attributeName || '').trim();
  const category = String(categoryName || '').trim().toLowerCase();
  if (!rawName) return '';
  if (category.includes('paper')) return rawName.replace(/\s+paper$/i, '').trim();
  if (category.includes('coating')) return rawName.replace(/\s+coating$/i, '').trim();
  if (category.includes('texture')) return rawName.replace(/\s+texture$/i, '').trim();
  return rawName;
};

const buildDefaultWhccVariantsFromCategories = (item: any): WhccVariant[] => {
  const productUID = Number(item?.whccProductUID || 0);
  if (!Number.isInteger(productUID) || productUID <= 0) return [];

  const categories = normalizeWhccAttributeCategories(item?.whccAttributeCategories);
  if (!categories.length) return [];

  const attrLookup = new Map<number, { uid: number; parentUid: number; name: string; sortOrder: number; categoryName: string; requiredLevel: number }>();
  for (const category of categories) {
    for (const attribute of category.attributes) {
      attrLookup.set(attribute.uid, {
        ...attribute,
        categoryName: category.name,
        requiredLevel: category.requiredLevel,
      });
    }
  }

  const expandWithParents = (uid: number, acc: number[] = []): number[] => {
    const numericUid = Number(uid || 0);
    if (!Number.isInteger(numericUid) || numericUid <= 0 || acc.includes(numericUid)) return acc;
    const attribute = attrLookup.get(numericUid);
    if (attribute?.parentUid) expandWithParents(attribute.parentUid, acc);
    if (!acc.includes(numericUid)) acc.push(numericUid);
    return acc;
  };

  const baseRequiredAttrUids: number[] = [];
  let variantChoiceCategory: any = null;

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

  const fallbackNodeID = Number(item?.whccProductNodeID || 0);
  const nodeIds = Number.isInteger(fallbackNodeID) && fallbackNodeID > 0 ? [fallbackNodeID] : [];
  const baseCost = normalizeNullableNumber(item?.base_cost);
  const markupPercent = Number(item?.markup_percent || 0);
  const price = baseCost !== null && Number.isFinite(markupPercent)
    ? Number((baseCost + (baseCost * markupPercent / 100)).toFixed(2))
    : baseCost;

  if (!variantChoiceCategory) {
    const fallbackAttrs = baseRequiredAttrUids.length
      ? [...baseRequiredAttrUids]
      : expandWithParents(categories[0].attributes[0].uid, []);
    return [{
      displayName: normalizeVariantDisplayName(categories[0].name, categories[0].attributes[0].name),
      whccProductUID: productUID,
      whccProductNodeIDs: nodeIds,
      whccItemAttributeUIDs: fallbackAttrs,
      baseCost,
      price,
      isDefault: true,
      isActive: true,
    }];
  }

  return variantChoiceCategory.attributes.map((attribute: any, index: number) => {
    const attrUids = [...baseRequiredAttrUids];
    expandWithParents(attribute.uid, attrUids);
    return {
      displayName: normalizeVariantDisplayName(variantChoiceCategory.name, attribute.name),
      whccProductUID: productUID,
      whccProductNodeIDs: nodeIds,
      whccItemAttributeUIDs: [...new Set(attrUids)],
      baseCost,
      price,
      isDefault: index === 0,
      isActive: index === 0,
    } as WhccVariant;
  });
};

const toEditableWhccVariant = (variant: WhccVariant, index: number): EditableWhccVariant => ({
  localId: `${Number(variant.id || 0)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
  displayName: String(variant.displayName || ''),
  baseCost: normalizeMoneyString(String(variant.baseCost ?? '')),
  price: normalizeMoneyString(String(variant.price ?? '')),
  whccProductUID: String(variant.whccProductUID || ''),
  whccProductNodeIDs: Array.isArray(variant.whccProductNodeIDs) ? variant.whccProductNodeIDs.join(', ') : '',
  whccItemAttributeUIDs: Array.isArray(variant.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs.join(', ') : '',
  isDefault: Boolean(variant.isDefault),
  isActive: (variant.isActive === undefined ? true : Boolean(variant.isActive)) || Boolean(variant.isDefault),
});

const parsePositiveIntList = (value: string): number[] => String(value || '')
  .split(',')
  .map((part) => Number(part.trim()))
  .filter((num) => Number.isInteger(num) && num > 0);

const fromEditableWhccVariant = (row: EditableWhccVariant): WhccVariant | null => {
  const uid = Number(String(row.whccProductUID || '').trim());
  if (!Number.isInteger(uid) || uid <= 0) return null;

  return {
    displayName: String(row.displayName || '').trim(),
    baseCost: normalizeNullableNumber(row.baseCost),
    price: normalizeNullableNumber(row.price),
    whccProductUID: uid,
    whccProductNodeIDs: parsePositiveIntList(row.whccProductNodeIDs),
    whccItemAttributeUIDs: parsePositiveIntList(row.whccItemAttributeUIDs),
    isDefault: Boolean(row.isDefault),
    isActive: Boolean(row.isActive),
  };
};

type WhccCatalogEntry = {
  key: string;
  category: string;
  name: string;
  description: string;
  productUID: number;
  productNodeID: number | null;
  itemAttributeUIDs: number[];
  searchText: string;
};

type WhccMatchCandidate = {
  entry: WhccCatalogEntry;
  score: number;
};

type WhccAutoMatchReportRow = {
  itemId: number;
  productName: string;
  sizeName: string;
  status: 'ready' | 'review' | 'mapped';
  score: number;
  suggestion: WhccCatalogEntry | null;
};

function getWhccProductUID(prod: any): number {
  const raw = prod?.productUID ?? prod?.ProductUID ?? prod?.productUid ?? prod?.ProductUid ?? prod?.Id ?? prod?.id;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function getWhccProductNodeID(prod: any): number | null {
  const raw =
    prod?.ProductNodeID ??
    prod?.productNodeID ??
    prod?.DefaultProductNodeID ??
    prod?.defaultProductNodeID ??
    (Array.isArray(prod?.ProductNodes)
      ? (prod.ProductNodes[0]?.DP2NodeID ?? prod.ProductNodes[0]?.ProductNodeID)
      : null) ??
    (Array.isArray(prod?.productNodes)
      ? (prod.productNodes[0]?.dp2NodeID ?? prod.productNodes[0]?.productNodeID)
      : null);
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getWhccItemAttributeUIDs(prod: any): number[] {
  const attrs =
    prod?.DefaultItemAttributes ??
    prod?.defaultItemAttributes ??
    prod?.ItemAttributes ??
    prod?.itemAttributes ??
    [];

  if (!Array.isArray(attrs)) return [];

  return attrs
    .map((attr: any) => Number(attr?.AttributeUID ?? attr?.attributeUID ?? attr?.uid ?? attr))
    .filter((value: number) => Number.isInteger(value) && value > 0);
}

function normalizeWhccCatalog(rawCatalog: any): WhccCatalogEntry[] {
  const categories = Array.isArray(rawCatalog?.Categories)
    ? rawCatalog.Categories
    : Array.isArray(rawCatalog?.products)
    ? [{ Name: 'Fallback', ProductList: rawCatalog.products }]
    : Array.isArray(rawCatalog)
    ? [{ Name: 'Fallback', ProductList: rawCatalog }]
    : [];

  return categories.flatMap((category: any, categoryIndex: number) => {
    const categoryName = String(category?.Name || category?.name || 'Uncategorized');
    const productList = Array.isArray(category?.ProductList) ? category.ProductList : [];

    return productList
      .map((product: any, productIndex: number) => {
        const productUID = getWhccProductUID(product);
        if (!productUID) return null;

        const name = String(product?.Name || product?.name || product?.Description || product?.description || `WHCC Product ${productUID}`);
        const description = String(product?.Description || product?.description || '');
        const itemAttributeUIDs = getWhccItemAttributeUIDs(product);
        const productNodeID = getWhccProductNodeID(product);

        return {
          key: `${categoryIndex}-${productIndex}-${productUID}`,
          category: categoryName,
          name,
          description,
          productUID,
          productNodeID,
          itemAttributeUIDs,
          searchText: `${categoryName} ${name} ${description} ${itemAttributeUIDs.join(' ')}`.toLowerCase(),
        } as WhccCatalogEntry;
      })
      .filter(Boolean) as WhccCatalogEntry[];
  });
}

function buildItemDrafts(items: any[]): Record<number, ItemDraft> {
  const drafts: Record<number, ItemDraft> = {};
  items.forEach(item => {
    const scope = String(item.digitalDownloadScope || '').toLowerCase() === 'album' ? 'album' : 'photo';
    const pricingMode = String(item.digitalPricingMode || '').toLowerCase() === 'percentage' ? 'percentage' : 'fixed';
    const generatedCategoryVariants = buildDefaultWhccVariantsFromCategories(item);
    const fallbackVariants: WhccVariant[] = Number(item.whccProductUID || 0) > 0
      ? [{
          whccProductUID: Number(item.whccProductUID),
          whccProductNodeIDs: Number(item.whccProductNodeID || 0) > 0 ? [Number(item.whccProductNodeID)] : [],
          whccItemAttributeUIDs: Array.isArray(item.whccItemAttributeUIDs) ? item.whccItemAttributeUIDs : [],
          isDefault: true,
          isActive: true,
        }]
      : [];
    const variants = Array.isArray(item.whccVariants) && item.whccVariants.length
      ? item.whccVariants
      : generatedCategoryVariants.length
      ? generatedCategoryVariants
      : fallbackVariants;

    drafts[item.id] = {
      base_cost: String(item.base_cost ?? ''),
      markup_percent: String(item.markup_percent ?? ''),
      whccProductUID: String(item.whccProductUID ?? ''),
      whccProductNodeID: String(item.whccProductNodeID ?? ''),
      whccItemAttributeUIDs: Array.isArray(item.whccItemAttributeUIDs) ? item.whccItemAttributeUIDs.join(', ') : '',
      whccVariantsJson: JSON.stringify(variants, null, 2),
      digitalDownloadScope: scope,
      digitalPricingMode: pricingMode,
      superAdminPercentage: String(item.superAdminPercentage ?? ''),
    };
  });
  return drafts;
}

function getCategoryImageMode(categoryName: string): string {
  const category = String(categoryName || '').toLowerCase();

  if (category.includes('framed prints') || category.includes('framed print')) {
    return 'Single image';
  }

  if (
    category.includes('albums') ||
    category.includes('books') ||
    category.includes('press printed books')
  ) {
    return 'Multi image';
  }

  return 'Unknown';
}

const SuperAdminPricing: React.FC = () => {
    // --- Product-level WHCC attribute state and handlers ---
    const [productWhccAttrs, setProductWhccAttrs] = useState<ProductWhccAttrsState>({});
    const handleShowWhccAttrs = useCallback(async (prodKey: string, productUid: number | undefined) => {
      if (!productUid) return;
      setProductWhccAttrs((prev) => ({
        ...prev,
        [prodKey]: { ...(prev[prodKey] || {}), loading: true, shown: true, error: undefined },
      }));
      try {
        const raw = await superPriceListService.getWhccProductAttributes(productUid);
        // Accept both new and legacy backend responses
        let categories = [];
        if (Array.isArray(raw.AttributeCategories)) {
          categories = raw.AttributeCategories;
        } else if (Array.isArray(raw.requiredAttributes) || Array.isArray(raw.optionalAttributes)) {
          // Legacy: synthesize categories from required/optional arrays
          categories = [];
          if (Array.isArray(raw.requiredAttributes) && raw.requiredAttributes.length > 0) {
            categories.push({
              AttributeCategoryName: 'Required',
              RequiredLevel: 1,
              Attributes: raw.requiredAttributes,
            });
          }
          if (Array.isArray(raw.optionalAttributes) && raw.optionalAttributes.length > 0) {
            categories.push({
              AttributeCategoryName: 'Optional',
              RequiredLevel: 0,
              Attributes: raw.optionalAttributes,
            });
          }
        }
        // Group attributes by RequiredLevel
        const required: Array<{ name: string; description?: string }> = [];
        const optional: Array<{ name: string; description?: string }> = [];
        for (const cat of categories) {
          const attrs = Array.isArray(cat.Attributes) ? cat.Attributes : [];
          if (Number(cat.RequiredLevel) === 1) {
            required.push(...attrs.map((a: any) => ({ name: a.AttributeName || a.name || '', description: a.Description || a.description })));
          } else if (Number(cat.RequiredLevel) === 0 || Number(cat.RequiredLevel) === -1) {
            optional.push(...attrs.map((a: any) => ({ name: a.AttributeName || a.name || '', description: a.Description || a.description })));
          }
        }
        setProductWhccAttrs((prev) => ({
          ...prev,
          [prodKey]: { loading: false, attrs: { required, optional, whccCost: raw.whccCost }, shown: true },
        }));
      } catch (e: any) {
        setProductWhccAttrs((prev) => ({
          ...prev,
          [prodKey]: { loading: false, attrs: null, shown: true, error: 'Failed to load WHCC attributes' },
        }));
      }
    }, []);
    const handleHideWhccAttrs = useCallback((prodKey: string) => {
      setProductWhccAttrs((prev) => ({
        ...prev,
        [prodKey]: { ...(prev[prodKey] || {}), shown: false },
      }));
    }, []);
  const [importType, setImportType] = useState<null | 'whcc' | 'csv' | 'mpix'>(null);
  const [priceLists, setPriceLists] = useState<SuperPriceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingListId, setDeletingListId] = useState<number | null>(null);

  // ── View/Edit modal state ──────────────────────────────────────────────────
  const [viewList, setViewList] = useState<PriceList | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');
  const [viewSearch, setViewSearch] = useState('');
  // item drafts: local editable values (auto-saved on blur)
  const [itemDrafts, setItemDrafts] = useState<Record<number, ItemDraft>>({});
  const [autoSaving, setAutoSaving] = useState<Record<number, boolean>>({});
  const [togglingActive, setTogglingActive] = useState(false);
  // collapse state
  const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
  const [prodCollapsed, setProdCollapsed] = useState<Record<string, boolean>>({});
  // global markup
  const [globalMarkup, setGlobalMarkup] = useState('');
  const [applyingMarkup, setApplyingMarkup] = useState(false);
  // category images
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [productImages, setProductImages] = useState<Record<number, string>>({});
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadingProduct, setUploadingProduct] = useState<number | null>(null);
  const catImgInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const prodImgInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
    // Product image upload
    // Upload product image at the product group (product_id) level
    const handleProductImageUpload = async (productId: number, file: File) => {
      setUploadingProduct(productId);
      try {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('product_id', String(productId));
        const url = await superPriceListService.uploadProductImage(viewList!.id, formData);
        setProductImages(prev => ({ ...prev, [productId]: url }));
      } catch { setViewError('Failed to upload product image.'); }
      finally { setUploadingProduct(null); }
    };
  // manual add inputs
  const [manualProductName, setManualProductName] = useState('');
  const [manualSizeName, setManualSizeName] = useState('');
  const [manualCategory, setManualCategory] = useState('Digital');
  const [manualBaseCost, setManualBaseCost] = useState('');
  const [manualMarkup, setManualMarkup] = useState('');
  const [manualDigitalScope, setManualDigitalScope] = useState<'photo' | 'album'>('photo');
  const [manualDigitalPricingMode, setManualDigitalPricingMode] = useState<'fixed' | 'percentage'>('fixed');
  const [manualSuperAdminPercentage, setManualSuperAdminPercentage] = useState('20');
  const [addingManual, setAddingManual] = useState(false);
  const [whccCatalog, setWhccCatalog] = useState<WhccCatalogEntry[]>([]);
  const [whccCatalogLoading, setWhccCatalogLoading] = useState(false);
  const [, setWhccCatalogError] = useState('');
  const [showZeroCostOnly, setShowZeroCostOnly] = useState(false);
  const [autoMatchingWhcc, setAutoMatchingWhcc] = useState(false);
  const [syncingWhccCosts, setSyncingWhccCosts] = useState(false);
  const [fillingWhccNodes, setFillingWhccNodes] = useState(false);
  const [bootstrappingWhccVariants, setBootstrappingWhccVariants] = useState(false);
  const [whccReportRows, setWhccReportRows] = useState<WhccAutoMatchReportRow[]>([]);
  const [whccReportVisible, setWhccReportVisible] = useState(false);
  const [activeVariantItemId, setActiveVariantItemId] = useState<number | null>(null);
  const [variantDraftsByItem, setVariantDraftsByItem] = useState<Record<number, EditableWhccVariant[]>>({});
  const [selectedVariantPreviewByItem, setSelectedVariantPreviewByItem] = useState<Record<number, string>>({});
  const [attributePricingConfigByItem, setAttributePricingConfigByItem] = useState<Record<number, AttributePricingConfig>>({});
  const [savingVariantItemId, setSavingVariantItemId] = useState<number | null>(null);
  const [expandedSizeRows, setExpandedSizeRows] = useState<Record<number, boolean>>({});
  const [savingProductAttributeKey, setSavingProductAttributeKey] = useState<string | null>(null);

  // derive grouped structure from viewItems
  const viewGrouped = useMemo(() => groupItems(viewItems), [viewItems]);
  const allCategoryNames = useMemo(
    () => Array.from(new Set([...Object.keys(viewGrouped), ...Object.keys(categoryImages)])).sort((a, b) => a.localeCompare(b)),
    [viewGrouped, categoryImages]
  );

  // ── Helpers ────────────────────────────────────────────────────────────────
  const itemIdsForCat = useCallback((cat: string) =>
    Object.values(viewGrouped[cat] || {}).flat().map((i: any) => i.id as number),
    [viewGrouped]);

  const itemIdsForProd = useCallback((cat: string, prod: string) =>
    (viewGrouped[cat]?.[prod] || []).map((i: any) => i.id as number),
    [viewGrouped]);

  const allActiveInGroup = (ids: number[]) => ids.length > 0 && ids.every(id => viewItems.find(i => i.id === id)?.is_active);
  const someActiveInGroup = (ids: number[]) => ids.some(id => viewItems.find(i => i.id === id)?.is_active);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadPriceLists = async () => {
    setLoading(true);
    try {
      const response = await superPriceListService.getLists();
      setPriceLists(response || []);
      setError('');
    } catch {
      setError('Failed to load price lists');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPriceLists(); }, []);

  const openViewEdit = async (list: SuperPriceListRow) => {
    setViewList(list);
    setViewItems([]);
    setViewError('');
    setViewLoading(true);
    setViewSearch('');
    setItemDrafts({});
    setGlobalMarkup('');
    setCategoryImages({});
    setCatCollapsed({});
    setProdCollapsed({});
    setWhccReportRows([]);
    setWhccReportVisible(false);
    setActiveVariantItemId(null);
    setVariantDraftsByItem({});
    setSelectedVariantPreviewByItem({});
    setAttributePricingConfigByItem({});
    setExpandedSizeRows({});
    try {
      const [items, images, prodImgs] = await Promise.all([
        superPriceListService.getItems(list.id),
        superPriceListService.getCategoryImages(list.id).catch(() => []),
        superPriceListService.getProductImages ? superPriceListService.getProductImages(list.id).catch(() => []) : Promise.resolve([]),
      ]);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      setItemDrafts(buildItemDrafts(arr));
      const groupedItems = groupItems(arr);
      // init category images
      const imgMap: Record<string, string> = {};
      if (Array.isArray(images)) images.forEach((img: any) => { imgMap[img.category_name] = img.image_url || ''; });
      setCategoryImages(imgMap);
      // init product images (by product_id)
      const prodImgMap: Record<number, string> = {};
      if (prodImgs && typeof prodImgs === 'object' && !Array.isArray(prodImgs)) {
        Object.entries(prodImgs).forEach(([productId, imageUrl]) => {
          prodImgMap[Number(productId)] = imageUrl as string;
        });
      }
      setProductImages(prodImgMap);
      // collapse all categories by default
      const cats: Record<string, boolean> = {};
      Array.from(new Set([...Object.keys(groupedItems), ...Object.keys(imgMap)])).forEach(cat => { cats[cat] = true; });
      setCatCollapsed(cats);
    } catch {
      setViewError('Failed to load items for this price list.');
    } finally {
      setViewLoading(false);
    }
  };

  const closeViewEdit = () => {
    setViewList(null);
    setViewItems([]);
    setItemDrafts({});
    setWhccReportRows([]);
    setWhccReportVisible(false);
    setActiveVariantItemId(null);
    setVariantDraftsByItem({});
    setSelectedVariantPreviewByItem({});
    setAttributePricingConfigByItem({});
    setSavingVariantItemId(null);
    setExpandedSizeRows({});
  };

  const handleDeleteList = async (list: SuperPriceListRow) => {
    const linkedCount = Number(list.linkedStudioCount || 0);
    const confirmed = window.confirm(
      linkedCount > 0
        ? `Delete "${list.name}"? This will also delete ${linkedCount} linked studio price list${linkedCount === 1 ? '' : 's'}.`
        : `Delete "${list.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingListId(list.id);
    setError('');
    try {
      await superPriceListService.deleteList(list.id);
      if (viewList?.id === list.id) {
        closeViewEdit();
      }
      await loadPriceLists();
    } catch (err: any) {
      const details = err?.response?.data?.error || err?.message || 'Failed to delete price list';
      setError(String(details));
    } finally {
      setDeletingListId(null);
    }
  };

  const ensureWhccCatalogLoaded = useCallback(async () => {
    if (whccCatalog.length || whccCatalogLoading) return;
    setWhccCatalogLoading(true);
    setWhccCatalogError('');
    try {
      const rawCatalog = await whccService.getProductCatalog();
      const normalized = normalizeWhccCatalog(rawCatalog);
      setWhccCatalog(normalized);
      if (!normalized.length) {
        setWhccCatalogError('No WHCC catalog products were returned.');
      }
    } catch {
      setWhccCatalogError('Failed to load WHCC catalog.');
    } finally {
      setWhccCatalogLoading(false);
    }
  }, [whccCatalog, whccCatalogLoading]);

  const isZeroCostItem = useCallback((item: any) => {
    const raw = item?.base_cost;
    if (raw === null || raw === undefined || raw === '') return true;
    const value = Number(raw);
    return Number.isFinite(value) && Math.abs(value) < 0.0001;
  }, []);

  const itemNeedsWhccMapping = useCallback((item: any) => {
    const productUID = Number(item.whccProductUID || 0);
    const productNodeID = Number(item.whccProductNodeID || 0);
    const attributes = Array.isArray(item.whccItemAttributeUIDs) ? item.whccItemAttributeUIDs : [];
    return !(productUID > 0 && (productNodeID > 0 || attributes.length > 0));
  }, []);

  const handleManualAdd = async () => {
    if (!viewList) return;
    if (!manualProductName.trim() || !manualSizeName.trim()) {
      setViewError('Manual add requires product name and size name.');
      return;
    }
    setAddingManual(true);
    setViewError('');
    try {
      await superPriceListService.addItem(
        viewList.id,
        undefined,
        manualBaseCost !== '' ? Number(manualBaseCost) : undefined,
        manualMarkup !== '' ? Number(manualMarkup) : undefined,
        {
          product_name: manualProductName.trim(),
          size_name: manualSizeName.trim(),
          category: manualCategory.trim() || 'Digital',
          description: 'Digital download product added manually from Super Admin Pricing',
          is_digital_only: true,
          digital_download_scope: manualDigitalScope,
          digital_pricing_mode: manualDigitalPricingMode,
          ...(manualDigitalPricingMode === 'percentage'
            ? { super_admin_percentage: Number(manualSuperAdminPercentage || 0) }
            : {}),
        }
      );

      const items = await superPriceListService.getItems(viewList.id);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      setItemDrafts(buildItemDrafts(arr));

      setManualProductName('');
      setManualSizeName('');
      setManualCategory('Digital');
      setManualBaseCost('');
      setManualMarkup('');
      setManualDigitalScope('photo');
      setManualDigitalPricingMode('fixed');
      setManualSuperAdminPercentage('20');
    } catch (err: any) {
      const details = err?.response?.data?.error || err?.message || 'Failed to manually add item';
      setViewError(String(details));
    } finally {
      setAddingManual(false);
    }
  };

  // ── Auto-save on blur ──────────────────────────────────────────────────────
  const autoSaveItem = async (itemId: number, draftOverride?: ItemDraft) => {
    const draft = draftOverride || itemDrafts[itemId];
    const original = viewItems.find(i => i.id === itemId);
    if (!draft || !original) return;
    const newCost = draft.base_cost !== '' ? Number(draft.base_cost) : null;
    const newMarkup = draft.markup_percent !== '' ? Number(draft.markup_percent) : null;
    const originalAttributes = Array.isArray(original.whccItemAttributeUIDs) ? original.whccItemAttributeUIDs.join(',') : '';
    const newAttributes = draft.whccItemAttributeUIDs
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isInteger(value) && value > 0);
    const newWhccProductUID = draft.whccProductUID !== '' ? Number(draft.whccProductUID) : null;
    const newWhccProductNodeID = draft.whccProductNodeID !== '' ? Number(draft.whccProductNodeID) : null;
    const fallbackOriginalVariants: WhccVariant[] = Number(original.whccProductUID || 0) > 0
      ? [{
          whccProductUID: Number(original.whccProductUID),
          whccProductNodeIDs: Number(original.whccProductNodeID || 0) > 0 ? [Number(original.whccProductNodeID)] : [],
          whccItemAttributeUIDs: Array.isArray(original.whccItemAttributeUIDs) ? original.whccItemAttributeUIDs : [],
          isDefault: true,
          isActive: true,
        }]
      : [];
    const originalVariants: WhccVariant[] = Array.isArray(original.whccVariants) && original.whccVariants.length
      ? original.whccVariants
      : fallbackOriginalVariants;

    let parsedWhccVariants: WhccVariant[] = [];
    if (draft.whccVariantsJson.trim()) {
      try {
        const parsed = JSON.parse(draft.whccVariantsJson);
        if (!Array.isArray(parsed)) {
          setViewError('WHCC Variants JSON must be an array.');
          return;
        }
        parsedWhccVariants = parsed
          .map((variant: any) => {
            const uid = Number(variant?.whccProductUID || 0);
            if (!Number.isInteger(uid) || uid <= 0) return null;
            const nodeIds = Array.isArray(variant?.whccProductNodeIDs)
              ? variant.whccProductNodeIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0)
              : [];
            const attrIds = Array.isArray(variant?.whccItemAttributeUIDs)
              ? variant.whccItemAttributeUIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0)
              : [];
            return {
              ...(Number.isInteger(Number(variant?.id)) ? { id: Number(variant.id) } : {}),
              displayName: String(variant?.displayName || ''),
              baseCost: normalizeNullableNumber(variant?.baseCost),
              price: normalizeNullableNumber(variant?.price),
              whccProductUID: uid,
              whccProductNodeIDs: nodeIds,
              whccItemAttributeUIDs: attrIds,
              isDefault: Boolean(variant?.isDefault),
              isActive: variant?.isActive === undefined ? true : Boolean(variant?.isActive),
            };
          })
          .filter(Boolean) as WhccVariant[];
      } catch {
        setViewError('WHCC Variants JSON is invalid.');
        return;
      }
    }

    const normalizedOriginalVariants = JSON.stringify(originalVariants || []);
    const normalizedNewVariants = JSON.stringify(parsedWhccVariants || []);
    const lockSizePricing = (
      (Array.isArray(original?.whccVariants) && original.whccVariants.length > 0)
      || (Array.isArray(parsedWhccVariants) && parsedWhccVariants.length > 0)
      || (Array.isArray(original?.whccAttributeCategories) && original.whccAttributeCategories.length > 0)
    );
    const effectiveCost = lockSizePricing ? (original.base_cost ?? null) : newCost;
    const effectiveMarkup = lockSizePricing ? (original.markup_percent ?? null) : newMarkup;
    const newDigitalDownloadScope = draft.digitalDownloadScope === 'album' ? 'album' : 'photo';
    const newDigitalPricingMode = draft.digitalPricingMode === 'percentage' ? 'percentage' : 'fixed';
    const newSuperAdminPercentage = draft.superAdminPercentage !== '' ? Number(draft.superAdminPercentage) : 0;
    const normalizedSuperAdminPercentage = Number.isFinite(newSuperAdminPercentage)
      ? Math.max(0, Math.min(100, newSuperAdminPercentage))
      : 0;
    if (
      effectiveCost === original.base_cost &&
      effectiveMarkup === original.markup_percent &&
      String(newWhccProductUID ?? '') === String(original.whccProductUID ?? '') &&
      String(newWhccProductNodeID ?? '') === String(original.whccProductNodeID ?? '') &&
      newAttributes.join(',') === originalAttributes &&
      normalizedNewVariants === normalizedOriginalVariants &&
      (!original.isDigital || (
        newDigitalDownloadScope === (String(original.digitalDownloadScope || '').toLowerCase() === 'album' ? 'album' : 'photo') &&
        newDigitalPricingMode === (String(original.digitalPricingMode || '').toLowerCase() === 'percentage' ? 'percentage' : 'fixed') &&
        (newDigitalPricingMode !== 'percentage' || normalizedSuperAdminPercentage === (Number(original.superAdminPercentage) || 0))
      ))
    ) return;
    setAutoSaving(prev => ({ ...prev, [itemId]: true }));
    try {
      const updatePayload: any = {
        base_cost: effectiveCost,
        markup_percent: effectiveMarkup,
        whccProductUID: newWhccProductUID,
        whccProductNodeID: newWhccProductNodeID,
        whccItemAttributeUIDs: newAttributes,
        whccVariants: parsedWhccVariants,
      };
      if (original.isDigital) {
        updatePayload.digital_download_scope = newDigitalDownloadScope;
        updatePayload.digital_pricing_mode = newDigitalPricingMode;
        updatePayload.super_admin_percentage = newDigitalPricingMode === 'percentage' ? normalizedSuperAdminPercentage : null;
      }

      await superPriceListService.updateItem(viewList!.id, itemId, {
        ...updatePayload,
      });
      setViewItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        base_cost: effectiveCost,
        markup_percent: effectiveMarkup,
        whccProductUID: newWhccProductUID,
        whccProductNodeID: newWhccProductNodeID,
        whccItemAttributeUIDs: newAttributes,
        whccVariants: parsedWhccVariants,
        ...(original.isDigital
          ? {
              digitalDownloadScope: newDigitalDownloadScope,
              digitalPricingMode: newDigitalPricingMode,
              superAdminPercentage: newDigitalPricingMode === 'percentage' ? normalizedSuperAdminPercentage : 0,
            }
          : {}),
      } : i));
    } catch {
      setViewError('Failed to save item.');
    } finally {
      setAutoSaving(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    }
  };

  const getItemVariantsFromSource = useCallback((item: any, draftOverride?: ItemDraft): WhccVariant[] => {
    const draft = draftOverride || itemDrafts[item.id];

    if (draft?.whccVariantsJson && draft.whccVariantsJson.trim()) {
      try {
        const parsed = JSON.parse(draft.whccVariantsJson);
        if (Array.isArray(parsed)) {
          return pruneBlankVariants(parsed
            .map((variant: any) => {
              const uid = Number(variant?.whccProductUID || 0);
              if (!Number.isInteger(uid) || uid <= 0) return null;
              return {
                id: Number.isInteger(Number(variant?.id)) ? Number(variant.id) : null,
                displayName: String(variant?.displayName || ''),
                baseCost: normalizeNullableNumber(variant?.baseCost),
                price: normalizeNullableNumber(variant?.price),
                whccProductUID: uid,
                whccProductNodeIDs: Array.isArray(variant?.whccProductNodeIDs)
                  ? variant.whccProductNodeIDs.map(Number).filter((value: number) => Number.isInteger(value) && value > 0)
                  : [],
                whccItemAttributeUIDs: Array.isArray(variant?.whccItemAttributeUIDs)
                  ? variant.whccItemAttributeUIDs.map(Number).filter((value: number) => Number.isInteger(value) && value > 0)
                  : [],
                isDefault: Boolean(variant?.isDefault),
                isActive: (variant?.isActive === undefined ? true : Boolean(variant?.isActive)) || Boolean(variant?.isDefault),
              } as WhccVariant;
            })
            .filter(Boolean) as WhccVariant[]);
        }
      } catch {
        return [];
      }
    }

    const existingVariants: WhccVariant[] = Array.isArray(item?.whccVariants) && item.whccVariants.length
      ? pruneBlankVariants(item.whccVariants as WhccVariant[])
      : [];
    if (existingVariants.length) return existingVariants;

    const generatedFromCategories = buildDefaultWhccVariantsFromCategories(item);
    if (generatedFromCategories.length) return generatedFromCategories;

    const fallbackUID = Number(item?.whccProductUID || 0);
    if (!Number.isInteger(fallbackUID) || fallbackUID <= 0) return [];

    const fallbackNodeID = Number(item?.whccProductNodeID || 0);
    return [{
      displayName: '',
      baseCost: normalizeNullableNumber(item?.base_cost),
      price: (() => {
        const cost = Number(item?.base_cost || 0);
        const markupPercent = Number(item?.markup_percent || 0);
        if (Number.isFinite(cost) && Number.isFinite(markupPercent)) {
          return Number((cost + (cost * markupPercent / 100)).toFixed(2));
        }
        return null;
      })(),
      whccProductUID: fallbackUID,
      whccProductNodeIDs: Number.isInteger(fallbackNodeID) && fallbackNodeID > 0 ? [fallbackNodeID] : [],
      whccItemAttributeUIDs: Array.isArray(item?.whccItemAttributeUIDs) ? item.whccItemAttributeUIDs : [],
      isDefault: true,
      isActive: true,
    }];
  }, [itemDrafts]);

  const buildAttributePricingConfig = useCallback((item: any): AttributePricingConfig => ({
    percent: String(item?.attributePricingPercent ?? 0),
    roundingSuffix: normalizeRoundingSuffix(String(item?.attributePriceRoundingSuffix || DEFAULT_ATTRIBUTE_ROUNDING_SUFFIX)),
  }), []);

  const buildEmptyVariantRow = useCallback((item: any, index = 0): EditableWhccVariant => {
    const baseCost = normalizeMoneyString(String(item?.base_cost ?? ''));
    const markupPercent = Number(item?.markup_percent || 0);
    const derivedPrice = (() => {
      const base = Number(baseCost || 0);
      if (!Number.isFinite(base)) return '';
      if (!Number.isFinite(markupPercent)) return normalizeMoneyString(String(base));
      return normalizeMoneyString(String(base + (base * markupPercent / 100)));
    })();

    return {
      localId: `blank-${Number(item?.id || 0)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      displayName: '',
      baseCost,
      price: derivedPrice,
      whccProductUID: String(item?.whccProductUID || ''),
      whccProductNodeIDs: Number(item?.whccProductNodeID || 0) > 0 ? String(item.whccProductNodeID) : '',
      whccItemAttributeUIDs: Array.isArray(item?.whccItemAttributeUIDs) ? item.whccItemAttributeUIDs.join(', ') : '',
      isDefault: true,
      isActive: false,
    };
  }, []);

  const hasAttributeRows = useCallback((item: any): boolean => {
    const variants = getItemVariantsFromSource(item);
    if (!variants.length) return false;
    return variants.some((variant) => {
      const displayName = String(variant?.displayName || '').trim();
      const attrCount = Array.isArray(variant?.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs.length : 0;
      return displayName.length > 0 || attrCount > 0;
    });
  }, [getItemVariantsFromSource]);

  const hasVariantPricingRows = useCallback((item: any): boolean => {
    const draft = itemDrafts[item?.id];
    if (draft?.whccVariantsJson && draft.whccVariantsJson.trim()) {
      try {
        const parsed = JSON.parse(draft.whccVariantsJson);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      } catch {
        // ignore malformed draft json
      }
    }

    if (Array.isArray(item?.whccVariants) && item.whccVariants.length > 0) return true;
    if (Array.isArray(item?.whccAttributeCategories) && item.whccAttributeCategories.length > 0) return true;
    return false;
  }, [itemDrafts]);

  const shouldAutoOpenVariantEditor = useCallback((item: any): boolean => {
    const importedAttributeCategories = Array.isArray(item?.whccAttributeCategories) ? item.whccAttributeCategories : [];
    if (importedAttributeCategories.length > 0) return true;
    return hasAttributeRows(item);
  }, [hasAttributeRows]);

  const startVariantEdit = (item: any) => {
    const itemId = Number(item?.id || 0);
    if (!Number.isInteger(itemId) || itemId <= 0) return;
    const seededRows = pruneBlankVariants(getItemVariantsFromSource(item));
    const hasMeaningfulSeededRows = seededRows.some((row) => hasMeaningfulVariantContent(row));
    const rows = (seededRows.length
      ? seededRows.map((variant, index) => toEditableWhccVariant(variant, index))
      : [buildEmptyVariantRow(item)])
      .map((row, index) => ({
        ...row,
        isDefault: hasMeaningfulSeededRows ? row.isDefault : (index === 0 ? true : row.isDefault),
        isActive: hasMeaningfulSeededRows ? (row.isActive || row.isDefault) : ((index === 0 ? true : row.isActive) || row.isDefault),
      }));
    setVariantDraftsByItem((prev) => ({ ...prev, [itemId]: rows }));
    setAttributePricingConfigByItem((prev) => ({ ...prev, [itemId]: buildAttributePricingConfig(item) }));
    setActiveVariantItemId(itemId);
  };

  const addVariantRow = (itemId: number) => {
    setVariantDraftsByItem((prev) => {
      const current = Array.isArray(prev[itemId]) ? prev[itemId] : [];
      const nextRow: EditableWhccVariant = {
        localId: `new-${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        displayName: '',
        baseCost: normalizeMoneyString(String(viewItems.find((entry) => Number(entry.id) === itemId)?.base_cost ?? '')),
        price: '',
        whccProductUID: '',
        whccProductNodeIDs: '',
        whccItemAttributeUIDs: '',
        isDefault: current.length === 0,
        isActive: current.length === 0,
      };
      return { ...prev, [itemId]: [...current, nextRow] };
    });
  };

  const updateVariantRow = (itemId: number, localId: string, patch: Partial<EditableWhccVariant>) => {
    setVariantDraftsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    }));
  };

  const getVariantMarkupAmount = (row: EditableWhccVariant): string => {
    const base = Number(row.baseCost || 0);
    const price = Number(row.price || 0);
    if (!Number.isFinite(base) || !Number.isFinite(price)) return '';
    return normalizeMoneyString(String(Math.max(0, price - base)));
  };

  const updateVariantMarkupAmount = (itemId: number, localId: string, markupValue: string) => {
    setVariantDraftsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((row) => {
        if (row.localId !== localId) return row;
        const base = Number(row.baseCost || 0);
        const markup = Number(markupValue || 0);
        if (!Number.isFinite(base) || !Number.isFinite(markup)) {
          return { ...row, price: '' };
        }
        return {
          ...row,
          price: normalizeMoneyString(String(base + Math.max(0, markup))),
        };
      }),
    }));
  };

  const makeVariantDefault = (itemId: number, localId: string) => {
    setVariantDraftsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((row) => ({ ...row, isDefault: row.localId === localId })),
    }));
  };

  const removeVariantRow = (itemId: number, localId: string) => {
    setVariantDraftsByItem((prev) => {
      const existing = prev[itemId] || [];
      const filtered = existing.filter((row) => row.localId !== localId);
      if (!filtered.some((row) => row.isDefault) && filtered.length > 0) filtered[0].isDefault = true;
      return { ...prev, [itemId]: filtered };
    });
  };

  const resetVariantRows = (item: any) => {
    const itemId = Number(item?.id || 0);
    if (!Number.isInteger(itemId) || itemId <= 0) return;
    const seededRows = pruneBlankVariants(getItemVariantsFromSource(item, buildItemDrafts([item])[itemId]));
    const hasMeaningfulSeededRows = seededRows.some((row) => hasMeaningfulVariantContent(row));
    const resetRows = (seededRows.length
      ? seededRows.map((variant, index) => toEditableWhccVariant(variant, index))
      : [buildEmptyVariantRow(item)])
      .map((row, index) => ({
        ...row,
        isDefault: hasMeaningfulSeededRows ? row.isDefault : (index === 0 ? true : row.isDefault),
        isActive: hasMeaningfulSeededRows ? (row.isActive || row.isDefault) : ((index === 0 ? true : row.isActive) || row.isDefault),
      }));
    setVariantDraftsByItem((prev) => ({ ...prev, [itemId]: resetRows }));
    setAttributePricingConfigByItem((prev) => ({ ...prev, [itemId]: buildAttributePricingConfig(item) }));
  };

  const updateAttributePricingConfig = (itemId: number, patch: Partial<AttributePricingConfig>) => {
    setAttributePricingConfigByItem((prev) => ({
      ...prev,
      [itemId]: {
        percent: prev[itemId]?.percent ?? '0',
        roundingSuffix: prev[itemId]?.roundingSuffix ?? DEFAULT_ATTRIBUTE_ROUNDING_SUFFIX,
        ...patch,
      },
    }));
  };

  const applyVariantPricingPreset = (itemId: number) => {
    const config = attributePricingConfigByItem[itemId] || { percent: '0', roundingSuffix: DEFAULT_ATTRIBUTE_ROUNDING_SUFFIX };
    const percent = Number(config.percent || 0);
    const roundingSuffix = normalizeRoundingSuffix(config.roundingSuffix);
    setVariantDraftsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((row) => {
        const base = Number(row.baseCost || 0);
        if (!Number.isFinite(base)) return row;
        const rawPrice = base + (base * (Number.isFinite(percent) ? percent : 0) / 100);
        const roundedPrice = roundPriceToSuffix(rawPrice, roundingSuffix);
        return {
          ...row,
          price: normalizeMoneyString(String(roundedPrice)),
        };
      }),
    }));
  };

  const saveVariantRows = async (item: any) => {
    const itemId = Number(item?.id || 0);
    if (!Number.isInteger(itemId) || itemId <= 0) return;

    const rows = variantDraftsByItem[itemId] || [];
    const normalized = rows
      .map(fromEditableWhccVariant)
      .filter(Boolean) as WhccVariant[];

    if (!normalized.length) {
      setViewError('Add at least one valid attribute row with a WHCC Product UID.');
      return;
    }

    if (!normalized.some((variant) => variant.isDefault)) {
      normalized[0].isDefault = true;
    }

    normalized.forEach((variant) => {
      if (variant.isDefault) variant.isActive = true;
    });

    const defaultVariant = normalized.find((variant) => variant.isDefault && variant.isActive)
      || normalized.find((variant) => variant.isActive)
      || normalized[0];
    const attributePricingConfig = attributePricingConfigByItem[itemId] || buildAttributePricingConfig(item);
    const normalizedAttributePricingPercent = Number(attributePricingConfig.percent || 0);
    const normalizedAttributePriceRoundingSuffix = normalizeRoundingSuffix(attributePricingConfig.roundingSuffix);

    const nextDraft: ItemDraft = {
      ...(itemDrafts[itemId] || buildItemDrafts([item])[itemId]),
      base_cost: defaultVariant?.baseCost !== null && defaultVariant?.baseCost !== undefined
        ? String(defaultVariant.baseCost)
        : (itemDrafts[itemId]?.base_cost ?? String(item?.base_cost ?? '')),
      markup_percent: defaultVariant?.baseCost && defaultVariant?.price !== null && defaultVariant?.price !== undefined
        ? String(Number((((defaultVariant.price - defaultVariant.baseCost) / defaultVariant.baseCost) * 100).toFixed(2)))
        : (itemDrafts[itemId]?.markup_percent ?? String(item?.markup_percent ?? '')),
      whccProductUID: String(defaultVariant?.whccProductUID || ''),
      whccProductNodeID: String(defaultVariant?.whccProductNodeIDs?.[0] || ''),
      whccItemAttributeUIDs: Array.isArray(defaultVariant?.whccItemAttributeUIDs)
        ? defaultVariant.whccItemAttributeUIDs.join(', ')
        : '',
      whccVariantsJson: JSON.stringify(normalized, null, 2),
    };

    setSavingVariantItemId(itemId);
    setViewError('');
    try {
      setItemDrafts((prev) => ({ ...prev, [itemId]: nextDraft }));
      await superPriceListService.updateItem(viewList!.id, itemId, {
        base_cost: nextDraft.base_cost !== '' ? Number(nextDraft.base_cost) : null,
        markup_percent: nextDraft.markup_percent !== '' ? Number(nextDraft.markup_percent) : null,
        whccProductUID: defaultVariant?.whccProductUID || null,
        whccProductNodeID: defaultVariant?.whccProductNodeIDs?.[0] || null,
        whccItemAttributeUIDs: Array.isArray(defaultVariant?.whccItemAttributeUIDs) ? defaultVariant.whccItemAttributeUIDs : [],
        whccVariants: normalized,
        attributePricingPercent: Number.isFinite(normalizedAttributePricingPercent) ? normalizedAttributePricingPercent : 0,
        attributePriceRoundingSuffix: normalizedAttributePriceRoundingSuffix,
      });
      await refreshViewItems();
      setActiveVariantItemId(null);
    } catch {
      setViewError('Failed to save product attributes.');
    } finally {
      setSavingVariantItemId(null);
    }
  };

  const toggleProductAttributePill = async (
    productItems: any[],
    pill: { label: string; isActive: boolean; isDefault: boolean; togglable: boolean; attributeUid?: number },
    pillKey: string
  ) => {
    if (!viewList || !pill.togglable) return;

    const normalizedUid = Number(pill.attributeUid || 0);
    if (!Number.isInteger(normalizedUid) || normalizedUid <= 0) return;

    const targetActive = !pill.isActive;
    setSavingProductAttributeKey(pillKey);
    setViewError('');
    
    try {
      let savedAny = false;
      const updatedItems: any[] = [];

      for (const item of productItems) {
        let variants = getItemVariantsFromSource(item);
        
        // If no variants exist but categories do, generate from categories first
        if (!variants.length) {
          const categories = Array.isArray(item?.whccAttributeCategories) ? item.whccAttributeCategories : [];
          if (categories.length) {
            variants = buildDefaultWhccVariantsFromCategories(item);
          }
        }

        if (!variants.length) {
          console.log(`No variants for item ${item.id}, skipping toggle`);
          continue;
        }

        // Check if any variant already has this UID
        let variantHasUid = variants.some((v) => {
          const uids = Array.isArray(v?.whccItemAttributeUIDs)
            ? v.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
            : [];
          return uids.includes(normalizedUid);
        });

        // If no variant has this UID, create a new one for it
        if (!variantHasUid) {
          console.log(`Creating new variant for UID ${normalizedUid} in item ${item.id}`);
          const baseCost = normalizeNullableNumber(item?.base_cost);
          const markupPercent = Number(item?.markup_percent || 0);
          const price = baseCost !== null && Number.isFinite(markupPercent)
            ? Number((baseCost + (baseCost * markupPercent / 100)).toFixed(2))
            : baseCost;

          const newVariant: WhccVariant = {
            displayName: pill.label.split(': ')[1] || pill.label,
            whccProductUID: Number(item?.whccProductUID || 0) || 0,
            whccProductNodeIDs: Number(item?.whccProductNodeID || 0) > 0 ? [Number(item.whccProductNodeID)] : [],
            whccItemAttributeUIDs: [normalizedUid],
            baseCost,
            price,
            isDefault: variants.length === 0,
            isActive: false,  // Start inactive so toggle will create a change
          };

          variants = [...variants, newVariant];
          variantHasUid = true;
        }

        const targetVariantIndexes = new Set<number>();
        variants.forEach((variant, index) => {
          const variantUids = Array.isArray(variant?.whccItemAttributeUIDs)
            ? variant.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
            : [];
          if (variantUids.includes(normalizedUid)) targetVariantIndexes.add(index);
        });

        // Toggle active state for all variants containing this UID
        let nextVariants = variants.map((variant) => {
          const variantUids = Array.isArray(variant?.whccItemAttributeUIDs)
            ? variant.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
            : [];
          const hasThisUid = variantUids.includes(normalizedUid);

          if (!hasThisUid) return variant;

          if (!targetActive) {
            return {
              ...variant,
              isActive: false,
              isDefault: false,
            } as WhccVariant;
          }

          return {
            ...variant,
            isActive: true,
          } as WhccVariant;
        });

        // Ensure there is still a default when possible after turning off a pill.
        if (!nextVariants.some((variant) => Boolean(variant?.isDefault))) {
          const fallbackIndex = nextVariants.findIndex((variant, index) => !targetVariantIndexes.has(index) && Boolean(variant?.isActive));
          if (fallbackIndex >= 0) {
            nextVariants = nextVariants.map((variant, index) => ({
              ...variant,
              isDefault: index === fallbackIndex,
              isActive: index === fallbackIndex ? true : Boolean(variant?.isActive),
            } as WhccVariant));
          }
        }

        const changed = JSON.stringify(nextVariants) !== JSON.stringify(variants);
        if (!changed) {
          continue;
        }

        console.log(`Toggling attribute ${normalizedUid} for item ${item.id}`);

        const defaultVariant = nextVariants.find((variant) => variant.isDefault && variant.isActive)
          || nextVariants.find((variant) => variant.isActive)
          || nextVariants[0]
          || null;

        // Optimistically update local state first for immediate UI feedback
        updatedItems.push({
          ...item,
          whccVariants: nextVariants,
          whccProductUID: defaultVariant?.whccProductUID || item.whccProductUID,
          whccProductNodeID: defaultVariant?.whccProductNodeIDs?.[0] || item.whccProductNodeID,
          whccItemAttributeUIDs: Array.isArray(defaultVariant?.whccItemAttributeUIDs) ? defaultVariant.whccItemAttributeUIDs : item.whccItemAttributeUIDs,
        });

        await superPriceListService.updateItem(viewList.id, Number(item.id), {
          whccVariants: nextVariants,
          whccProductUID: defaultVariant?.whccProductUID || null,
          whccProductNodeID: defaultVariant?.whccProductNodeIDs?.[0] || null,
          whccItemAttributeUIDs: Array.isArray(defaultVariant?.whccItemAttributeUIDs) ? defaultVariant.whccItemAttributeUIDs : [],
        });
        savedAny = true;
      }

      // Optimistically update view items to show changes immediately
      if (updatedItems.length > 0) {
        setViewItems((prev) => prev.map((item) => {
          const updated = updatedItems.find((u) => u.id === item.id);
          return updated || item;
        }));
      }

      // Then refresh to verify with server
      if (savedAny) {
        await refreshViewItems();
      }
    } catch (err) {
      console.error('Toggle pill error:', err);
      setViewError('Failed to update product attribute active state.');
    } finally {
      setSavingProductAttributeKey(null);
    }
  };

  const setProductDefaultAttributePill = async (
    productItems: any[],
    pill: { label: string; isActive: boolean; isDefault: boolean; togglable: boolean; attributeUid?: number },
    pillKey: string
  ) => {
    if (!viewList || !pill.togglable) return;

    const normalizedUid = Number(pill.attributeUid || 0);
    if (!Number.isInteger(normalizedUid) || normalizedUid <= 0) return;

    setSavingProductAttributeKey(pillKey);
    setViewError('');

    try {
      let savedAny = false;
      const updatedItems: any[] = [];

      for (const item of productItems) {
        let variants = getItemVariantsFromSource(item);

        if (!variants.length) {
          const categories = Array.isArray(item?.whccAttributeCategories) ? item.whccAttributeCategories : [];
          if (categories.length) {
            variants = buildDefaultWhccVariantsFromCategories(item);
          }
        }

        if (!variants.length) continue;

        const hasUid = variants.some((variant) => {
          const variantUids = Array.isArray(variant?.whccItemAttributeUIDs)
            ? variant.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
            : [];
          return variantUids.includes(normalizedUid);
        });

        if (!hasUid) {
          const baseCost = normalizeNullableNumber(item?.base_cost);
          const markupPercent = Number(item?.markup_percent || 0);
          const price = baseCost !== null && Number.isFinite(markupPercent)
            ? Number((baseCost + (baseCost * markupPercent / 100)).toFixed(2))
            : baseCost;

          variants = [
            ...variants,
            {
              displayName: pill.label.split(': ')[1] || pill.label,
              whccProductUID: Number(item?.whccProductUID || 0) || 0,
              whccProductNodeIDs: Number(item?.whccProductNodeID || 0) > 0 ? [Number(item.whccProductNodeID)] : [],
              whccItemAttributeUIDs: [normalizedUid],
              baseCost,
              price,
              isDefault: false,
              isActive: false,
            } as WhccVariant,
          ];
        }

        const targetVariantIndexes = new Set<number>();
        variants.forEach((variant, index) => {
          const variantUids = Array.isArray(variant?.whccItemAttributeUIDs)
            ? variant.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
            : [];
          if (variantUids.includes(normalizedUid)) targetVariantIndexes.add(index);
        });

        const shouldClearDefault = Boolean(pill.isDefault);
        let nextVariants = variants.map((variant) => {
          const variantUids = Array.isArray(variant?.whccItemAttributeUIDs)
            ? variant.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
            : [];
          const isTarget = variantUids.includes(normalizedUid);

          if (shouldClearDefault) {
            if (!isTarget) return variant;
            return {
              ...variant,
              isDefault: false,
            } as WhccVariant;
          }

          return {
            ...variant,
            isDefault: isTarget,
            isActive: isTarget ? true : Boolean(variant?.isActive),
          } as WhccVariant;
        });

        if (!nextVariants.some((variant) => Boolean(variant?.isDefault))) {
          const fallbackIndex = nextVariants.findIndex((variant, index) => !targetVariantIndexes.has(index) && Boolean(variant?.isActive));
          if (fallbackIndex >= 0) {
            nextVariants = nextVariants.map((variant, index) => ({
              ...variant,
              isDefault: index === fallbackIndex,
              isActive: index === fallbackIndex ? true : Boolean(variant?.isActive),
            } as WhccVariant));
          }
        }

        const changed = JSON.stringify(nextVariants) !== JSON.stringify(variants);
        if (!changed) continue;

        const defaultVariant = nextVariants.find((variant) => variant.isDefault && variant.isActive)
          || nextVariants.find((variant) => variant.isActive)
          || nextVariants[0]
          || null;

        updatedItems.push({
          ...item,
          whccVariants: nextVariants,
          whccProductUID: defaultVariant?.whccProductUID || item.whccProductUID,
          whccProductNodeID: defaultVariant?.whccProductNodeIDs?.[0] || item.whccProductNodeID,
          whccItemAttributeUIDs: Array.isArray(defaultVariant?.whccItemAttributeUIDs) ? defaultVariant.whccItemAttributeUIDs : item.whccItemAttributeUIDs,
        });

        await superPriceListService.updateItem(viewList.id, Number(item.id), {
          whccVariants: nextVariants,
          whccProductUID: defaultVariant?.whccProductUID || null,
          whccProductNodeID: defaultVariant?.whccProductNodeIDs?.[0] || null,
          whccItemAttributeUIDs: Array.isArray(defaultVariant?.whccItemAttributeUIDs) ? defaultVariant.whccItemAttributeUIDs : [],
        });
        savedAny = true;
      }

      if (updatedItems.length > 0) {
        setViewItems((prev) => prev.map((item) => {
          const updated = updatedItems.find((entry) => entry.id === item.id);
          return updated || item;
        }));
      }

      if (savedAny) {
        await refreshViewItems();
      }
    } catch (err) {
      console.error('Set product default attribute error:', err);
      setViewError('Failed to update default product attribute.');
    } finally {
      setSavingProductAttributeKey(null);
    }
  };

  const buildProductAttributePills = useCallback((productItems: any[]) => {
    const byLabel = new Map<string, {
      key: string;
      label: string;
      isActive: boolean;
      isDefault: boolean;
      togglable: boolean;
      attributeUid?: number;
    }>();

    for (const item of productItems) {
      let variants = getItemVariantsFromSource(item);
      
      // If no variants exist but categories exist, generate them so pills can activate attributes
      if (!variants.length) {
        const categories = Array.isArray(item?.whccAttributeCategories) ? item.whccAttributeCategories : [];
        if (categories.length) {
          variants = buildDefaultWhccVariantsFromCategories(item);
        }
      }

      const categories = Array.isArray(item?.whccAttributeCategories) ? item.whccAttributeCategories : [];
      const uidToLabel = new Map<number, string>();

      for (const category of categories) {
        const categoryName = String(category?.name || category?.AttributeCategoryName || 'Attributes').trim() || 'Attributes';
        const attrs = Array.isArray(category?.attributes)
          ? category.attributes
          : Array.isArray(category?.Attributes)
          ? category.Attributes
          : [];
        for (const attribute of attrs) {
          const uid = Number(attribute?.uid ?? attribute?.Id ?? attribute?.AttributeUID ?? attribute?.attributeUID ?? attribute?.id ?? 0);
          if (!Number.isInteger(uid) || uid <= 0) continue;
          const name = String(attribute?.name ?? attribute?.AttributeName ?? attribute?.DisplayName ?? '').trim() || `Attribute ${uid}`;
          const label = `${categoryName}: ${name}`;
          uidToLabel.set(uid, label);
          if (!byLabel.has(label)) {
            byLabel.set(label, {
              key: `uid-${uid}`,
              label,
              isActive: false,
              isDefault: false,
              togglable: true,
              attributeUid: uid,
            });
          }
        }
      }

      for (const variant of variants) {
        const attrs = Array.isArray(variant?.whccItemAttributeUIDs)
          ? variant.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
          : [];

        for (const uid of attrs) {
          const label = uidToLabel.get(uid);
          if (!label) continue;
          const existing = byLabel.get(label);
          if (!existing) continue;
          byLabel.set(label, {
            ...existing,
            isActive: existing.isActive || Boolean(variant?.isActive),
            isDefault: existing.isDefault || Boolean(variant?.isDefault),
          });
        }
      }
    }

    return Array.from(byLabel.values());
  }, [getItemVariantsFromSource, buildDefaultWhccVariantsFromCategories]);

  const rankWhccSuggestions = useCallback((item: any, queryOverride?: string): WhccMatchCandidate[] => {
    const size = String(item.size_name || item._sizeLabel || '').toLowerCase();
    const productName = String(item.product_name || '').toLowerCase();
    const query = (queryOverride || `${item.product_name || ''} ${item.size_name || ''}`).toLowerCase().trim();
    const terms = query.split(/\s+/).filter(Boolean);

    return whccCatalog
      .map(entry => {
        let score = 0;
        if (!terms.length) score += 1;
        for (const term of terms) {
          if (entry.searchText.includes(term)) score += 10;
        }
        if (size && entry.searchText.includes(size)) score += 25;
        if (productName && entry.searchText.includes(productName)) score += 15;
        if (entry.name.toLowerCase() === `${productName} ${size}`.trim()) score += 50;
        return { entry, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  }, [whccCatalog]);

  const getBestWhccSuggestion = useCallback((item: any): WhccMatchCandidate | null => {
    const ranked = rankWhccSuggestions(item).filter(result => result.score >= 20);
    return ranked[0] || null;
  }, [rankWhccSuggestions]);

  const buildWhccReport = useCallback((): WhccAutoMatchReportRow[] =>
    viewItems.map(item => {
      const bestMatch = getBestWhccSuggestion(item);
      const currentlyMapped = !itemNeedsWhccMapping(item);
      return {
        itemId: item.id,
        productName: String(item.product_name || 'Unknown Product'),
        sizeName: String(item._sizeLabel || item.size_name || '—'),
        status: currentlyMapped ? 'mapped' : bestMatch ? 'ready' : 'review',
        score: bestMatch?.score || 0,
        suggestion: bestMatch?.entry || null,
      };
    }),
  [getBestWhccSuggestion, itemNeedsWhccMapping, viewItems]);

  const handlePreviewWhccMatches = async () => {
    setViewError('');

    try {
      await ensureWhccCatalogLoaded();
      const report = buildWhccReport();
      setWhccReportRows(report);
      setWhccReportVisible(true);
      const readyCount = report.filter(row => row.status === 'ready').length;
      const reviewCount = report.filter(row => row.status === 'review').length;
      if (!report.length) setViewError('No items available for WHCC preview.');
      else setViewError(`Preview ready: ${readyCount} can be auto-matched, ${reviewCount} need manual review.`);
    } catch {
      setViewError('Failed to preview WHCC matches.');
    }
  };

  const buildDraftWithWhccEntry = useCallback((item: any, entry: WhccCatalogEntry): ItemDraft => ({
    ...(itemDrafts[item.id] || buildItemDrafts([item])[item.id]),
    whccProductUID: String(entry.productUID || ''),
    whccProductNodeID: String(entry.productNodeID || ''),
    whccItemAttributeUIDs: entry.itemAttributeUIDs.join(', '),
  }), [itemDrafts]);

  const handleAutoMatchWhcc = async () => {
    if (!viewList || autoMatchingWhcc) return;
    setAutoMatchingWhcc(true);
    setViewError('');

    try {
      await ensureWhccCatalogLoaded();

      const pendingItems = viewItems.filter(itemNeedsWhccMapping);
      const report = buildWhccReport();
      setWhccReportRows(report);
      setWhccReportVisible(true);
      let matchedCount = 0;

      for (const item of pendingItems) {
        const match = getBestWhccSuggestion(item);
        if (!match?.entry) continue;

        const nextDraft = buildDraftWithWhccEntry(item, match.entry);
        setItemDrafts(prev => ({ ...prev, [item.id]: nextDraft }));
        await autoSaveItem(item.id, nextDraft);
        matchedCount += 1;
      }

      if (!pendingItems.length) {
        setViewError('All visible items already have WHCC mappings.');
      } else if (!matchedCount) {
        setViewError('No strong WHCC matches were found for the unmapped items.');
      } else {
        setViewError(`Auto-matched ${matchedCount} of ${pendingItems.length} unmapped items.`);
      }
      setWhccReportRows(buildWhccReport());
    } catch {
      setViewError('Failed to auto-match WHCC mappings.');
    } finally {
      setAutoMatchingWhcc(false);
    }
  };

  const handleSyncWhccCosts = async () => {
    if (!viewList) return;
    setSyncingWhccCosts(true);
    setViewError('');
    try {
      const result: any = await superPriceListService.syncWhccCosts(viewList.id, false);
      const updated = Number(result?.updatedCount || 0);
      const unchanged = Number(result?.unchangedCount || 0);
      const unmatched = Number(result?.unmatchedCount || 0);
      const skippedNonZero = Number(result?.skippedNonZeroCount || 0);
      const items = await superPriceListService.getItems(viewList.id);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      setItemDrafts(buildItemDrafts(arr));
      setViewError(`WHCC cost sync complete: ${updated} updated, ${unchanged} unchanged, ${unmatched} unmatched${skippedNonZero ? `, ${skippedNonZero} non-zero skipped` : ''}.`);
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.response?.data?.details || err?.message || 'Failed to sync WHCC costs.');
    } finally {
      setSyncingWhccCosts(false);
    }
  };

  const handleFillMissingWhccNodeIds = async () => {
    if (!viewList) return;
    setFillingWhccNodes(true);
    setViewError('');
    try {
      const result: any = await superPriceListService.fillMissingWhccNodeIds(viewList.id);
      const updated = Number(result?.updatedCount || 0);
      const alreadySet = Number(result?.alreadySetCount || 0);
      const missingUid = Number(result?.missingUidCount || 0);
      const noCatalogNode = Number(result?.noCatalogNodeCount || 0);

      const items = await superPriceListService.getItems(viewList.id);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      setItemDrafts(buildItemDrafts(arr));

      setViewError(`WHCC node fill complete: ${updated} updated, ${alreadySet} already set, ${missingUid} missing UID, ${noCatalogNode} no catalog node.`);
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.response?.data?.details || err?.message || 'Failed to fill missing WHCC node IDs.');
    } finally {
      setFillingWhccNodes(false);
    }
  };

  const handleBootstrapWhccVariants = async () => {
    if (!viewList) return;
    setBootstrappingWhccVariants(true);
    setViewError('');
    try {
      const result: any = await superPriceListService.bootstrapWhccVariants(viewList.id);
      const createdVariantRows = Number(result?.createdVariantRows || 0);
      const hydratedQueuedOrderItems = Number(result?.hydratedQueuedOrderItems || 0);
      await refreshViewItems();
      setViewError(`WHCC variant bootstrap complete: ${createdVariantRows} variant rows created, ${hydratedQueuedOrderItems} queued order items updated.`);
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.response?.data?.details || err?.message || 'Failed to bootstrap WHCC variants.');
    } finally {
      setBootstrappingWhccVariants(false);
    }
  };

  // ── Active toggles ─────────────────────────────────────────────────────────
  const toggleItemActive = async (item: any, active: boolean) => {
    setTogglingActive(true);
    try {
      await superPriceListService.updateItem(viewList!.id, item.id, { is_active: active });
      setViewItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: active } : i));
    } catch { setViewError('Failed to update active status.'); }
    finally { setTogglingActive(false); }
  };

  const toggleGroupActive = async (ids: number[], active: boolean) => {
    if (!ids.length) return;
    setTogglingActive(true);
    try {
      await superPriceListService.bulkSetActive(viewList!.id, ids, active);
      setViewItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, is_active: active } : i));
    } catch { setViewError('Failed to update active status.'); }
    finally { setTogglingActive(false); }
  };

  // ── Global markup ──────────────────────────────────────────────────────────
  const handleApplyGlobalMarkup = async () => {
    if (globalMarkup === '' || !viewList) return;
    setApplyingMarkup(true);
    try {
      await superPriceListService.bulkSetMarkup(viewList.id, Number(globalMarkup));
      const val = Number(globalMarkup);
      setViewItems(prev => prev.map(i => i.is_active ? { ...i, markup_percent: val } : i));
      setItemDrafts(prev => {
        const n = { ...prev };
        viewItems.forEach(i => { if (i.is_active) n[i.id] = { ...n[i.id], markup_percent: globalMarkup }; });
        return n;
      });
    } catch { setViewError('Failed to apply markup.'); }
    finally { setApplyingMarkup(false); }
  };

  // ── Category image upload ──────────────────────────────────────────────────
  const handleCategoryImageUpload = async (cat: string, file: File) => {
    setUploadingCategory(cat);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('category_name', cat);
      const url = await superPriceListService.uploadCategoryImage(viewList!.id, formData);
      setCategoryImages(prev => ({ ...prev, [cat]: url }));
    } catch { setViewError('Failed to upload category image.'); }
    finally { setUploadingCategory(null); }
  };

  const refreshViewItems = async () => {
    if (!viewList) return;
    const [items, images] = await Promise.all([
      superPriceListService.getItems(viewList.id),
      superPriceListService.getCategoryImages(viewList.id).catch(() => []),
    ]);
    const arr: any[] = Array.isArray(items) ? items : [];
    setViewItems(arr);
    setItemDrafts(buildItemDrafts(arr));
    const imgMap: Record<string, string> = {};
    if (Array.isArray(images)) images.forEach((img: any) => { imgMap[img.category_name] = img.image_url || ''; });
    setCategoryImages(imgMap);
    setActiveVariantItemId(null);
    setVariantDraftsByItem({});
    setSelectedVariantPreviewByItem({});
    setAttributePricingConfigByItem({});
    setExpandedSizeRows({});
  };

  const handleCreateCategory = async () => {
    if (!viewList) return;
    const category = window.prompt('Create new category:')?.trim();
    if (!category) return;
    try {
      await superPriceListService.createCategory(viewList.id, category);
      setCategoryImages((prev) => ({ ...prev, [category]: prev[category] || '' }));
      setCatCollapsed((prev) => ({ ...prev, [category]: false }));
      await refreshViewItems();
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.message || 'Failed to create category.');
    }
  };

  const handleRenameCategory = async (cat: string) => {
    if (!viewList) return;
    const toCategory = window.prompt('Rename category to:', cat)?.trim();
    if (!toCategory || toCategory === cat) return;
    try {
      await superPriceListService.renameCategory(viewList.id, cat, toCategory);
      await refreshViewItems();
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.message || 'Failed to rename category.');
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    if (!viewList) return;
    if (!window.confirm(`Delete category "${cat}" and all its items from this super price list?`)) return;
    try {
      await superPriceListService.deleteCategory(viewList.id, cat);
      await refreshViewItems();
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.message || 'Failed to delete category.');
    }
  };

  const handleMoveProductCategory = async (item: any) => {
    if (!viewList) return;
    const targetCategory = window.prompt('Move product to category:', String(item?.product_category || ''))?.trim();
    if (!targetCategory) return;
    try {
      await superPriceListService.moveProductToCategory(viewList.id, Number(item.product_id), targetCategory);
      await refreshViewItems();
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.message || 'Failed to move product category.');
    }
  };

  const handleMoveSizeCategory = async (item: any) => {
    if (!viewList) return;
    const targetCategory = window.prompt('Move this size to category:', String(item?.product_category || ''))?.trim();
    if (!targetCategory) return;
    const targetProductName = window.prompt('Target product name (leave as-is to keep current):', String(item?.product_name || ''))?.trim();
    try {
      await superPriceListService.moveItemToCategory(viewList.id, Number(item.id), targetCategory, targetProductName || undefined);
      await refreshViewItems();
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.message || 'Failed to move size category.');
    }
  };

  const PRICE_MOVE_DRAG_MIME = 'application/x-photolab-price-move';

  const parseDragPayload = (event: React.DragEvent): any | null => {
    const raw = event.dataTransfer.getData(PRICE_MOVE_DRAG_MIME) || event.dataTransfer.getData('text/plain');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const beginProductDrag = (event: React.DragEvent, item: any) => {
    const payload = {
      kind: 'product',
      productId: Number(item?.product_id || 0),
      productName: String(baseProductName(item?.product_name || 'Unknown Product')),
      sourceCategory: String(item?.product_category || ''),
    };
    const encoded = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(PRICE_MOVE_DRAG_MIME, encoded);
    event.dataTransfer.setData('text/plain', encoded);
  };

  const beginSizeDrag = (event: React.DragEvent, item: any) => {
    const payload = {
      kind: 'size',
      itemId: Number(item?.id || 0),
      productName: String(baseProductName(item?.product_name || 'Unknown Product')),
      sourceCategory: String(item?.product_category || ''),
    };
    const encoded = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(PRICE_MOVE_DRAG_MIME, encoded);
    event.dataTransfer.setData('text/plain', encoded);
  };

  const handleDropOnCategory = async (event: React.DragEvent, targetCategory: string) => {
    event.preventDefault();
    if (!viewList) return;
    const payload = parseDragPayload(event);
    if (!payload) return;

    try {
      if (payload.kind === 'product' && Number(payload.productId) > 0) {
        if (String(payload.sourceCategory || '') === targetCategory) return;
        await superPriceListService.moveProductToCategory(viewList.id, Number(payload.productId), targetCategory);
      } else if (payload.kind === 'size' && Number(payload.itemId) > 0) {
        if (String(payload.sourceCategory || '') === targetCategory) return;
        await superPriceListService.moveItemToCategory(
          viewList.id,
          Number(payload.itemId),
          targetCategory,
          String(payload.productName || '').trim() || undefined
        );
      } else {
        return;
      }
      await refreshViewItems();
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.message || 'Failed to move item with drag and drop.');
    }
  };

  const handleDropOnProduct = async (event: React.DragEvent, targetCategory: string, targetProductName: string) => {
    event.preventDefault();
    if (!viewList) return;
    const payload = parseDragPayload(event);
    if (!payload) return;

    try {
      if (payload.kind === 'size' && Number(payload.itemId) > 0) {
        await superPriceListService.moveItemToCategory(
          viewList.id,
          Number(payload.itemId),
          targetCategory,
          targetProductName || undefined
        );
      } else if (payload.kind === 'product' && Number(payload.productId) > 0) {
        if (String(payload.sourceCategory || '') === targetCategory) return;
        await superPriceListService.moveProductToCategory(viewList.id, Number(payload.productId), targetCategory);
      } else {
        return;
      }
      await refreshViewItems();
    } catch (err: any) {
      setViewError(err?.response?.data?.error || err?.message || 'Failed to drop item on product.');
    }
  };

  // ── Create list ────────────────────────────────────────────────────────────
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreating(true);
    try {
      await superPriceListService.createList(newListName, newListDescription);
      setShowCreateForm(false);
      setNewListName('');
      setNewListDescription('');
      await loadPriceLists();
    } catch { setError('Failed to create price list'); }
    finally { setCreating(false); }
  };

  // ── Search filter helpers ──────────────────────────────────────────────────
  const q = viewSearch.toLowerCase().trim();
  const catVisible = (cat: string) => {
    const allItems = Object.values(viewGrouped[cat] || {}).flat() as any[];
    const visibleItems = showZeroCostOnly ? allItems.filter(isZeroCostItem) : allItems;
    if (!visibleItems.length) {
      return !q || cat.toLowerCase().includes(q);
    }

    if (!q) return true;
    if (cat.toLowerCase().includes(q)) return true;

    return Object.keys(viewGrouped[cat] || {}).some(prod => {
      const prodItems = (viewGrouped[cat][prod] || []).filter((i: any) => !showZeroCostOnly || isZeroCostItem(i));
      return prodItems.length > 0 && (
        prod.toLowerCase().includes(q) ||
        prodItems.some((i: any) => (i.size_name || '').toLowerCase().includes(q))
      );
    });
  };

  const prodVisible = (cat: string, prod: string) => {
    const prodItems = (viewGrouped[cat]?.[prod] || []).filter((i: any) => !showZeroCostOnly || isZeroCostItem(i));
    if (!prodItems.length) return false;
    if (!q) return true;
    return prod.toLowerCase().includes(q) || prodItems.some((i: any) => (i.size_name || '').toLowerCase().includes(q));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="admin-page">
        <div className="page-header">
          <h1>💸 Super Admin Pricing</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Manage and review all lab price lists, product pricing, and global pricing analytics.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setImportType('whcc')}>Import from WHCC</button>
            <button className="btn btn-secondary" onClick={() => setImportType('csv')}>Import from CSV</button>
            <button className="btn btn-secondary" onClick={() => setImportType('mpix')}>Import from Mpix</button>
          </div>
        </div>

        {/* ── Import Modals ── */}
        <Modal isOpen={!!importType} onClose={() => setImportType(null)} hideDefaultClose
          contentClassName={importType === 'whcc' ? 'admin-whcc-modal-container' : ''}>
          {importType === 'whcc' && (
            <AdminWhccImport onClose={() => setImportType(null)} onImportComplete={() => { setImportType(null); loadPriceLists(); }} />
          )}
          {importType === 'mpix' && (
            <AdminMpixImport onClose={() => setImportType(null)} onImportComplete={() => { setImportType(null); loadPriceLists(); }} />
          )}
          {importType === 'csv' && (
            <div style={{ padding: 32, color: '#fff', textAlign: 'center' }}>
              <h3>CSV Import Coming Soon</h3>
              <button className="btn btn-secondary" onClick={() => setImportType(null)}>Close</button>
            </div>
          )}
        </Modal>

        {/* ── Price lists table ── */}
        {loading ? (
          <div className="loading">Loading price lists...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <div className="dashboard-widget">
            <h2><span>🏷️</span> Lab Price Lists</h2>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              {showCreateForm ? (
                <form onSubmit={handleCreateList} style={{ maxWidth: 400, margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input type="text" placeholder="Price List Name" value={newListName} onChange={e => setNewListName(e.target.value)} required style={{ padding: 8, fontSize: 16 }} />
                  <textarea placeholder="Description (optional)" value={newListDescription} onChange={e => setNewListDescription(e.target.value)} style={{ padding: 8, fontSize: 16 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Price List'}</button>
                    <button className="btn btn-secondary" type="button" onClick={() => setShowCreateForm(false)} disabled={creating}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>+ Create New Price List</button>
              )}
            </div>
            {priceLists.length === 0 && !showCreateForm && (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                No price lists found. Create a new price list to get started.
              </p>
            )}
            {priceLists.length > 0 && (
              <table className="data-table">
                <thead><tr><th>Price List</th><th>Products</th><th>Studios</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {priceLists.map(list => (
                    <tr key={list.id}>
                      <td>{list.name}</td>
                      <td>{list.productCount}</td>
                      <td>{Number(list.linkedStudioCount ?? 0)}</td>
                      <td>{list.isActive
                        ? <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
                        : <span style={{ color: 'var(--error-color)', fontWeight: 600 }}>Inactive</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openViewEdit(list)}>View/Edit</button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ background: '#7f1d1d', borderColor: '#991b1b', color: '#fff' }}
                            onClick={() => handleDeleteList(list)}
                            disabled={deletingListId === list.id}
                            title={Number(list.linkedStudioCount || 0) > 0 ? `${list.linkedStudioCount} studio price lists will also be deleted` : 'Delete this price list'}
                          >
                            {deletingListId === list.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── View/Edit Price List Modal ── */}
      <Modal isOpen={!!viewList} onClose={closeViewEdit} hideDefaultClose contentClassName="admin-price-list-edit-modal">
        <div style={{ display: 'flex', flexDirection: 'column', height: '85vh' }}>
          {/* Header */}
          <div className="spl-modal-header">
            <h3>{viewList?.name}</h3>
            <button className="btn btn-secondary btn-sm" onClick={closeViewEdit}>✕ Close</button>
          </div>

          {viewError && <div className="info-box-error" style={{ marginBottom: 10 }}>✗ {viewError}</div>}

          {viewLoading ? (
            <div style={{ textAlign: 'center', padding: 48 }}>Loading items...</div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="spl-toolbar">
                <input className="spl-search" type="text" placeholder="Search category, product, or size…"
                  value={viewSearch} onChange={e => setViewSearch(e.target.value)} />
                <label className="spl-toggle-label" style={{ marginRight: 8 }}>
                  <input type="checkbox" checked={showZeroCostOnly} onChange={e => setShowZeroCostOnly(e.target.checked)} />
                  Show 0 cost only
                </label>
                <div className="spl-markup-group">
                  <label>Markup % for all active:</label>
                  <input className="spl-markup-input" type="number" min={0} step={1} value={globalMarkup}
                    onChange={e => setGlobalMarkup(e.target.value)} placeholder="e.g. 40" />
                  <button className="btn btn-primary btn-sm" disabled={globalMarkup === '' || applyingMarkup}
                    onClick={handleApplyGlobalMarkup}>
                    {applyingMarkup ? 'Applying…' : 'Apply to Active'}
                  </button>
                </div>
                <div className="spl-markup-group">
                  <label>WHCC mappings:</label>
                  <button className="btn btn-secondary btn-sm" disabled={whccCatalogLoading || viewItems.length === 0}
                    onClick={handlePreviewWhccMatches}>
                    Preview Report
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={autoMatchingWhcc || viewItems.length === 0}
                    onClick={handleAutoMatchWhcc}>
                    {autoMatchingWhcc ? 'Matching…' : 'Auto-Match Missing'}
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={syncingWhccCosts || viewItems.length === 0}
                    onClick={handleSyncWhccCosts}>
                    {syncingWhccCosts ? 'Syncing…' : 'Sync All Costs from CSV'}
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={fillingWhccNodes || viewItems.length === 0}
                    onClick={handleFillMissingWhccNodeIds}>
                    {fillingWhccNodes ? 'Filling…' : 'Fill Missing Node IDs'}
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={bootstrappingWhccVariants || viewItems.length === 0}
                    onClick={handleBootstrapWhccVariants}>
                    {bootstrappingWhccVariants ? 'Bootstrapping…' : 'Bootstrap Variants + Queued Orders'}
                  </button>
                </div>
                <span className="spl-item-count">{viewItems.length} sizes total</span>
              </div>

              {whccReportVisible && (
                <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div>
                      <strong>WHCC Auto-Match Report</strong>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {whccReportRows.filter(row => row.status === 'ready').length} ready · {whccReportRows.filter(row => row.status === 'review').length} need review · {whccReportRows.filter(row => row.status === 'mapped').length} already mapped
                      </div>
                    </div>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => setWhccReportVisible(false)}>Hide Report</button>
                  </div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {whccReportRows.map(row => (
                      <div key={row.itemId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderRadius: 8, background: row.status === 'review' ? 'rgba(239, 68, 68, 0.12)' : row.status === 'ready' ? 'rgba(16, 185, 129, 0.10)' : 'rgba(255,255,255,0.03)' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{row.productName} · {row.sizeName}</div>
                          {row.suggestion ? (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              Suggested: {row.suggestion.name} · UID {row.suggestion.productUID}{row.suggestion.productNodeID ? ` · Node ${row.suggestion.productNodeID}` : ''}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No strong catalog suggestion found.</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 120 }}>
                          <div style={{ fontWeight: 600, color: row.status === 'review' ? '#fca5a5' : row.status === 'ready' ? '#6ee7b7' : 'var(--text-secondary)' }}>
                            {row.status === 'ready' ? 'Auto-match ready' : row.status === 'review' ? 'Manual review' : 'Already mapped'}
                          </div>
                          {row.score > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Score {row.score}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="spl-toolbar" style={{ marginTop: -6 }}>
                <input
                  className="spl-search"
                  style={{ maxWidth: 220 }}
                  type="text"
                  placeholder="Product name"
                  value={manualProductName}
                  onChange={e => setManualProductName(e.target.value)}
                />
                <input
                  className="spl-search"
                  style={{ maxWidth: 150 }}
                  type="text"
                  placeholder="Size (e.g. 5x7)"
                  value={manualSizeName}
                  onChange={e => setManualSizeName(e.target.value)}
                />
                <input
                  className="spl-search"
                  style={{ maxWidth: 150 }}
                  type="text"
                  placeholder="Category"
                  value={manualCategory}
                  onChange={e => setManualCategory(e.target.value)}
                />
                <select
                  className="spl-search"
                  style={{ maxWidth: 190 }}
                  value={manualDigitalScope}
                  onChange={e => setManualDigitalScope((e.target.value as 'photo' | 'album') || 'photo')}
                >
                  <option value="photo">Scope: Single photo</option>
                  <option value="album">Scope: Full album ZIP</option>
                </select>
                <select
                  className="spl-search"
                  style={{ maxWidth: 200 }}
                  value={manualDigitalPricingMode}
                  onChange={e => setManualDigitalPricingMode((e.target.value as 'fixed' | 'percentage') || 'fixed')}
                >
                  <option value="fixed">Pricing: Fixed/base</option>
                  <option value="percentage">Pricing: Percentage</option>
                </select>
                {manualDigitalPricingMode === 'percentage' && (
                  <input
                    className="spl-markup-input"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="Super %"
                    value={manualSuperAdminPercentage}
                    onChange={e => setManualSuperAdminPercentage(e.target.value)}
                  />
                )}
                <input
                  className="spl-markup-input"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Cost"
                  value={manualBaseCost}
                  onChange={e => setManualBaseCost(e.target.value)}
                />
                <input
                  className="spl-markup-input"
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Markup %"
                  value={manualMarkup}
                  onChange={e => setManualMarkup(e.target.value)}
                />
                <button className="btn btn-success btn-sm" disabled={addingManual} onClick={handleManualAdd}>
                  {addingManual ? 'Adding…' : '+ Add Manually'}
                </button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={handleCreateCategory}>
                  + Category
                </button>
              </div>

              {/* Tree body */}
              <div className="spl-body">
                {viewItems.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No items in this price list.</p>
                )}
                <div className="spl-compact-body">



                  {allCategoryNames.filter(catVisible).map((cat) => {
                    const categoryProducts = Object.keys(viewGrouped[cat] || {}).filter((prod) => prodVisible(cat, prod));
                    const catIds = itemIdsForCat(cat);
                    const catAllActive = allActiveInGroup(catIds);
                    const catSomeActive = !catAllActive && someActiveInGroup(catIds);
                    return (
                      <div key={`compact-${cat}`} className="spl-category-block">
                        <div
                          className="spl-category-header"
                          onClick={() => setCatCollapsed((p) => ({ ...p, [cat]: !p[cat] }))}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.stopPropagation(); void handleDropOnCategory(e, cat); }}
                        >
                          <button className="spl-collapse-btn">{catCollapsed[cat] ? '▶' : '▼'}</button>
                          <strong>{cat}</strong>
                          <button
                            className="btn btn-secondary btn-sm spl-inline-action-btn"
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void handleRenameCategory(cat); }}
                          >Rename</button>
                          <label className="spl-toggle-label" onClick={(e) => e.stopPropagation()}>
                            <IndeterminateCheckbox
                              checked={catAllActive}
                              indeterminate={catSomeActive}
                              onChange={(checked) => toggleGroupActive(catIds, checked)}
                              disabled={togglingActive}
                            />
                            Active
                          </label>
                          <span className="spl-item-count">{catIds.length} sizes</span>
                        </div>

                        {!catCollapsed[cat] && (
                          <div className="spl-category-body">
                            {categoryProducts.map((prod) => {
                              const prodKey = `${cat}||${prod}`;
                              const visibleProdItems = viewGrouped[cat][prod].filter((item) => !showZeroCostOnly || isZeroCostItem(item));
                              const prodIds = visibleProdItems.map((i) => Number(i.id));
                              const prodAllActive = allActiveInGroup(prodIds);
                              const prodSomeActive = !prodAllActive && someActiveInGroup(prodIds);
                              const productAttributePills = buildProductAttributePills(visibleProdItems);
                              const productHasNamedSizes = visibleProdItems.some((item) => {
                                const label = String(item?._sizeLabel || item?.size_name || '').trim();
                                return label.length > 0 && label !== '—';
                              });
                              const productWhccUids = Array.from(new Set(
                                visibleProdItems.flatMap((item) =>
                                  getItemVariantsFromSource(item)
                                    .map((variant) => Number(variant?.whccProductUID || 0))
                                    .filter((uid) => Number.isInteger(uid) && uid > 0)
                                    .concat(Number(item?.whccProductUID || 0) > 0 ? [Number(item.whccProductUID)] : [])
                                )
                              ));
                              const areAllProductSizesExpanded = visibleProdItems.length > 0
                                && visibleProdItems.every((item) => !!expandedSizeRows[Number(item.id)]);

                              return (
                                <div key={`compact-${cat}-${prod}`} className="spl-product-block">
                                  <div
                                    className="spl-product-header"
                                    draggable={visibleProdItems.length > 0}
                                    onDragStart={(e) => {
                                      const first = visibleProdItems[0];
                                      if (first) beginProductDrag(e, first);
                                    }}
                                    onClick={() => setProdCollapsed((p) => ({ ...p, [prodKey]: !p[prodKey] }))}
                                  >
                                    <button className="spl-collapse-btn">{prodCollapsed[prodKey] ? '▶' : '▼'}</button>
                                    <span>{prod}</span>
                                    {!productHasNamedSizes && productWhccUids.length > 0 && (
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                        WHCC: {productWhccUids.join(', ')}
                                      </span>
                                    )}
                                    {/* --- Product-level WHCC Attributes Button --- */}
                                    {productWhccUids.length > 0 && productWhccUids[0] > 0 && (
                                      productWhccAttrs[prodKey]?.shown ? (
                                        <button
                                          className="btn btn-secondary btn-sm spl-inline-action-btn"
                                          style={{ marginLeft: 8 }}
                                          onClick={e => { e.stopPropagation(); handleHideWhccAttrs(prodKey); }}
                                        >Hide WHCC Attributes</button>
                                      ) : (
                                        <button
                                          className="btn btn-secondary btn-sm spl-inline-action-btn"
                                          style={{ marginLeft: 8 }}
                                          onClick={e => { e.stopPropagation(); handleShowWhccAttrs(prodKey, productWhccUids[0]); }}
                                        >Show WHCC Attributes</button>
                                      )
                                    )}
                                    {/* --- Set for All Sizes Button --- */}
                                    {visibleProdItems.length > 1 && (
                                      <button
                                        className="btn btn-primary btn-sm spl-inline-action-btn"
                                        style={{ marginLeft: 8 }}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          // Use the first size as the reference
                                          const referenceItem = visibleProdItems[0];
                                          if (!referenceItem) return;
                                          const referenceVariants = getItemVariantsFromSource(referenceItem);
                                          // For each other size, update its variants to match the reference
                                          for (let i = 1; i < visibleProdItems.length; ++i) {
                                            const item = visibleProdItems[i];
                                            try {
                                              await superPriceListService.updateItem(viewList.id, item.id, {
                                                whccVariants: referenceVariants,
                                              });
                                            } catch (err) {
                                              // Optionally show error to user
                                              setViewError('Failed to update one or more sizes.');
                                            }
                                          }
                                          // Optionally reload items after update
                                          await refreshViewItems();
                                        }}
                                      >Set for All Sizes</button>
                                    )}
                                    {/* --- End Product-level WHCC Attributes Button --- */}
                                    <button
                                      className="btn btn-secondary btn-sm spl-inline-action-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const first = visibleProdItems[0];
                                        if (first) void handleMoveProductCategory(first);
                                      }}
                                    >Move</button>
                                    <button
                                      className="btn btn-secondary btn-sm spl-inline-action-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (areAllProductSizesExpanded) {
                                          setExpandedSizeRows((prev) => {
                                            const next = { ...prev };
                                            visibleProdItems.forEach((item) => {
                                              delete next[Number(item.id)];
                                            });
                                            return next;
                                          });
                                          if (activeVariantItemId !== null && visibleProdItems.some((item) => Number(item.id) === activeVariantItemId)) {
                                            setActiveVariantItemId(null);
                                          }
                                          return;
                                        }

                                        const nextExpanded: Record<number, boolean> = {};
                                        const nextDrafts: Record<number, EditableWhccVariant[]> = {};
                                        const nextPricingConfigs: Record<number, AttributePricingConfig> = {};

                                        visibleProdItems.forEach((item) => {
                                          const itemId = Number(item.id);
                                          nextExpanded[itemId] = true;

                                          if (shouldAutoOpenVariantEditor(item)) {
                                            const seededRows = pruneBlankVariants(getItemVariantsFromSource(item));
                                            const hasMeaningfulSeededRows = seededRows.some((row) => hasMeaningfulVariantContent(row));
                                            const rows = (seededRows.length
                                              ? seededRows.map((variant, index) => toEditableWhccVariant(variant, index))
                                              : [buildEmptyVariantRow(item)])
                                              .map((row, index) => ({
                                                ...row,
                                                isDefault: hasMeaningfulSeededRows ? row.isDefault : (index === 0 ? true : row.isDefault),
                                                isActive: hasMeaningfulSeededRows ? (row.isActive || row.isDefault) : ((index === 0 ? true : row.isActive) || row.isDefault),
                                              }));

                                            nextDrafts[itemId] = rows;
                                            nextPricingConfigs[itemId] = buildAttributePricingConfig(item);
                                          }
                                        });

                                        setExpandedSizeRows((prev) => ({ ...prev, ...nextExpanded }));
                                        if (Object.keys(nextDrafts).length > 0) {
                                          setVariantDraftsByItem((prev) => ({ ...prev, ...nextDrafts }));
                                          setAttributePricingConfigByItem((prev) => ({ ...prev, ...nextPricingConfigs }));
                                          setActiveVariantItemId(null);
                                        }
                                      }}
                                    >{areAllProductSizesExpanded ? 'Collapse all' : 'Expand all'}</button>
                                    <label className="spl-toggle-label" onClick={(e) => e.stopPropagation()}>
                                      <IndeterminateCheckbox
                                        checked={prodAllActive}
                                        indeterminate={prodSomeActive}
                                        onChange={(checked) => toggleGroupActive(prodIds, checked)}
                                        disabled={togglingActive}
                                      />
                                      Active
                                    </label>
                                    <span className="spl-item-count">{visibleProdItems.length} sizes</span>
                                  </div>
                                  {/* --- Product-level WHCC Attributes Display --- */}
                                  {/* Only the bottom (better styled) section is kept. */}
                                  {/* --- End Product-level WHCC Attributes Display --- */}

                                  {!prodCollapsed[prodKey] && (
                                    <>
                                      <div className="spl-product-attributes-preview" onClick={(e) => e.stopPropagation()}>
                                        <div className="spl-product-attributes-title">Product attributes</div>
                                        {productAttributePills.length === 0 ? (
                                          <div className="spl-product-attributes-empty">No imported attributes</div>
                                        ) : (
                                          <div className="spl-product-attributes-chips-grouped">
                                            {/* Required Attribute Pills */}
                                            <div style={{ marginBottom: 8 }}>
                                              <strong>Required:</strong>
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 4 }}>
                                                {(productWhccAttrs[prodKey]?.attrs?.required ?? []).length > 0 ? (
                                                  (productWhccAttrs[prodKey].attrs.required ?? []).map((attr) => {
                                                    const pill = productAttributePills.find(p => String(p.label).includes(attr.name));
                                                    if (!pill) return null;
                                                    const toggleKey = `${prodKey}-${pill.key}`;
                                                    const defaultKey = `${prodKey}-${pill.key}-default`;
                                                    const isSaving = savingProductAttributeKey === toggleKey || savingProductAttributeKey === defaultKey;
                                                    return (
                                                      <div
                                                        key={`compact-pill-required-${pill.key}`}
                                                        className={`spl-product-attribute-chip-wrap${pill.isActive ? ' is-active' : ''}${pill.isDefault ? ' is-default' : ''}`}
                                                      >
                                                        <button
                                                          type="button"
                                                          className={`spl-product-attribute-chip${pill.isActive ? ' is-active' : ''}${pill.isDefault ? ' is-default' : ''}${pill.togglable ? '' : ' is-readonly'}`}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            void toggleProductAttributePill(visibleProdItems, pill, toggleKey);
                                                          }}
                                                          disabled={!pill.togglable || isSaving}
                                                        >
                                                          {pill.label}{Number.isInteger(Number(pill.attributeUid)) && Number(pill.attributeUid) > 0 ? ` (#${Number(pill.attributeUid)})` : ''}
                                                        </button>
                                                        <button
                                                          type="button"
                                                          className={`spl-product-attribute-default-btn${pill.isDefault ? ' is-default' : ''}`}
                                                          title={pill.isDefault ? 'Default attribute' : 'Set as default attribute'}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            void setProductDefaultAttributePill(visibleProdItems, pill, defaultKey);
                                                          }}
                                                          disabled={!pill.togglable || isSaving}
                                                        >
                                                          {pill.isDefault ? '★' : '☆'}
                                                        </button>
                                                      </div>
                                                    );
                                                  })
                                                ) : <span style={{ marginLeft: 8 }}>None</span>}
                                              </div>
                                            </div>
                                            {/* Optional Attribute Pills */}
                                            <div>
                                              <strong>Optional:</strong>
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 4 }}>
                                                {(productWhccAttrs[prodKey]?.attrs?.optional ?? []).length > 0 ? (
                                                  (productWhccAttrs[prodKey].attrs.optional ?? []).map((attr) => {
                                                    const pill = productAttributePills.find(p => String(p.label).includes(attr.name));
                                                    if (!pill) return null;
                                                    const toggleKey = `${prodKey}-${pill.key}`;
                                                    const defaultKey = `${prodKey}-${pill.key}-default`;
                                                    const isSaving = savingProductAttributeKey === toggleKey || savingProductAttributeKey === defaultKey;
                                                    return (
                                                      <div
                                                        key={`compact-pill-optional-${pill.key}`}
                                                        className={`spl-product-attribute-chip-wrap${pill.isActive ? ' is-active' : ''}${pill.isDefault ? ' is-default' : ''}`}
                                                      >
                                                        <button
                                                          type="button"
                                                          className={`spl-product-attribute-chip${pill.isActive ? ' is-active' : ''}${pill.isDefault ? ' is-default' : ''}${pill.togglable ? '' : ' is-readonly'}`}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            void toggleProductAttributePill(visibleProdItems, pill, toggleKey);
                                                          }}
                                                          disabled={!pill.togglable || isSaving}
                                                        >
                                                          {pill.label}{Number.isInteger(Number(pill.attributeUid)) && Number(pill.attributeUid) > 0 ? ` (#${Number(pill.attributeUid)})` : ''}
                                                        </button>
                                                        <button
                                                          type="button"
                                                          className={`spl-product-attribute-default-btn${pill.isDefault ? ' is-default' : ''}`}
                                                          title={pill.isDefault ? 'Default attribute' : 'Set as default attribute'}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            void setProductDefaultAttributePill(visibleProdItems, pill, defaultKey);
                                                          }}
                                                          disabled={!pill.togglable || isSaving}
                                                        >
                                                          {pill.isDefault ? '★' : '☆'}
                                                        </button>
                                                      </div>
                                                    );
                                                  })
                                                ) : <span style={{ marginLeft: 8 }}>None</span>}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      <div className="spl-size-list">
                                        {visibleProdItems.map((item) => {
                                          const itemId = Number(item.id);
                                          const isExpanded = !!expandedSizeRows[itemId];
                                          const hasVariantPricing = hasVariantPricingRows(item);
                                          const variantRows = variantDraftsByItem[itemId] || [];
                                          const hasVariantDrafts = variantRows.length > 0;
                                          const isVariantEditorOpen = isExpanded && (activeVariantItemId === itemId || hasVariantDrafts);
                                          const activeVariantRows = variantRows.filter((row) => row.isActive);
                                          const sizeWhccUids = Array.from(new Set(
                                            getItemVariantsFromSource(item)
                                              .map((variant) => Number(variant?.whccProductUID || 0))
                                              .filter((uid) => Number.isInteger(uid) && uid > 0)
                                          ));
                                          const sizeAttributeUids = Array.from(new Set(
                                            getItemVariantsFromSource(item)
                                              .flatMap((variant) => Array.isArray(variant?.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs.map(Number) : [])
                                              .filter((uid) => Number.isInteger(uid) && uid > 0)
                                          ));

                                          return (
                                            <div key={`compact-size-${item.id}`} className="spl-size-row-wrap">
                                              <div className={`spl-size-row${item.is_active ? '' : ' spl-inactive-row'}`}>
                                                <button
                                                  className="spl-collapse-btn"
                                                  onClick={() => {
                                                    setExpandedSizeRows((prev) => {
                                                      const shouldExpand = !prev[itemId];
                                                      if (shouldExpand && shouldAutoOpenVariantEditor(item)) startVariantEdit(item);
                                                      if (!shouldExpand && activeVariantItemId === itemId) setActiveVariantItemId(null);
                                                      return shouldExpand ? { [itemId]: true } : {};
                                                    });
                                                  }}
                                                >
                                                  {isExpanded ? '▼' : '▶'}
                                                </button>
                                                <span className="spl-size-name">{item._sizeLabel || item.size_name || '—'}</span>
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                                  {/* Show all possible UID fields and debug backend values */}
                                                  WHCC: {sizeWhccUids.length ? sizeWhccUids.join(', ') : (itemDrafts[item.id]?.whccProductUID || item.whccProductUID || '—')}
                                                  {typeof item.whccProductUID !== 'undefined' && (
                                                    <span style={{ color: '#ffb347', marginLeft: 6 }}>
                                                      [item.whccProductUID: {String(item.whccProductUID)}]
                                                    </span>
                                                  )}
                                                  {typeof item.whcc_product_uid !== 'undefined' && (
                                                    <span style={{ color: '#ffb347', marginLeft: 6 }}>
                                                      [item.whcc_product_uid: {String(item.whcc_product_uid)}]
                                                    </span>
                                                  )}
                                                  {typeof item.productUID !== 'undefined' && (
                                                    <span style={{ color: '#ffb347', marginLeft: 6 }}>
                                                      [item.productUID: {String(item.productUID)}]
                                                    </span>
                                                  )}
                                                  {typeof item.product_uid !== 'undefined' && (
                                                    <span style={{ color: '#ffb347', marginLeft: 6 }}>
                                                      [item.product_uid: {String(item.product_uid)}]
                                                    </span>
                                                  )}
                                                  {/* Full item debug: */}
                                                  <span style={{ color: '#ffb347', marginLeft: 6, fontSize: 9 }}>
                                                    [raw: {JSON.stringify({
                                                      whccProductUID: item.whccProductUID,
                                                      whcc_product_uid: item.whcc_product_uid,
                                                      productUID: item.productUID,
                                                      product_uid: item.product_uid
                                                    })}]
                                                  </span>
                                                </span>
                                                {sizeAttributeUids.length > 0 && (
                                                  <span style={{ fontSize: 11, color: '#8ec9ff', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                                    attrs: {sizeAttributeUids.join(', ')}
                                                  </span>
                                                )}
                                                <label className="spl-toggle-label">
                                                  <input
                                                    type="checkbox"
                                                    checked={!!item.is_active}
                                                    onChange={(e) => toggleItemActive(item, e.target.checked)}
                                                    disabled={togglingActive}
                                                  />
                                                  Active
                                                </label>
                                                {!hasVariantPricing && (
                                                  <>
                                                    <input
                                                      className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                                      style={{ maxWidth: 92 }}
                                                      type="number"
                                                      min={0}
                                                      step="0.01"
                                                      placeholder="Cost"
                                                      value={itemDrafts[item.id]?.base_cost ?? ''}
                                                      onChange={(e) => setItemDrafts((p) => ({ ...p, [item.id]: { ...p[item.id], base_cost: e.target.value } }))}
                                                      onBlur={() => autoSaveItem(item.id)}
                                                    />
                                                    <input
                                                      className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                                      style={{ maxWidth: 92 }}
                                                      type="number"
                                                      min={0}
                                                      step="1"
                                                      placeholder="Markup %"
                                                      value={itemDrafts[item.id]?.markup_percent ?? ''}
                                                      onChange={(e) => setItemDrafts((p) => ({ ...p, [item.id]: { ...p[item.id], markup_percent: e.target.value } }))}
                                                      onBlur={() => autoSaveItem(item.id)}
                                                    />
                                                  </>
                                                )}
                                                <button
                                                  className="btn btn-secondary btn-sm"
                                                  onClick={() => {
                                                    if (isVariantEditorOpen) {
                                                      setActiveVariantItemId((prev) => (prev === itemId ? null : prev));
                                                      setVariantDraftsByItem((prev) => {
                                                        if (!prev[itemId]) return prev;
                                                        const next = { ...prev };
                                                        delete next[itemId];
                                                        return next;
                                                      });
                                                    } else {
                                                      startVariantEdit(item);
                                                    }
                                                  }}
                                                >
                                                  {isVariantEditorOpen ? 'Close attrs' : 'Edit attrs'}
                                                </button>
                                              </div>

                                              {isExpanded && isVariantEditorOpen && (
                                                <div className="spl-variant-editor" style={{ marginTop: 6 }}>
                                                  <div className="spl-variant-editor-toolbar">
                                                    <strong>Size attribute pricing</strong>
                                                    <div className="spl-variant-editor-actions">
                                                      <button className="btn btn-secondary btn-sm" onClick={() => addVariantRow(itemId)}>Add</button>
                                                      <button className="btn btn-primary btn-sm" onClick={() => void saveVariantRows(item)} disabled={savingVariantItemId === itemId}>
                                                        {savingVariantItemId === itemId ? 'Saving...' : 'Save'}
                                                      </button>
                                                    </div>
                                                  </div>
                                                  {activeVariantRows.length === 0 ? (
                                                    <div className="spl-variant-empty">No active attributes. Activate product attributes above.</div>
                                                  ) : (
                                                    activeVariantRows.map((row) => (
                                                      <div key={`compact-var-${row.localId}`} className="spl-variant-grid spl-variant-grid-row" style={{ marginBottom: 6 }}>
                                                        <input className="spl-variant-input" value={row.displayName} onChange={(e) => updateVariantRow(itemId, row.localId, { displayName: e.target.value })} placeholder="Attribute name" />
                                                        <input className="spl-variant-input" type="number" min={0} step="0.01" value={row.baseCost} onChange={(e) => updateVariantRow(itemId, row.localId, { baseCost: e.target.value })} placeholder="Cost" />
                                                        <input className="spl-variant-input" type="number" min={0} step="0.01" value={row.price} onChange={(e) => updateVariantRow(itemId, row.localId, { price: e.target.value })} placeholder="Price" />
                                                        <span style={{ fontSize: 11, color: '#8ec9ff', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                                          UID: {String(row.whccItemAttributeUIDs || '').trim() || '—'}
                                                        </span>
                                                        <label className="spl-variant-toggle">
                                                          <input type="radio" name={`compact-default-${itemId}`} checked={row.isDefault} onChange={() => makeVariantDefault(itemId, row.localId)} />
                                                          <span>Default</span>
                                                        </label>
                                                        <label className="spl-variant-toggle">
                                                          <input type="checkbox" checked={row.isActive} onChange={(e) => updateVariantRow(itemId, row.localId, { isActive: e.target.checked })} />
                                                          <span>Active</span>
                                                        </label>
                                                      </div>
                                                    ))
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {false && Object.keys(viewGrouped).filter(catVisible).map(cat => {
                  const catIds = itemIdsForCat(cat).filter(id => {
                    if (!showZeroCostOnly) return true;
                    const found = viewItems.find(i => i.id === id);
                    return found ? isZeroCostItem(found) : false;
                  });
                  const catAllActive = allActiveInGroup(catIds);
                  const catSomeActive = !catAllActive && someActiveInGroup(catIds);
                  return (
                    <div key={cat} className="spl-category-block">
                      <div
                        className="spl-category-header"
                        onClick={() => setCatCollapsed(p => ({ ...p, [cat]: !p[cat] }))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.stopPropagation(); void handleDropOnCategory(e, cat); }}
                      >
                        <button className="spl-collapse-btn">{catCollapsed[cat] ? '▶' : '▼'}</button>
                        {/* Category image */}
                        <div className="spl-cat-img-wrap" title="Click to upload category image"
                          onClick={e => { e.stopPropagation(); catImgInputRefs.current[cat]?.click(); }}>
                          {categoryImages[cat]
                            ? <img src={categoryImages[cat]} className="spl-cat-img" alt={cat} />
                            : <span>🖼</span>}
                          <div className="spl-cat-img-overlay">
                            {uploadingCategory === cat ? '⏳' : '📷'}
                          </div>
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            ref={el => { catImgInputRefs.current[cat] = el; }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleCategoryImageUpload(cat, f); e.target.value = ''; }}
                          />
                        </div>
                        <strong>{cat}</strong>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 8px' }}
                          onClick={(e) => { e.stopPropagation(); handleRenameCategory(cat); }}
                        >Rename</button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 8px' }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                        >Delete</button>
                        <span
                          style={{
                            marginLeft: 10,
                            padding: '4px 8px',
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.06)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)'
                          }}
                        >
                          {getCategoryImageMode(cat)}
                        </span>
                        <label className="spl-toggle-label" onClick={e => e.stopPropagation()}>
                          <IndeterminateCheckbox
                            checked={catAllActive}
                            indeterminate={catSomeActive}
                            onChange={checked => toggleGroupActive(catIds, checked)}
                            disabled={togglingActive}
                          />
                          Active
                        </label>
                        <span className="spl-item-count">{catIds.length} sizes</span>
                      </div>

                      {!catCollapsed[cat] && (
                        <div className="spl-category-body">
                          {Object.keys(viewGrouped[cat]).filter(prod => prodVisible(cat, prod)).map(prod => {
                            const prodIds = itemIdsForProd(cat, prod).filter(id => {
                              if (!showZeroCostOnly) return true;
                              const found = viewItems.find(i => i.id === id);
                              return found ? isZeroCostItem(found) : false;
                            });
                            const visibleProdItems = viewGrouped[cat][prod].filter(item => !showZeroCostOnly || isZeroCostItem(item));
                            const productAttributePills = (() => {
                              const byLabel = new Map<string, {
                                key: string;
                                label: string;
                                isActive: boolean;
                                isDefault: boolean;
                                togglable: boolean;
                                attributeUid?: number;
                              }>();

                              for (const item of visibleProdItems) {
                                const variants = getItemVariantsFromSource(item);
                                const categories = Array.isArray(item?.whccAttributeCategories) ? item.whccAttributeCategories : [];
                                const categoryAttrUids = new Set<number>();
                                const uidToLabel = new Map<number, string>();
                                for (const category of categories) {
                                  const categoryName = String(category?.name || category?.AttributeCategoryName || 'Attributes').trim() || 'Attributes';
                                  const attrs = Array.isArray(category?.attributes)
                                    ? category.attributes
                                    : Array.isArray(category?.Attributes)
                                    ? category.Attributes
                                    : [];
                                  for (const attribute of attrs) {
                                    const uid = Number(attribute?.uid ?? attribute?.Id ?? attribute?.AttributeUID ?? attribute?.attributeUID ?? attribute?.id ?? 0);
                                    const name = String(attribute?.name ?? attribute?.AttributeName ?? attribute?.DisplayName ?? '').trim() || (Number.isInteger(uid) && uid > 0 ? `Attribute ${uid}` : 'Attribute');
                                    const label = `${categoryName}: ${name}`;
                                    if (Number.isInteger(uid) && uid > 0) {
                                      categoryAttrUids.add(uid);
                                      uidToLabel.set(uid, label);
                                      const key = `uid-${uid}`;
                                      const existing = byLabel.get(label);
                                      if (!existing) {
                                        byLabel.set(label, { key, label, isActive: false, isDefault: false, togglable: true, attributeUid: uid });
                                      }
                                    } else {
                                      const key = `category-${label}`;
                                      if (!byLabel.has(label)) {
                                        byLabel.set(label, { key, label, isActive: false, isDefault: false, togglable: false });
                                      }
                                    }
                                  }
                                }

                                for (const variant of variants) {
                                  const variantDisplayName = String(variant?.displayName || '').trim();
                                  const attrs = Array.isArray(variant?.whccItemAttributeUIDs)
                                    ? variant.whccItemAttributeUIDs.map((uid) => Number(uid)).filter((uid) => Number.isInteger(uid) && uid > 0)
                                    : [];

                                  for (const uid of attrs) {
                                    const uidLabel = uidToLabel.get(uid);
                                    if (!uidLabel) continue;
                                    const existingByUidLabel = byLabel.get(uidLabel);
                                    if (!existingByUidLabel) continue;
                                    byLabel.set(uidLabel, {
                                      ...existingByUidLabel,
                                      isActive: existingByUidLabel.isActive || Boolean(variant?.isActive),
                                      isDefault: existingByUidLabel.isDefault || Boolean(variant?.isDefault),
                                    });
                                  }

                                  if (!categoryAttrUids.size || attrs.every((uid) => !categoryAttrUids.has(uid))) {
                                    const variantLabel = variantDisplayName
                                      || (() => {
                                        const named = attrs.map((uid) => uidToLabel.get(uid)).filter(Boolean) as string[];
                                        if (named.length) return named[0];
                                        return attrs.length ? `UIDs: ${attrs.join(', ')}` : 'Unnamed Attribute';
                                      })();
                                    const label = variantLabel;
                                    const key = `variant-${label}`;
                                    const existing = byLabel.get(label);
                                    const next = {
                                      key,
                                      label,
                                      isActive: Boolean(variant?.isActive),
                                      isDefault: Boolean(variant?.isDefault),
                                      togglable: Boolean(variantDisplayName),
                                    };
                                    if (!existing) byLabel.set(label, next);
                                    else byLabel.set(label, {
                                      ...existing,
                                      isActive: existing.isActive || next.isActive,
                                      isDefault: existing.isDefault || next.isDefault,
                                      togglable: existing.togglable || next.togglable,
                                    });
                                  }
                                }
                              }

                              return Array.from(byLabel.values());
                            })();
                            const prodAllActive = allActiveInGroup(prodIds);
                            const prodSomeActive = !prodAllActive && someActiveInGroup(prodIds);
                            const prodKey = `${cat}||${prod}`;
                            return (
                              <div key={prod} className="spl-product-block">
                                <div
                                  className="spl-product-header"
                                  draggable
                                  onDragStart={(e) => {
                                    const first = viewGrouped[cat][prod]?.[0];
                                    if (first) beginProductDrag(e, first);
                                  }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => { e.stopPropagation(); void handleDropOnProduct(e, cat, prod); }}
                                  onClick={() => setProdCollapsed(p => ({ ...p, [prodKey]: !p[prodKey] }))}
                                >
                                  <button className="spl-collapse-btn">{prodCollapsed[prodKey] ? '▶' : '▼'}</button>
                                  {/* Product image upload and display at product group level */}
                                  {(() => {
                                    // Find the first item in this product group to get product_id and product_name
                                    const firstItem = viewGrouped[cat][prod][0];
                                    if (!firstItem) return null;
                                    return (
                                      <div className="spl-prod-img-wrap" title="Click to upload product image"
                                        style={{ cursor: 'pointer', width: 36, height: 36, position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
                                        onClick={e => { e.stopPropagation(); prodImgInputRefs.current[firstItem.product_id]?.click(); }}>
                                        {productImages[firstItem.product_id] ? (
                                          <img src={productImages[firstItem.product_id]} alt={firstItem.product_name} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #444' }} />
                                        ) : categoryImages[cat] ? (
                                          <img src={categoryImages[cat]} alt={cat} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #444', opacity: 0.5 }} />
                                        ) : (
                                          <span style={{ fontSize: 18, opacity: 0.5 }}>🖼</span>
                                        )}
                                        <div className="spl-prod-img-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: uploadingProduct === firstItem.product_id ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)', fontSize: 16, borderRadius: 4 }}>
                                          {uploadingProduct === firstItem.product_id ? '⏳' : '📷'}
                                        </div>
                                        <input type="file" accept="image/*" style={{ display: 'none' }}
                                          ref={el => { prodImgInputRefs.current[firstItem.product_id] = el; }}
                                          onChange={e => { const f = e.target.files?.[0]; if (f) handleProductImageUpload(firstItem.product_id, f); e.target.value = ''; }}
                                        />
                                      </div>
                                    );
                                  })()}
                                  <span>{prod}</span>
                                  {(() => {
                                    const prodWhccUids = Array.from(new Set(
                                      visibleProdItems.flatMap(item =>
                                        getItemVariantsFromSource(item)
                                          .map(v => Number(v?.whccProductUID || 0))
                                          .filter(uid => uid > 0)
                                          .concat(Number(item.whccProductUID || 0) > 0 ? [Number(item.whccProductUID)] : [])
                                      )
                                    ));
                                    return prodWhccUids.length ? (
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}
                                        title="WHCC Product UID(s) across all sizes">
                                        WHCC: {prodWhccUids.join(', ')}
                                      </span>
                                    ) : null;
                                  })()}
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '2px 8px' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const first = viewGrouped[cat][prod]?.[0];
                                      if (first) handleMoveProductCategory(first);
                                    }}
                                  >Move Product</button>
                                  <label className="spl-toggle-label" onClick={e => e.stopPropagation()}>
                                    <IndeterminateCheckbox
                                      checked={prodAllActive}
                                      indeterminate={prodSomeActive}
                                      onChange={checked => toggleGroupActive(prodIds, checked)}
                                      disabled={togglingActive}
                                    />
                                    Active
                                  </label>
                                  <span className="spl-item-count" style={{ marginLeft: 8 }}>{prodIds.length} sizes</span>
                                </div>

                                {!prodCollapsed[prodKey] && (
                                  <>
                                  <div className="spl-product-attributes-preview" onClick={(e) => e.stopPropagation()}>
                                    <div className="spl-product-attributes-title">Product-level attributes</div>
                                    {productAttributePills.length === 0 ? (
                                      <div className="spl-product-attributes-empty">No imported attributes for this product yet.</div>
                                    ) : (
                                      <div className="spl-product-attributes-chips">
                                        {productAttributePills.slice(0, 24).map((pill) => (
                                          <button
                                            key={pill.key}
                                            type="button"
                                            className={`spl-product-attribute-chip${pill.isActive ? ' is-active' : ''}${pill.isDefault ? ' is-default' : ''}${pill.togglable ? '' : ' is-readonly'}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void toggleProductAttributePill(visibleProdItems, pill, `${prodKey}-${pill.key}`);
                                            }}
                                            disabled={!pill.togglable || savingProductAttributeKey === `${prodKey}-${pill.key}`}
                                          >
                                            {pill.label}
                                          </button>
                                        ))}
                                        {productAttributePills.length > 24 && (
                                          <span className="spl-product-attribute-chip">+{productAttributePills.length - 24} more</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="spl-size-list">
                                    {visibleProdItems.map(item => {
                                      const itemId = Number(item.id);
                                      const variantRows = variantDraftsByItem[itemId] || [];
                                      const activeVariantRows = variantRows.filter((row) => row.isActive);
                                      const inactiveVariantCount = Math.max(0, variantRows.length - activeVariantRows.length);
                                      const isVariantEditorOpen = activeVariantItemId === itemId;
                                      const itemHasVariantPricing = hasVariantPricingRows(item);
                                      const itemHasAttributes = hasAttributeRows(item);
                                      const isSizeExpanded = !!expandedSizeRows[itemId];
                                      const importedAttributeCategories = Array.isArray(item?.whccAttributeCategories) ? item.whccAttributeCategories : [];
                                      const previewVariants = getItemVariantsFromSource(item);
                                      const previewOptions: Array<{ key: string; label: string; isDefault: boolean; isActive: boolean }> = importedAttributeCategories.length
                                        ? importedAttributeCategories.flatMap((category: any) => {
                                            const categoryName = String(category?.name || category?.AttributeCategoryName || 'Attributes').trim() || 'Attributes';
                                            const attributes = Array.isArray(category?.attributes)
                                              ? category.attributes
                                              : Array.isArray(category?.Attributes)
                                              ? category.Attributes
                                              : [];
                                            return attributes
                                              .map((attribute: any) => {
                                                const uid = Number(attribute?.uid ?? attribute?.Id ?? attribute?.AttributeUID ?? attribute?.id ?? 0);
                                                if (!Number.isInteger(uid) || uid <= 0) return null;
                                                const name = String(attribute?.name ?? attribute?.AttributeName ?? attribute?.DisplayName ?? '').trim() || `Attribute ${uid}`;
                                                return {
                                                  key: `${categoryName}-${uid}`,
                                                  label: `${categoryName}: ${name}`,
                                                  isDefault: false,
                                                  isActive: true,
                                                };
                                              })
                                              .filter(Boolean) as Array<{ key: string; label: string; isDefault: boolean; isActive: boolean }>;
                                          })
                                        : previewVariants.map((variant, index) => {
                                        const key = `${Number(variant?.id || 0)}-${index}`;
                                        const name = String(variant?.displayName || '').trim();
                                        const attrs = Array.isArray(variant?.whccItemAttributeUIDs)
                                          ? variant.whccItemAttributeUIDs.filter((uid) => Number.isInteger(Number(uid)) && Number(uid) > 0)
                                          : [];
                                        const label = name || (attrs.length ? `Attribute UID${attrs.length === 1 ? '' : 's'} ${attrs.join(', ')}` : `Variant ${index + 1}`);
                                        return { key, label, isDefault: Boolean(variant?.isDefault), isActive: variant?.isActive !== false };
                                          });
                                      const defaultPreviewKey = previewOptions.find((option) => option.isDefault && option.isActive)?.key
                                        || previewOptions.find((option) => option.isActive)?.key
                                        || previewOptions[0]?.key
                                        || '';
                                      const selectedPreviewKey = selectedVariantPreviewByItem[itemId] || defaultPreviewKey;
                                      const sizeWhccUids = Array.from(new Set(
                                        getItemVariantsFromSource(item)
                                          .map((variant) => Number(variant?.whccProductUID || 0))
                                          .filter((uid) => Number.isInteger(uid) && uid > 0)
                                      ));

                                      return (
                                      <React.Fragment key={item.id}>
                                      <div
                                        className={`spl-size-row${item.is_active ? '' : ' spl-inactive-row'}${isSizeExpanded ? ' spl-size-row-expanded' : ''}`}
                                        draggable
                                        onDragStart={(e) => beginSizeDrag(e, item)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                        onClick={() => {
                                          setExpandedSizeRows((prev) => {
                                            const isCurrentlyExpanded = !!prev[itemId];
                                            const shouldExpand = !isCurrentlyExpanded;
                                            if (!shouldExpand && activeVariantItemId === itemId) {
                                              setActiveVariantItemId(null);
                                            }
                                            if (shouldExpand && activeVariantItemId !== null && activeVariantItemId !== itemId) {
                                              setActiveVariantItemId(null);
                                            }
                                            if (shouldExpand) {
                                              if (shouldAutoOpenVariantEditor(item)) {
                                                startVariantEdit(item);
                                              }
                                            }
                                            return shouldExpand ? { [itemId]: true } : {};
                                          });
                                        }}
                                      >
                                        <button className="spl-collapse-btn" style={{ fontSize: 12 }}>{isSizeExpanded ? '▼' : '▶'}</button>
                                        {/* No product image upload/display at size level */}
                                        <span className="spl-size-name">{item._sizeLabel || item.size_name || '—'}</span>
                                        <span
                                          style={{
                                            fontSize: 11,
                                            color: 'var(--text-secondary)',
                                            fontFamily: 'monospace',
                                            whiteSpace: 'nowrap'
                                          }}
                                          title="WHCC Product UID(s) for this size"
                                        >
                                          WHCC: {sizeWhccUids.length ? sizeWhccUids.join(', ') : (itemDrafts[item.id]?.whccProductUID || item.whccProductUID || '—')}
                                        </span>
                                        {(() => {
                                          const attrUids = Array.from(new Set(
                                            getItemVariantsFromSource(item)
                                              .flatMap(v => Array.isArray(v?.whccItemAttributeUIDs) ? v.whccItemAttributeUIDs.map(Number) : [])
                                              .filter(uid => uid > 0)
                                          ));
                                          return attrUids.length ? (
                                            <span
                                              style={{ fontSize: 11, color: '#8ec9ff', fontFamily: 'monospace', whiteSpace: 'nowrap' }}
                                              title="WHCC Attribute UIDs (separate from product UIDs)">
                                              attrs: {attrUids.join(', ')}
                                            </span>
                                          ) : null;
                                        })()}
                                        <label className="spl-toggle-label" onClick={(e) => e.stopPropagation()}>
                                          <input type="checkbox" checked={!!item.is_active} disabled={togglingActive}
                                            onChange={e => toggleItemActive(item, e.target.checked)} />
                                          Active
                                        </label>
                                      </div>
                                      {isSizeExpanded && (
                                      <div className="spl-size-row-details">
                                        {!itemHasVariantPricing && (
                                          <>
                                            <div className="spl-field-group">
                                              <label>Cost $ (no markup)</label>
                                              <input
                                                className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                                type="number" min={0} step="0.01"
                                                value={itemDrafts[item.id]?.base_cost ?? ''}
                                                onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], base_cost: e.target.value } }))}
                                                onBlur={() => autoSaveItem(item.id)}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                            </div>
                                            <div className="spl-field-group">
                                              <label>Markup %</label>
                                              <input
                                                className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                                type="number" min={0} step="1"
                                                value={itemDrafts[item.id]?.markup_percent ?? ''}
                                                onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], markup_percent: e.target.value } }))}
                                                onBlur={() => autoSaveItem(item.id)}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                            </div>
                                            <div className="spl-field-group">
                                              <label>Markup $</label>
                                              <div style={{ minWidth: 60 }}>
                                                {(() => {
                                                  const cost = parseFloat(itemDrafts[item.id]?.base_cost ?? item.base_cost ?? 0);
                                                  const percent = parseFloat(itemDrafts[item.id]?.markup_percent ?? item.markup_percent ?? 0);
                                                  if (isNaN(cost) || isNaN(percent)) return '—';
                                                  return (cost * percent / 100).toFixed(2);
                                                })()}
                                              </div>
                                            </div>
                                            <div className="spl-field-group">
                                              <label>Total $</label>
                                              <div style={{ minWidth: 60 }}>
                                                {(() => {
                                                  const cost = parseFloat(itemDrafts[item.id]?.base_cost ?? item.base_cost ?? 0);
                                                  const percent = parseFloat(itemDrafts[item.id]?.markup_percent ?? item.markup_percent ?? 0);
                                                  if (isNaN(cost) || isNaN(percent)) return '—';
                                                  const markup = cost * percent / 100;
                                                  return (cost + markup).toFixed(2);
                                                })()}
                                              </div>
                                            </div>
                                          </>
                                        )}
                                        <div className="spl-field-group">
                                          <label>Digital Scope</label>
                                          {item.isDigital ? (
                                            <select
                                              className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                              value={itemDrafts[item.id]?.digitalDownloadScope ?? 'photo'}
                                              onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], digitalDownloadScope: (e.target.value as 'photo' | 'album') || 'photo' } }))}
                                              onBlur={() => autoSaveItem(item.id)}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <option value="photo">Single photo</option>
                                              <option value="album">Full album ZIP</option>
                                            </select>
                                          ) : (
                                            <div style={{ minWidth: 90, color: 'var(--text-secondary)' }}>Physical</div>
                                          )}
                                        </div>
                                        <div className="spl-field-group">
                                          <label>Digital Pricing</label>
                                          {item.isDigital ? (
                                            <select
                                              className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                              value={itemDrafts[item.id]?.digitalPricingMode ?? 'fixed'}
                                              onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], digitalPricingMode: (e.target.value as 'fixed' | 'percentage') || 'fixed' } }))}
                                              onBlur={() => autoSaveItem(item.id)}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <option value="fixed">Fixed/base</option>
                                              <option value="percentage">Percentage</option>
                                            </select>
                                          ) : (
                                            <div style={{ minWidth: 90, color: 'var(--text-secondary)' }}>—</div>
                                          )}
                                        </div>
                                        <div className="spl-field-group" style={{ minWidth: 120 }}>
                                          <label>Super %</label>
                                          {item.isDigital && (itemDrafts[item.id]?.digitalPricingMode ?? 'fixed') === 'percentage' ? (
                                            <input
                                              className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                              type="number" min={0} max={100} step="0.01"
                                              value={itemDrafts[item.id]?.superAdminPercentage ?? ''}
                                              onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], superAdminPercentage: e.target.value } }))}
                                              onBlur={() => autoSaveItem(item.id)}
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          ) : (
                                            <div style={{ minWidth: 60, color: 'var(--text-secondary)' }}>—</div>
                                          )}
                                        </div>
                                        <div className="spl-field-group">
                                          <label>WHCC ID (Product UID)</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="number" min={1} step="1"
                                            value={itemDrafts[item.id]?.whccProductUID ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], whccProductUID: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                        <div className="spl-field-group" style={{ minWidth: 240 }}>
                                          <label>Imported Attributes</label>
                                          <select
                                            className="spl-num-input"
                                            style={{ width: 240, textAlign: 'left' }}
                                            value={selectedPreviewKey}
                                            onChange={(e) => setSelectedVariantPreviewByItem((prev) => ({ ...prev, [itemId]: e.target.value }))}
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={previewOptions.length === 0}
                                          >
                                            {previewOptions.length === 0 && <option value="">No imported attributes</option>}
                                            {previewOptions.map((option) => (
                                              <option key={option.key} value={option.key}>{option.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="spl-field-group">
                                          <label>WHCC Node ID</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="number" min={1} step="1"
                                            value={itemDrafts[item.id]?.whccProductNodeID ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], whccProductNodeID: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                        <div className="spl-field-group">
                                          <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (isVariantEditorOpen) {
                                                setActiveVariantItemId(null);
                                              } else {
                                                startVariantEdit(item);
                                              }
                                            }}
                                          >{isVariantEditorOpen ? 'Close Attributes' : (itemHasAttributes ? 'Edit Attributes' : 'Add Attributes')}</button>
                                        </div>
                                        {itemHasAttributes && (
                                          <div className="spl-field-group" style={{ minWidth: 220 }}>
                                            <label>Size-level pricing</label>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                              Controlled by attribute rows
                                            </div>
                                          </div>
                                        )}
                                        <div className="spl-field-group">
                                          <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleMoveSizeCategory(item);
                                            }}
                                          >Move Size</button>
                                        </div>
                                      </div>
                                      )}
                                      {isVariantEditorOpen && (
                                        <div className="spl-variant-editor">
                                          <div className="spl-variant-editor-toolbar">
                                            <div>
                                              <strong>Product Attributes</strong>
                                            </div>
                                            <div className="spl-variant-editor-actions">
                                              <label className="spl-variant-toolbar-field">
                                                <span>Profit %</span>
                                                <input
                                                  className="spl-variant-toolbar-input"
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  value={attributePricingConfigByItem[itemId]?.percent ?? '0'}
                                                  onChange={(e) => updateAttributePricingConfig(itemId, { percent: e.target.value })}
                                                />
                                              </label>
                                              <label className="spl-variant-toolbar-field">
                                                <span>Round to</span>
                                                <select
                                                  className="spl-variant-toolbar-input"
                                                  value={attributePricingConfigByItem[itemId]?.roundingSuffix ?? DEFAULT_ATTRIBUTE_ROUNDING_SUFFIX}
                                                  onChange={(e) => updateAttributePricingConfig(itemId, { roundingSuffix: e.target.value })}
                                                >
                                                  {ATTRIBUTE_ROUNDING_OPTIONS.map((suffix) => (
                                                    <option key={suffix} value={suffix}>{suffix}</option>
                                                  ))}
                                                </select>
                                              </label>
                                              <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  resetVariantRows(item);
                                                }}
                                              >Reset</button>
                                              <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  applyVariantPricingPreset(itemId);
                                                }}
                                              >Apply Pricing</button>
                                              <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  addVariantRow(itemId);
                                                }}
                                              >Add Attribute</button>
                                              <button
                                                className="btn btn-primary btn-sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  void saveVariantRows(item);
                                                }}
                                                disabled={savingVariantItemId === itemId}
                                              >{savingVariantItemId === itemId ? 'Saving...' : 'Save Attributes'}</button>
                                            </div>
                                          </div>

                                          <div className="spl-variant-grid spl-variant-grid-header">
                                            <span>Attribute</span>
                                            <span>WHCC Cost</span>
                                            <span>Markup $</span>
                                            <span>Price</span>
                                            <span>Default</span>
                                            <span>Actions</span>
                                          </div>

                                          {activeVariantRows.length === 0 && (
                                            <div className="spl-variant-empty">No active attributes for pricing. Activate attributes at product level, or add one and mark it active.</div>
                                          )}

                                          {inactiveVariantCount > 0 && (
                                            <div className="spl-variant-empty" style={{ paddingTop: 0 }}>
                                              {inactiveVariantCount} inactive attribute{inactiveVariantCount === 1 ? '' : 's'} hidden from size pricing.
                                            </div>
                                          )}

                                          {activeVariantRows.map((row) => (
                                            <div key={row.localId} className="spl-variant-row-card">
                                              <div className="spl-variant-grid spl-variant-grid-row">
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                  <input
                                                    className="spl-variant-input"
                                                    type="text"
                                                    placeholder="e.g. Slim White"
                                                    value={row.displayName}
                                                    onChange={(e) => updateVariantRow(itemId, row.localId, { displayName: e.target.value })}
                                                  />
                                                  {Array.isArray(row.whccItemAttributeUIDs) && row.whccItemAttributeUIDs.length === 1 && (
                                                    <span style={{ fontSize: 12, color: '#3498ff', fontFamily: 'monospace', marginLeft: 8, minWidth: 60, textAlign: 'right' }}>
                                                      UID: {row.whccItemAttributeUIDs[0]}
                                                    </span>
                                                  )}
                                                </div>
                                                <input
                                                  className="spl-variant-input"
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  placeholder="0.00"
                                                  value={row.baseCost}
                                                  onChange={(e) => updateVariantRow(itemId, row.localId, { baseCost: e.target.value })}
                                                />
                                                <input
                                                  className="spl-variant-input"
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  placeholder="0.00"
                                                  value={getVariantMarkupAmount(row)}
                                                  onChange={(e) => updateVariantMarkupAmount(itemId, row.localId, e.target.value)}
                                                />
                                                <input
                                                  className="spl-variant-input"
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  placeholder="0.00"
                                                  value={row.price}
                                                  onChange={(e) => updateVariantRow(itemId, row.localId, { price: e.target.value })}
                                                />
                                                <label className="spl-variant-toggle">
                                                  <input
                                                    type="radio"
                                                    name={`default-variant-${itemId}`}
                                                    checked={row.isDefault}
                                                    onChange={() => makeVariantDefault(itemId, row.localId)}
                                                  />
                                                  <span>Default</span>
                                                </label>
                                                <button
                                                  className="btn btn-secondary btn-sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeVariantRow(itemId, row.localId);
                                                  }}
                                                >Delete</button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      </React.Fragment>
                                    );})}
                                  </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>
    </AdminLayout>
  );
};

export default SuperAdminPricing;

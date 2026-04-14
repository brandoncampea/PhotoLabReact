
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
    drafts[item.id] = {
      base_cost: String(item.base_cost ?? ''),
      markup_percent: String(item.markup_percent ?? ''),
      whccProductUID: String(item.whccProductUID ?? ''),
      whccProductNodeID: String(item.whccProductNodeID ?? ''),
      whccItemAttributeUIDs: Array.isArray(item.whccItemAttributeUIDs) ? item.whccItemAttributeUIDs.join(', ') : '',
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
  const [addingManual, setAddingManual] = useState(false);
  const [whccCatalog, setWhccCatalog] = useState<WhccCatalogEntry[]>([]);
  const [whccCatalogLoading, setWhccCatalogLoading] = useState(false);
  const [, setWhccCatalogError] = useState('');
  const [showZeroCostOnly, setShowZeroCostOnly] = useState(false);
  const [autoMatchingWhcc, setAutoMatchingWhcc] = useState(false);
  const [syncingWhccCosts, setSyncingWhccCosts] = useState(false);
  const [fillingWhccNodes, setFillingWhccNodes] = useState(false);
  const [whccReportRows, setWhccReportRows] = useState<WhccAutoMatchReportRow[]>([]);
  const [whccReportVisible, setWhccReportVisible] = useState(false);

  // derive grouped structure from viewItems
  const viewGrouped = useMemo(() => groupItems(viewItems), [viewItems]);

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
    try {
      const [items, images, prodImgs] = await Promise.all([
        superPriceListService.getItems(list.id),
        superPriceListService.getCategoryImages(list.id).catch(() => []),
        superPriceListService.getProductImages ? superPriceListService.getProductImages(list.id).catch(() => []) : Promise.resolve([]),
      ]);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      setItemDrafts(buildItemDrafts(arr));
      // init category images
      const imgMap: Record<string, string> = {};
      if (Array.isArray(images)) images.forEach((img: any) => { imgMap[img.category_name] = img.image_url; });
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
      groupItems(arr) && Object.keys(groupItems(arr)).forEach(cat => { cats[cat] = true; });
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
    if (
      newCost === original.base_cost &&
      newMarkup === original.markup_percent &&
      String(newWhccProductUID ?? '') === String(original.whccProductUID ?? '') &&
      String(newWhccProductNodeID ?? '') === String(original.whccProductNodeID ?? '') &&
      newAttributes.join(',') === originalAttributes
    ) return;
    setAutoSaving(prev => ({ ...prev, [itemId]: true }));
    try {
      await superPriceListService.updateItem(viewList!.id, itemId, {
        base_cost: newCost,
        markup_percent: newMarkup,
        whccProductUID: newWhccProductUID,
        whccProductNodeID: newWhccProductNodeID,
        whccItemAttributeUIDs: newAttributes,
      });
      setViewItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        base_cost: newCost,
        markup_percent: newMarkup,
        whccProductUID: newWhccProductUID,
        whccProductNodeID: newWhccProductNodeID,
        whccItemAttributeUIDs: newAttributes,
      } : i));
    } catch {
      setViewError('Failed to save item.');
    } finally {
      setAutoSaving(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    }
  };

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
      const result: any = await superPriceListService.syncWhccCosts(viewList.id);
      const updated = Number(result?.updatedCount || 0);
      const unchanged = Number(result?.unchangedCount || 0);
      const unmatched = Number(result?.unmatchedCount || 0);
      const skippedNonZero = Number(result?.skippedNonZeroCount || 0);
      const items = await superPriceListService.getItems(viewList.id);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      setItemDrafts(buildItemDrafts(arr));
      setViewError(`WHCC cost sync complete: ${updated} updated, ${unchanged} unchanged, ${unmatched} unmatched, ${skippedNonZero} non-zero skipped.`);
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
    if (!visibleItems.length) return false;

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
                    {syncingWhccCosts ? 'Syncing…' : 'Fill Zero Costs from CSV'}
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={fillingWhccNodes || viewItems.length === 0}
                    onClick={handleFillMissingWhccNodeIds}>
                    {fillingWhccNodes ? 'Filling…' : 'Fill Missing Node IDs'}
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
              </div>

              {/* Tree body */}
              <div className="spl-body">
                {viewItems.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No items in this price list.</p>
                )}
                {Object.keys(viewGrouped).filter(catVisible).map(cat => {
                  const catIds = itemIdsForCat(cat).filter(id => {
                    if (!showZeroCostOnly) return true;
                    const found = viewItems.find(i => i.id === id);
                    return found ? isZeroCostItem(found) : false;
                  });
                  const catAllActive = allActiveInGroup(catIds);
                  const catSomeActive = !catAllActive && someActiveInGroup(catIds);
                  return (
                    <div key={cat} className="spl-category-block">
                      <div className="spl-category-header" onClick={() => setCatCollapsed(p => ({ ...p, [cat]: !p[cat] }))}>
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
                            const prodAllActive = allActiveInGroup(prodIds);
                            const prodSomeActive = !prodAllActive && someActiveInGroup(prodIds);
                            const prodKey = `${cat}||${prod}`;
                            return (
                              <div key={prod} className="spl-product-block">
                                <div className="spl-product-header" onClick={() => setProdCollapsed(p => ({ ...p, [prodKey]: !p[prodKey] }))}>
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
                                  <div className="spl-size-list">
                                    {viewGrouped[cat][prod].filter(item => !showZeroCostOnly || isZeroCostItem(item)).map(item => (
                                      <div key={item.id} className={`spl-size-row${item.is_active ? '' : ' spl-inactive-row'}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {/* No product image upload/display at size level */}
                                        <span className="spl-size-name">{item._sizeLabel || item.size_name || '—'}</span>
                                        <label className="spl-toggle-label">
                                          <input type="checkbox" checked={!!item.is_active} disabled={togglingActive}
                                            onChange={e => toggleItemActive(item, e.target.checked)} />
                                          Active
                                        </label>
                                        <div className="spl-field-group">
                                          <label>Cost $ (no markup)</label>
                                          <div style={{ minWidth: 60 }}>
                                            {(() => {
                                              const cost = parseFloat(itemDrafts[item.id]?.base_cost ?? item.base_cost ?? 0);
                                              if (isNaN(cost)) return '—';
                                              return cost.toFixed(2);
                                            })()}
                                          </div>
                                        </div>
                                        <div className="spl-field-group">
                                          <label>Markup %</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="number" min={0} step="1"
                                            value={itemDrafts[item.id]?.markup_percent ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], markup_percent: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
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
                                        <div className="spl-field-group">
                                          <label>WHCC Product UID</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="number" min={1} step="1"
                                            value={itemDrafts[item.id]?.whccProductUID ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], whccProductUID: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
                                          />
                                        </div>
                                        <div className="spl-field-group">
                                          <label>WHCC Node ID</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="number" min={1} step="1"
                                            value={itemDrafts[item.id]?.whccProductNodeID ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], whccProductNodeID: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
                                          />
                                        </div>
                                        <div className="spl-field-group" style={{ minWidth: 220 }}>
                                          <label>WHCC Attribute UIDs</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="text"
                                            placeholder="e.g. 1, 5, 42"
                                            value={itemDrafts[item.id]?.whccItemAttributeUIDs ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], whccItemAttributeUIDs: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
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

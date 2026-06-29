import React, { useState, useMemo, useRef } from 'react';
import { formatCropData } from '../utils/formatCropData';
import { Link, useNavigate } from 'react-router-dom';
import WatermarkedImage from './WatermarkedImage';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import '../pages/AlbumDetails.css';
import { photoService } from '../services/photoService';
import playerWatchlistService from '../services/playerWatchlistService';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { usePackageBuilder } from '../contexts/PackageBuilderContext';
import { Photo, Product, ProductSize, PackageSlot } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductWithMatch = Product & {
  bestSize?: ProductSize | null;
  ratioDiff: number;
  isRecommended: boolean;
};

type ProductOrderRow = {
  key: string;
  size: ProductSize;
  label: string;
  price: number;
  variant?: {
    id?: number | null;
    localId?: string;
    displayName?: string;
    whccProductUID?: number | null;
    whccProductNodeIDs?: number[];
    whccItemAttributeUIDs?: number[];
    isDefault?: boolean;
    isActive?: boolean;
  } | null;
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PhotoOrderPanelProps {
  photo: Photo;
  albumId: number;
  albumName: string;
  studioId?: number;
  albumCoverImageUrl?: string;
  products: Product[];
  productsLoading?: boolean;
  albumPhotos?: Photo[];
  albumPurchaseEnabled?: boolean;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

const PhotoOrderPanel: React.FC<PhotoOrderPanelProps> = ({
  photo,
  albumId,
  albumName,
  studioId,
  albumCoverImageUrl,
  products,
  productsLoading,
  albumPhotos,
  albumPurchaseEnabled = true,
  onClose,
}) => {
  const navigate = useNavigate();
  const { addToCart, addPackageToCart } = useCart();
  const { user } = useAuth();
  const packageBuilder = usePackageBuilder();

  // ── State ──────────────────────────────────────────────────────────────────
  const [recommendationFilter, setRecommendationFilter] = useState('');
  const [addingKey, setAddingKey] = useState('');
  const [addMessage, setAddMessage] = useState('');

  // Tag panel
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [tagSuggestionName, setTagSuggestionName] = useState('');
  const [tagSuggestionSubmitting, setTagSuggestionSubmitting] = useState(false);
  const [tagSuggestionMessage, setTagSuggestionMessage] = useState('');
  const [showTagWatchPrompt, setShowTagWatchPrompt] = useState(false);
  const [pendingWatchPlayerName, setPendingWatchPlayerName] = useState('');
  const [addingPendingWatchPlayer, setAddingPendingWatchPlayer] = useState(false);
  const [pendingTagSuggestionBaseMessage, setPendingTagSuggestionBaseMessage] = useState('');

  // Crop modal
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropperRef, setCropperRef] = useState<any>(null);
  const [productToCrop, setProductToCrop] = useState<ProductWithMatch | null>(null);
  const [sizeToCrop, setSizeToCrop] = useState<ProductSize | null>(null);
  const [orderRowToCrop, setOrderRowToCrop] = useState<ProductOrderRow | null>(null);
  const [packageCropSlotIndex, setPackageCropSlotIndex] = useState<number | null>(null);

  // WHCC modal
  const [showWhccPhotoModal, setShowWhccPhotoModal] = useState(false);
  const [whccProductToConfigure, setWhccProductToConfigure] = useState<ProductWithMatch | null>(null);
  const [whccSizeToConfigure, setWhccSizeToConfigure] = useState<ProductSize | null>(null);
  const [whccSelectedPhotoIds, setWhccSelectedPhotoIds] = useState<number[]>([]);
  const [whccOrderRowToConfigure, setWhccOrderRowToConfigure] = useState<ProductOrderRow | null>(null);

  // ── Pure helpers ───────────────────────────────────────────────────────────

  const getDigitalScopeValue = (product: any): 'photo' | 'album' => {
    const scope = String(product?.digitalDownloadScope || '').trim().toLowerCase();
    return scope === 'album' ? 'album' : 'photo';
  };

  const getStudioDisplayOrder = (product: any): number | null => {
    const value = Number(product?.studioDisplayOrder);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  const getDefaultSize = (product: ProductWithMatch): ProductSize | null => {
    if (product.bestSize) return product.bestSize;
    return Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes[0] : null;
  };

  const getOrderRowsForSize = (size: ProductSize): ProductOrderRow[] => {
    const variants = Array.isArray(size?.whccVariants) ? size.whccVariants : [];
    const activeVariants = variants.filter((v: any) => v?.isActive !== false);
    if (!activeVariants.length) {
      return [{ key: `size-${size.id}`, size, label: `${size?.name || 'Default'}${size?.width && size?.height ? ` (${size.width}x${size.height})` : ''}`, price: Number(size?.price || 0), variant: null }];
    }
    return activeVariants.map((variant: any, index: number) => {
      const variantPrice = Number(variant?.studioPrice ?? variant?.price ?? size?.price ?? 0) || 0;
      const variantName = String(variant?.displayName || '').trim() || `Variant ${index + 1}`;
      const sizeLabel = `${size?.name || 'Default'}${size?.width && size?.height ? ` (${size.width}x${size.height})` : ''}`;
      return {
        key: `size-${size.id}-variant-${variant?.id || variant?.localId || index}`,
        size, label: `${sizeLabel} • ${variantName}`, price: variantPrice,
        variant: {
          id: Number.isInteger(Number(variant?.id)) ? Number(variant.id) : null,
          localId: String(variant?.localId || ''),
          displayName: variantName,
          whccProductUID: Number(variant?.whccProductUID || 0) || null,
          whccProductNodeIDs: Array.isArray(variant?.whccProductNodeIDs) ? variant.whccProductNodeIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0) : [],
          whccItemAttributeUIDs: Array.isArray(variant?.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0) : [],
          isDefault: Boolean(variant?.isDefault), isActive: variant?.isActive !== false,
        },
      } as ProductOrderRow;
    });
  };

  const getOrderRowsForProduct = (product: ProductWithMatch): ProductOrderRow[] => {
    const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
    if (!sizes.length) return [];
    return sizes.flatMap((size) => getOrderRowsForSize(size));
  };

  const getSizeLabel = (size: ProductSize): string =>
    `${size?.name || 'Default'}${size?.width && size?.height ? ` (${size.width}x${size.height})` : ''}`;

  const getVariantLabel = (row?: ProductOrderRow | null): string =>
    String(row?.variant?.displayName || '').trim();

  const getRowsGroupedBySize = (product: ProductWithMatch) => {
    const rows = getOrderRowsForProduct(product);
    if (!rows.length) return [];
    const grouped = new Map<string, { key: string; size: ProductSize; sizeLabel: string; rows: ProductOrderRow[] }>();
    rows.forEach((row) => {
      const sizeLabel = getSizeLabel(row.size);
      const key = `${Number(row.size?.id || 0)}-${sizeLabel}`;
      const existing = grouped.get(key);
      if (existing) { existing.rows.push(row); return; }
      grouped.set(key, { key, size: row.size, sizeLabel, rows: [row] });
    });
    return Array.from(grouped.values());
  };

  const getDefaultOrderRow = (product: ProductWithMatch): ProductOrderRow | null => {
    const preferredSize = getDefaultSize(product);
    if (preferredSize) {
      const rows = getOrderRowsForSize(preferredSize);
      const preferred = rows.find((r) => r?.variant?.isDefault && r?.variant?.isActive) || rows.find((r) => r?.variant?.isActive) || rows[0] || null;
      if (preferred) return preferred;
    }
    const allRows = getOrderRowsForProduct(product);
    return allRows.find((r) => r?.variant?.isDefault && r?.variant?.isActive) || allRows.find((r) => r?.variant?.isActive) || allRows[0] || null;
  };

  const getCropAspectRatio = (product: ProductWithMatch | null): number => {
    if (!product || !photo) return NaN;
    const size = sizeToCrop || getDefaultSize(product);
    let width = Number(size?.width || 0);
    let height = Number(size?.height || 0);
    const photoWidth = Number(photo.width || 0);
    const photoHeight = Number(photo.height || 0);
    const photoIsLandscape = photoWidth > photoHeight;
    const sizeIsLandscape = width > height;
    if (photoIsLandscape !== sizeIsLandscape) [width, height] = [height, width];
    return width > 0 && height > 0 ? width / height : NaN;
  };

  const getSelectedSizeForCart = (product: ProductWithMatch, sizeOverride?: ProductSize | null, selectedRow?: ProductOrderRow | null): ProductSize | null => {
    const baseSize = sizeOverride || selectedRow?.size || getDefaultSize(product);
    if (!baseSize) return null;
    const selectedVariant = selectedRow?.variant || null;
    const variantAwareSize: ProductSize = { ...baseSize, ...(selectedVariant ? { whccVariants: Array.isArray(baseSize?.whccVariants) ? baseSize.whccVariants : [] } : {}) };
    if (selectedVariant) {
      const variantPrice = Number(selectedRow?.price ?? baseSize?.price ?? 0);
      return { ...variantAwareSize, price: Number.isFinite(variantPrice) ? variantPrice : Number(baseSize?.price || 0) };
    }
    if (product.isDigital) return { ...variantAwareSize, price: Number(product.price || baseSize.price || 0) };
    return variantAwareSize;
  };

  const getDigitalScope = (product: ProductWithMatch): 'photo' | 'album' => getDigitalScopeValue(product);

  const getWhccPhotoSelectionRequirements = (product: ProductWithMatch): { minPhotos: number; maxPhotos: number } => {
    const min = Number(product?.minPhotos || 1);
    const max = Number(product?.maxPhotos || min || 1);
    return { minPhotos: Math.max(1, min), maxPhotos: Math.max(min, max) };
  };

  const getWhccSelectionHint = (product: ProductWithMatch): string => {
    const { minPhotos, maxPhotos } = getWhccPhotoSelectionRequirements(product);
    if (minPhotos === maxPhotos) return `Select ${minPhotos} photo${minPhotos === 1 ? '' : 's'} to launch editor`;
    return `Select ${minPhotos}-${maxPhotos} photos to launch editor`;
  };

  const buildProductOptions = (product: ProductWithMatch, selectedSize: ProductSize, selectedRow?: ProductOrderRow | null): Record<string, any> | undefined => {
    const baseOptions = (product as any)?.productOptions && typeof (product as any).productOptions === 'object' ? { ...(product as any).productOptions } : {};
    const sizeVariants = Array.isArray(selectedSize?.whccVariants) ? selectedSize.whccVariants : [];
    const selectedVariant = selectedRow?.variant || null;
    if (!selectedVariant && sizeVariants.length === 0 && Object.keys(baseOptions).length === 0) return undefined;
    const nextOptions: Record<string, any> = { ...baseOptions, ...(sizeVariants.length > 0 ? { whccVariants: sizeVariants } : {}) };
    if (selectedVariant) {
      if (Number.isInteger(Number(selectedVariant.id)) && Number(selectedVariant.id) > 0) nextOptions.whccSelectedVariantId = Number(selectedVariant.id);
      if (String(selectedVariant.localId || '').trim()) nextOptions.whccSelectedVariantLocalId = String(selectedVariant.localId).trim();
      if (Number.isInteger(Number(selectedVariant.whccProductUID)) && Number(selectedVariant.whccProductUID) > 0) nextOptions.whccSelectedVariantProductUID = Number(selectedVariant.whccProductUID);
      if (Array.isArray(selectedVariant.whccProductNodeIDs)) nextOptions.whccSelectedVariantProductNodeIDs = selectedVariant.whccProductNodeIDs;
      if (Array.isArray(selectedVariant.whccItemAttributeUIDs)) {
        nextOptions.whccSelectedVariantItemAttributeUIDs = selectedVariant.whccItemAttributeUIDs;
        if (selectedVariant.whccItemAttributeUIDs.length >= 1) nextOptions.whccFinish = selectedVariant.whccItemAttributeUIDs[0];
      }
      if (String(selectedVariant.displayName || '').trim()) nextOptions.whccSelectedVariantDisplayName = String(selectedVariant.displayName).trim();
    }
    return nextOptions;
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const orderedProducts = useMemo((): ProductWithMatch[] => {
    const width = Number(photo.width || 0);
    const height = Number(photo.height || 0);
    const photoDims = [width, height].sort((a, b) => b - a);
    const photoRatio = width > 0 && height > 0 ? photoDims[0] / photoDims[1] : 0;

    let withMatch: ProductWithMatch[] = (products || []).map((product) => {
      const sizes = Array.isArray(product.sizes) ? product.sizes : [];
      let bestSize: ProductSize | null = null;
      let ratioDiff = Number.POSITIVE_INFINITY;
      if (photoRatio > 0) {
        sizes.forEach((size) => {
          const sw = Number(size.width || 0); const sh = Number(size.height || 0);
          if (sw > 0 && sh > 0) {
            const sizeDims = [sw, sh].sort((a, b) => b - a);
            const diff = Math.abs(sizeDims[0] / sizeDims[1] - photoRatio);
            if (diff < ratioDiff) { ratioDiff = diff; bestSize = size; }
          }
        });
      }
      return { ...product, bestSize, ratioDiff, isRecommended: Number.isFinite(ratioDiff) };
    });

    if (recommendationFilter.trim()) {
      const filter = recommendationFilter.trim().toLowerCase();
      withMatch = withMatch.filter((p) => p.name?.toLowerCase().includes(filter) || (p.bestSize && `${p.bestSize.width}x${p.bestSize.height}`.includes(filter)));
    }

    const recommendedNonDigital = withMatch.filter((p) => !p.isDigital && p.isRecommended).sort((a, b) => a.ratioDiff - b.ratioDiff);
    const recommendedCutoff = recommendedNonDigital.length > 0 ? Math.min(0.25, recommendedNonDigital[Math.min(5, recommendedNonDigital.length - 1)].ratioDiff) : 0;

    return [...withMatch].sort((a, b) => {
      if (!!a.isDigital !== !!b.isDigital) return a.isDigital ? -1 : 1;
      const aOrder = getStudioDisplayOrder(a); const bOrder = getStudioDisplayOrder(b);
      const aHas = aOrder !== null; const bHas = bOrder !== null;
      if (aHas && bHas && aOrder !== bOrder) return Number(aOrder) - Number(bOrder);
      if (aHas !== bHas) return aHas ? -1 : 1;
      const aRec = !a.isDigital && a.isRecommended && a.ratioDiff <= recommendedCutoff;
      const bRec = !b.isDigital && b.isRecommended && b.ratioDiff <= recommendedCutoff;
      if (aRec !== bRec) return aRec ? -1 : 1;
      if (aRec && bRec && a.ratioDiff !== b.ratioDiff) return a.ratioDiff - b.ratioDiff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [products, photo, recommendationFilter]);

  const studioRecommendedProductIds = useMemo(() => new Set(orderedProducts.filter((p) => !p.isDigital && !!p.studioIsRecommended).map((p) => Number(p.id)).filter((id) => Number.isInteger(id) && id > 0)), [orderedProducts]);
  const hasStudioRecommendedProducts = useMemo(() => studioRecommendedProductIds.size > 0, [studioRecommendedProductIds]);

  const recommendedProductIds = useMemo(() => {
    const nonDigital = orderedProducts.filter((p) => !p.isDigital);
    if (nonDigital.length === 0) return new Set<number>();
    if (hasStudioRecommendedProducts) return new Set<number>(studioRecommendedProductIds);
    const recommended = nonDigital.filter((p) => p.isRecommended).sort((a, b) => a.ratioDiff - b.ratioDiff);
    if (recommended.length === 0) return new Set<number>();
    const cutoff = Math.min(0.25, recommended[Math.min(5, recommended.length - 1)].ratioDiff);
    return new Set(nonDigital.filter((p) => p.isRecommended && p.ratioDiff <= cutoff).map((p) => p.id));
  }, [orderedProducts, hasStudioRecommendedProducts, studioRecommendedProductIds]);

  const productsBySection = useMemo(() => ({
    digital: orderedProducts.filter((p) => p.isDigital && getDigitalScopeValue(p) !== 'album'),
    recommended: orderedProducts.filter((p) => !p.isDigital && recommendedProductIds.has(p.id)),
    remaining: orderedProducts.filter((p) => !p.isDigital && !recommendedProductIds.has(p.id)),
  }), [orderedProducts, recommendedProductIds]);

  const albumPurchaseProductsLocal = useMemo(
    () => (products || []).filter((p) => !!p.isDigital && getDigitalScopeValue(p) === 'album').map((p) => ({ ...p, ratioDiff: 0, isRecommended: false, studioIsRecommended: false }) as ProductWithMatch),
    [products]
  );

  const allProductsGrouped = useMemo(() => {
    const grouped: Record<string, ProductWithMatch[]> = {};
    orderedProducts.forEach((p) => { const cat = String(p.category || 'Other'); if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(p); });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => ({ category, items: [...items] }));
  }, [orderedProducts]);

  const recommendedGrouped = useMemo(() => {
    const grouped = new Map<string, Map<string, ProductWithMatch[]>>();

    const getProductGroupName = (rawName: string): string => {
      return String(rawName || '').trim().replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?$/i, '').trim() || 'Product';
    };

    const getPrimarySize = (p: ProductWithMatch): ProductSize | null => {
      if (p.bestSize) return p.bestSize;
      return Array.isArray(p.sizes) && p.sizes.length > 0 ? p.sizes[0] : null;
    };

    const getDim = (v: string) => { const m = String(v || '').match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i); return m ? { width: Number(m[1]) || 0, height: Number(m[2]) || 0 } : { width: 0, height: 0 }; };

    const compareBySizeAsc = (a: ProductWithMatch, b: ProductWithMatch): number => {
      const as = getPrimarySize(a); const bs = getPrimarySize(b);
      const ad = { width: Number(as?.width || 0) || getDim(as?.name || a.name).width, height: Number(as?.height || 0) || getDim(as?.name || a.name).height };
      const bd = { width: Number(bs?.width || 0) || getDim(bs?.name || b.name).width, height: Number(bs?.height || 0) || getDim(bs?.name || b.name).height };
      const aA = (ad.width > 0 && ad.height > 0) ? ad.width * ad.height : Infinity;
      const bA = (bd.width > 0 && bd.height > 0) ? bd.width * bd.height : Infinity;
      if (aA !== bA) return aA - bA;
      if (ad.width !== bd.width) return ad.width - bd.width;
      const ap = Number(as?.price || a.price || 0); const bp = Number(bs?.price || b.price || 0);
      if (ap !== bp) return ap - bp;
      return String(a.name || '').localeCompare(String(b.name || ''));
    };

    const selectBestItems = (items: ProductWithMatch[]): ProductWithMatch[] => {
      if (items.length <= 1) return items;
      const ranked = [...items].sort((a, b) => {
        const aF = Number.isFinite(a.ratioDiff); const bF = Number.isFinite(b.ratioDiff);
        if (aF !== bF) return aF ? -1 : 1;
        if (aF && bF && a.ratioDiff !== b.ratioDiff) return a.ratioDiff - b.ratioDiff;
        const aO = getStudioDisplayOrder(a); const bO = getStudioDisplayOrder(b);
        const aH = aO !== null; const bH = bO !== null;
        if (aH && bH && aO !== bO) return Number(aO) - Number(bO);
        if (aH !== bH) return aH ? -1 : 1;
        return compareBySizeAsc(a, b);
      });
      const best = ranked[0];
      if (!best || !Number.isFinite(best.ratioDiff)) return ranked.slice(0, Math.min(3, ranked.length));
      const threshold = Number(best.ratioDiff) + 0.06;
      const shortlisted = ranked.filter((i) => Number.isFinite(i.ratioDiff) && i.ratioDiff <= threshold);
      return (shortlisted.length > 0 ? shortlisted : ranked).slice(0, 3);
    };

    productsBySection.recommended.forEach((product) => {
      const category = String(product.category || 'Other');
      const productName = getProductGroupName(String(product.name || 'Product'));
      if (!grouped.has(category)) grouped.set(category, new Map<string, ProductWithMatch[]>());
      const byName = grouped.get(category)!;
      if (!byName.has(productName)) byName.set(productName, []);
      byName.get(productName)!.push(product);
    });

    const entries = Array.from(grouped.entries());
    const partnerIdx = entries.findIndex(([cat]) => cat.toLowerCase().includes('partner photo fulfillment'));
    if (partnerIdx > 0) { const [p] = entries.splice(partnerIdx, 1); entries.unshift(p); }
    return entries.map(([category, byName]) => ({
      category,
      products: Array.from(byName.entries()).map(([name, items]) => ({ name, items: selectBestItems(items).sort(compareBySizeAsc) })),
    }));
  }, [productsBySection.recommended]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const openWhccPhotoSelection = (product: ProductWithMatch, selectedSize: ProductSize, selectedRow?: ProductOrderRow | null, initialPhotoId?: number) => {
    const initialSelection = initialPhotoId ? [initialPhotoId] : [];
    setWhccProductToConfigure(product);
    setWhccSizeToConfigure(selectedSize);
    setWhccOrderRowToConfigure(selectedRow || null);
    setWhccSelectedPhotoIds(initialSelection);
    setShowWhccPhotoModal(true);
  };

  const handleWhccPhotoToggle = (photoId: number) => {
    const id = Number(photoId || 0);
    if (!Number.isInteger(id) || id <= 0 || !whccProductToConfigure) return;
    const { maxPhotos } = getWhccPhotoSelectionRequirements(whccProductToConfigure);
    setWhccSelectedPhotoIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= maxPhotos) return prev;
      return [...prev, id];
    });
  };

  const closeWhccPhotoModal = () => { setShowWhccPhotoModal(false); setWhccProductToConfigure(null); setWhccSizeToConfigure(null); setWhccOrderRowToConfigure(null); setWhccSelectedPhotoIds([]); };

  const handleConfirmWhccPhotoSelection = async () => {
    const product = whccProductToConfigure; const selectedSize = whccSizeToConfigure;
    if (!product || !selectedSize) return;
    const key = `${product.id}-${selectedSize.id}`;
    const { minPhotos, maxPhotos } = getWhccPhotoSelectionRequirements(product);
    const selectedIds = [...new Set(whccSelectedPhotoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (selectedIds.length < minPhotos) { setAddMessage(`Select at least ${minPhotos} photo${minPhotos === 1 ? '' : 's'} to continue.`); return; }
    if (selectedIds.length > maxPhotos) { setAddMessage(`Select no more than ${maxPhotos} photo${maxPhotos === 1 ? '' : 's'} for this product.`); return; }

    const photosSource = albumPhotos || [photo];
    const selectedPhotos = selectedIds.map((id) => photosSource.find((p) => Number(p.id) === id) || null).filter((p): p is Photo => !!p);
    if (!selectedPhotos.length) { setAddMessage('Selected photos could not be loaded from this album.'); return; }

    setAddingKey(key); setAddMessage('');
    closeWhccPhotoModal();
    try {
      const primaryPhoto = selectedPhotos[0];
      await addToCart(primaryPhoto, { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 }, product, selectedSize, 1, selectedIds,
        selectedPhotos.map((p, idx) => ({ photo: p, cropData: { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 }, position: idx + 1 })),
        { albumId, albumName, albumCoverImageUrl, productOptions: buildProductOptions(product, selectedSize, whccOrderRowToConfigure) }
      );
      const url = new URL(window.location.href);
      url.searchParams.set('launchWhccEditor', '1');
      url.searchParams.set('productId', String(product.id));
      url.searchParams.set('productSizeId', String(selectedSize.id));
      url.searchParams.set('photoId', String(primaryPhoto.id));
      navigate(url.pathname + '?' + url.searchParams.toString(), { replace: false });
    } catch { setAddMessage('Failed to add item to cart.'); } finally { setAddingKey(''); }
  };

  const handleAddToCart = async (product: ProductWithMatch, sizeOverride?: ProductSize | null, selectedRow?: ProductOrderRow | null) => {
    const digitalScope = product.isDigital ? getDigitalScope(product) : 'photo';
    const isAlbumDigital = product.isDigital && digitalScope === 'album';
    const requiresWhcc = !!product.requiresWhccEditor && !product.isDigital;

    if (isAlbumDigital && !albumPurchaseEnabled) { setAddMessage('Album purchase is disabled for this album.'); return; }

    const selectedSize = getSelectedSizeForCart(product, sizeOverride, selectedRow);
    if (!selectedSize) { setAddMessage('This product has no available size.'); return; }

    const productOptions = buildProductOptions(product, selectedSize, selectedRow);
    const rowKey = selectedRow?.key || `${product.id}-${selectedSize.id}`;

    if (requiresWhcc) {
      setAddMessage('');
      openWhccPhotoSelection(product, selectedSize, selectedRow, photo.id);
      return;
    }

    if (product.isDigital) {
      setAddingKey(rowKey); setAddMessage('');
      try {
        const photosSource = albumPhotos || [photo];
        const allAlbumPhotoIds = digitalScope === 'album' ? photosSource.map((p) => Number(p.id)).filter((id) => Number.isInteger(id) && id > 0) : [photo.id];
        const effectiveIds = allAlbumPhotoIds.length ? allAlbumPhotoIds : [photo.id];
        const primaryPhoto = photosSource.find((p) => p.id === effectiveIds[0]) || photo;
        await addToCart(primaryPhoto, { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 }, product, selectedSize, 1, effectiveIds,
          [{ photo: primaryPhoto, cropData: { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 }, position: 1 }],
          { albumId, albumName, albumCoverImageUrl, digitalDownloadScope: digitalScope, productOptions }
        );
        setAddMessage(digitalScope === 'album' ? `${product.name} (full album) added to cart.` : `${product.name} added to cart.`);
      } catch { setAddMessage('Failed to add item to cart.'); } finally { setAddingKey(''); }
      return;
    }

    // Physical print — open crop modal
    setProductToCrop(product); setSizeToCrop(selectedSize); setOrderRowToCrop(selectedRow || null); setShowCropModal(true);
  };

  const handleCropConfirm = async () => {
    if (!productToCrop) return;
    const size = sizeToCrop || getDefaultSize(productToCrop);
    if (!size) { setAddMessage('This product has no available size.'); setShowCropModal(false); return; }

    const key = orderRowToCrop?.key || `${productToCrop.id}-${size.id}`;
    setAddingKey(key); setAddMessage('');
    try {
      const cropper = cropperRef?.cropper || cropperRef;
      const cropData = cropper?.getData ? cropper.getData() : null;
      let cropValues;
      const originalWidth = Number(photo.width || photo.metadata?.width || 0);
      const originalHeight = Number(photo.height || photo.metadata?.height || 0);
      if (cropData) {
        const displayedWidth = cropper.getImageData().naturalWidth;
        const displayedHeight = cropper.getImageData().naturalHeight;
        const scaleX = originalWidth > 0 && displayedWidth > 0 ? originalWidth / displayedWidth : 1;
        const scaleY = originalHeight > 0 && displayedHeight > 0 ? originalHeight / displayedHeight : 1;
        cropValues = formatCropData({ x: cropData.x * scaleX, y: cropData.y * scaleY, width: cropData.width * scaleX, height: cropData.height * scaleY, rotate: typeof cropData.rotate === 'number' ? cropData.rotate : 0, scaleX: typeof cropData.scaleX === 'number' ? cropData.scaleX : 1, scaleY: typeof cropData.scaleY === 'number' ? cropData.scaleY : 1 });
      } else {
        let cropAspect = 1;
        if (size.width && size.height) cropAspect = Number(size.width) / Number(size.height);
        const imageAspect = originalWidth > 0 && originalHeight > 0 ? originalWidth / originalHeight : 1;
        let cW: number, cH: number, cX: number, cY: number;
        if (imageAspect > cropAspect) { cH = originalHeight; cW = Math.round(cH * cropAspect); cX = Math.round((originalWidth - cW) / 2); cY = 0; }
        else { cW = originalWidth; cH = Math.round(cW / cropAspect); cX = 0; cY = Math.round((originalHeight - cH) / 2); }
        cropValues = { x: cX, y: cY, width: cW, height: cH, rotate: 0, scaleX: 1, scaleY: 1 };
      }

      if (packageCropSlotIndex !== null) {
        packageBuilder.fillCurrentSlot(photo, cropValues);
        setAddMessage('Photo added to package!');
        setShowCropModal(false); setProductToCrop(null); setSizeToCrop(null); setOrderRowToCrop(null); setPackageCropSlotIndex(null); setCropperRef(null);
      } else {
        await addToCart(photo, cropValues, productToCrop, size, 1, undefined, undefined,
          { albumId, albumName, albumCoverImageUrl, productOptions: buildProductOptions(productToCrop, size, orderRowToCrop) }
        );
        setAddMessage(`${productToCrop.name} added to cart.`);
        setShowCropModal(false); setProductToCrop(null); setSizeToCrop(null); setOrderRowToCrop(null); setOrderRowToCrop(null); setCropperRef(null);
      }
    } catch { setAddMessage('Failed to add item to cart.'); } finally { setAddingKey(''); }
  };

  const handleCancelCrop = () => { setShowCropModal(false); setProductToCrop(null); setSizeToCrop(null); setOrderRowToCrop(null); setCropperRef(null); };
  const handleResetCrop = () => { const c = cropperRef?.cropper || cropperRef; if (c?.reset) c.reset(); };

  const handleUsePhotoForPackage = () => {
    if (!packageBuilder.currentSlot) return;
    const slot = packageBuilder.currentSlot;
    if (slot.isDigital) { packageBuilder.fillCurrentSlot(photo, { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 }); return; }
    const product = (products || []).find((p: Product) => p.id === slot.productId);
    if (!product) return;
    const size = (product.sizes || []).find((s: ProductSize) => s.id === slot.productSizeId);
    if (!size) return;
    const mockProduct: ProductWithMatch = { ...product, bestSize: size, ratioDiff: 0, isRecommended: true };
    setProductToCrop(mockProduct); setSizeToCrop(size); setOrderRowToCrop(null); setPackageCropSlotIndex(packageBuilder.currentSlotIndex); setShowCropModal(true);
  };

  const handleSubmitTagSuggestion = async () => {
    if (!user) { setTagSuggestionMessage('Please log in to suggest a player tag.'); navigate('/login'); return; }
    const playerName = tagSuggestionName.trim();
    if (!playerName) { setTagSuggestionMessage('Please enter a player name first.'); return; }
    try {
      setTagSuggestionSubmitting(true); setTagSuggestionMessage('');
      const response = await photoService.submitPlayerTagSuggestion(photo.id, playerName, user.email);
      const baseMessage = response?.message || 'Tag suggestion submitted.';
      setTagSuggestionMessage(baseMessage); setPendingTagSuggestionBaseMessage(baseMessage);
      setPendingWatchPlayerName(playerName); setShowTagWatchPrompt(true); setTagSuggestionName('');
    } catch (error: any) {
      setTagSuggestionMessage(error?.response?.data?.error || 'Failed to submit tag suggestion.');
    } finally { setTagSuggestionSubmitting(false); }
  };

  const handleSkipAddToWatchlist = () => { setShowTagWatchPrompt(false); setPendingWatchPlayerName(''); setPendingTagSuggestionBaseMessage(''); };

  const handleConfirmAddToWatchlist = async () => {
    if (!pendingWatchPlayerName) { handleSkipAddToWatchlist(); return; }
    try {
      setAddingPendingWatchPlayer(true);
      await playerWatchlistService.addPlayer(pendingWatchPlayerName, null, studioId);
      setTagSuggestionMessage(`${pendingTagSuggestionBaseMessage || 'Tag suggestion submitted.'} Added to your watch list.`);
    } catch (watchErr: any) {
      const status = Number(watchErr?.response?.status || 0);
      if (status === 409) setTagSuggestionMessage(`${pendingTagSuggestionBaseMessage || 'Tag suggestion submitted.'} This player is already in your watch list.`);
      else setTagSuggestionMessage(`${pendingTagSuggestionBaseMessage || 'Tag suggestion submitted.'} Could not add to watch list right now.`);
    } finally { setAddingPendingWatchPlayer(false); setShowTagWatchPrompt(false); setPendingWatchPlayerName(''); setPendingTagSuggestionBaseMessage(''); }
  };

  // ── Sub-components ─────────────────────────────────────────────────────────

  const ProductImageHover = ({ imageUrl, name }: { imageUrl?: string | null; name: string }) => {
    if (!imageUrl) return null;
    return (
      <span className="product-img-wrap">
        <img src={imageUrl} alt={name} className="product-img-thumb" />
        <span className="product-img-tooltip"><img src={imageUrl} alt={name} /></span>
      </span>
    );
  };

  // ── Shared product row renderers ───────────────────────────────────────────

  const renderSizeGroups = (product: ProductWithMatch) => {
    const sizeGroups = getRowsGroupedBySize(product);
    if (!sizeGroups.length) return <div style={{ color: '#aaa', fontSize: 12 }}>No size available</div>;
    return sizeGroups.map((group) => {
      const hasChildVariants = group.rows.length > 1 || group.rows.some((row) => !!getVariantLabel(row));
      if (!hasChildVariants) {
        const row = group.rows[0]; const rowKey = row.key;
        return (
          <div key={group.key} className="order-product-row" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', border: '1px solid #1f1c33', borderRadius: 6, padding: '6px 8px', background: '#29264a', gap: 10, flexWrap: 'wrap' }}>
            <div className="order-size-cell" style={{ fontSize: 12, color: '#bbb', flex: '1 1 100%' }}>
              <div>{group.sizeLabel}</div>
              {!!product.requiresWhccEditor && <div style={{ fontSize: 11, color: '#9fb2ea', marginTop: 4 }}>{getWhccSelectionHint(product)}</div>}
            </div>
            <div className="order-price-cell" style={{ minWidth: 90, textAlign: 'right', fontWeight: 700, flex: '0 0 auto', width: 'auto' }}>
              ${Number(row?.price || 0).toFixed(2)}
            </div>
            <button
              className="btn btn-primary btn-sm order-add-cart-btn"
              disabled={!row.size || addingKey === rowKey}
              onClick={() => handleAddToCart(product, row.size, row)}
              style={{ fontSize: 'clamp(13px,3vw,16px)', padding: 'clamp(7px,2vw,12px) clamp(18px,5vw,28px)', borderRadius: 24, minWidth: 110, width: 'auto', whiteSpace: 'nowrap', fontWeight: 700, boxShadow: '0 2px 8px 0 rgba(123,97,255,0.10)', marginLeft: 4, letterSpacing: 0.1, flex: '1 1 100%', maxWidth: '100%', marginTop: 8 }}
            >
              {addingKey === rowKey ? 'Adding...' : (product.requiresWhccEditor ? 'Select Photos' : 'Add to Cart')}
            </button>
          </div>
        );
      }
      return (
        <div key={group.key} className="order-product-row order-size-group" style={{ border: '1px solid #1f1c33', borderRadius: 6, padding: '6px 8px', background: '#29264a', display: 'grid', gap: 6 }}>
          <div className="order-size-group-label" style={{ fontSize: 12, color: '#aaa', fontWeight: 700 }}>{group.sizeLabel}</div>
          <div className="order-size-group-children" style={{ display: 'grid', gap: 6, paddingLeft: 10, borderLeft: '2px solid #3c3568' }}>
            {group.rows.map((row) => {
              const rowKey = row.key;
              return (
                <div key={rowKey} className="order-variant-row">
                  <div className="order-variant-name" style={{ fontSize: 12, color: '#c7c1f6' }}>{getVariantLabel(row) || 'Default'}</div>
                  <div className="order-variant-price" style={{ minWidth: 90, textAlign: 'right', fontWeight: 700 }}>${Number(row?.price || 0).toFixed(2)}</div>
                  <button
                    className="btn btn-primary btn-sm order-variant-add-btn"
                    disabled={!row.size || addingKey === rowKey}
                    onClick={() => handleAddToCart(product, row.size, row)}
                    style={{ minWidth: 110, fontWeight: 700 }}
                  >
                    {addingKey === rowKey ? 'Adding...' : (product.requiresWhccEditor ? 'Select Photos' : 'Add to Cart')}
                  </button>
                </div>
              );
            })}
          </div>
          {!!product.requiresWhccEditor && <div style={{ fontSize: 11, color: '#9fb2ea' }}>{getWhccSelectionHint(product)}</div>}
        </div>
      );
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Inline panel ── */}
      <div style={{ gridColumn: '1 / -1', margin: '0 0 24px 0', border: '2px solid #7b61ff', borderRadius: 12, padding: 18, background: '#18162a', boxShadow: '0 4px 24px 0 rgba(123,97,255,0.10)', width: '100%', maxWidth: '100%', boxSizing: 'border-box', zIndex: 2, display: 'block', position: 'relative' }}>
        <button aria-label="Close order panel" onClick={onClose} style={{ position: 'absolute', top: 10, right: 14, background: 'transparent', border: 'none', color: '#b9aaff', fontSize: 22, fontWeight: 700, cursor: 'pointer', zIndex: 10, lineHeight: 1, padding: 0 }}>×</button>

        <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, color: '#fff', textAlign: 'center' }}>Order this photo</h3>

        {/* Photo preview */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ width: '100%', maxWidth: 400, background: '#18162a', borderRadius: 10, boxShadow: '0 2px 12px 0 rgba(123,97,255,0.10)', overflow: 'hidden' }}>
            <WatermarkedImage src={`/api/photos/${photo.id}/asset?variant=thumbnail`} alt={photo.fileName} fill={false} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 500 }} studioId={studioId} lazy={false} />
          </div>
        </div>

        {/* Package builder CTA */}
        {packageBuilder.isActive && packageBuilder.currentSlot && (
          <div style={{ margin: '0 auto 16px auto', maxWidth: 540, border: '2px solid #7b61ff', borderRadius: 12, padding: '12px 14px', background: 'rgba(123,97,255,0.1)', boxShadow: '0 0 20px rgba(123,97,255,0.18)' }}>
            <div style={{ fontSize: 11, color: '#8d81ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>📦 {packageBuilder.activePackage?.name}</div>
            <div style={{ fontSize: 13, color: '#c7bcff', marginBottom: 10 }}>
              Slot {packageBuilder.currentSlotIndex + 1} of {packageBuilder.slots.length}:{' '}
              <strong style={{ color: '#fff' }}>{packageBuilder.currentSlot.sizeName ? `${packageBuilder.currentSlot.sizeName} ${packageBuilder.currentSlot.productName}` : packageBuilder.currentSlot.productName}</strong>
            </div>
            <button className="btn btn-primary" onClick={handleUsePhotoForPackage} style={{ width: '100%', fontWeight: 700, fontSize: 15, padding: '10px 20px', borderRadius: 12, marginBottom: 8 }}>
              {packageBuilder.currentSlot.isDigital ? '✓ ' : ''}Use this photo for {packageBuilder.currentSlot.sizeName || packageBuilder.currentSlot.productName}{!packageBuilder.currentSlot.isDigital && ' →'}
            </button>
            {packageBuilder.slots.length > 1 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {packageBuilder.slots.map((slot, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 999, background: slot.filled ? 'rgba(121,210,121,0.13)' : i === packageBuilder.currentSlotIndex ? 'rgba(123,97,255,0.22)' : 'rgba(255,255,255,0.04)', border: `1px solid ${slot.filled ? '#79d279' : i === packageBuilder.currentSlotIndex ? '#7b61ff' : '#3a3656'}`, color: slot.filled ? '#79d279' : i === packageBuilder.currentSlotIndex ? '#c7bcff' : '#555', cursor: 'default' }}>
                    {slot.filled ? '✓ ' : i === packageBuilder.currentSlotIndex ? '→ ' : ''}{slot.sizeName || slot.productName}
                  </span>
                ))}
              </div>
            )}
            <div style={{ borderTop: '1px solid rgba(123,97,255,0.2)', paddingTop: 8, fontSize: 12, color: '#555', textAlign: 'center' }}>— or order individually below —</div>
          </div>
        )}

        {/* Tag panel */}
        <div style={{ margin: '0 auto 16px auto', maxWidth: 540, border: '1px solid #3a3656', borderRadius: 10, padding: 12, background: '#141320' }}>
          <button onClick={() => setTagPanelOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, gap: 8 }}>
            <span style={{ fontWeight: 700, color: '#ddd7ff', fontSize: 13 }}>🏷️ Help tag this photo</span>
            <span style={{ color: '#6b6b80', fontSize: 11, display: 'inline-block', transform: tagPanelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}>▼</span>
          </button>
          {tagPanelOpen && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>Know the player in this photo? Log in and submit a name for studio review.</div>
              {!user && <div style={{ marginBottom: 10, fontSize: 12, color: '#cbd5e1' }}>You must be logged in to suggest tags.{' '}<Link to="/login" style={{ color: '#9f7aea', fontWeight: 700 }}>Log in</Link></div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="text" value={tagSuggestionName} onChange={(e) => setTagSuggestionName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitTagSuggestion(); } }} disabled={!user} placeholder="Enter player name" style={{ flex: '1 1 200px', padding: '8px 10px', borderRadius: 6, border: '1px solid #3a3656', background: '#10101a', color: '#fff', fontSize: 13 }} />
                <button type="button" className="btn btn-primary" disabled={!user || tagSuggestionSubmitting} onClick={handleSubmitTagSuggestion} style={{ fontSize: 13, padding: '8px 14px' }}>
                  {tagSuggestionSubmitting ? 'Submitting...' : 'Submit Tag'}
                </button>
              </div>
              {!!tagSuggestionMessage && <div style={{ marginTop: 8, fontSize: 12, color: tagSuggestionMessage.toLowerCase().includes('failed') || tagSuggestionMessage.toLowerCase().includes('error') ? '#ff9a9a' : '#79d279' }}>{tagSuggestionMessage}</div>}
            </div>
          )}
        </div>

        {addMessage && <div style={{ marginBottom: 8, color: addMessage.includes('Failed') ? '#ff9a9a' : '#79d279', textAlign: 'center' }}>{addMessage}</div>}

        {/* Product filter */}
        <div style={{ marginBottom: 12 }}>
          <input type="text" placeholder="Filter products by name or size..." value={recommendationFilter} onChange={e => setRecommendationFilter(e.target.value)} style={{ padding: 8, width: '100%', borderRadius: 6, border: '1px solid #3a3656', background: '#141320', color: '#fff' }} />
        </div>

        {/* Products */}
        {productsLoading ? (
          <div style={{ color: '#999', textAlign: 'center' }}>Loading products...</div>
        ) : orderedProducts.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center' }}>No products available for this album.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Digital */}
            {productsBySection.digital.length > 0 && (
              <div>
                <h4 style={{ marginTop: 0, marginBottom: 10, color: '#7b61ff', fontSize: 14, fontWeight: 600 }}>Digital</h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  {productsBySection.digital.map((product) => (
                    <div key={product.id} style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <strong>{product.name}</strong>
                        <span className="badge">Digital</span>
                        {getDigitalScope(product) === 'album' && <span className="badge" style={{ background: '#2f5dff' }}>Full Album</span>}
                      </div>
                      {renderSizeGroups(product)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended */}
            {productsBySection.recommended.length > 0 && (
              <div>
                <h4 style={{ marginTop: 0, marginBottom: 10, color: '#7b61ff', fontSize: 14, fontWeight: 600 }}>Recommended</h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  {recommendedGrouped.map(({ category, products: rProducts }) => (
                    <details key={category} open style={{ border: '1px solid #232036', borderRadius: 8, padding: '6px 8px', background: 'rgba(123,97,255,0.05)' }}>
                      <summary style={{ cursor: 'pointer', fontSize: 13, color: '#8d81ff', fontWeight: 700 }}>{category}</summary>
                      <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                        {rProducts.map(({ name, items }) => (
                          <div key={`${category}-${name}`} style={{ border: '1px solid #232036', borderRadius: 6, padding: '6px 8px', background: '#232036' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                              <ProductImageHover imageUrl={items[0]?.imageUrl} name={name} />
                              <strong>{name}</strong>
                              <span className="badge" style={{ background: '#2e2a52' }}>Recommended</span>
                            </div>
                            <div style={{ display: 'grid', gap: 6 }}>
                              {items.map((product) => (
                                <div key={product.id}>
                                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{product.name}</div>
                                  <div style={{ display: 'grid', gap: 6 }}>{renderSizeGroups(product)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* All Products */}
            {allProductsGrouped.length > 0 && (
              <div>
                <details style={{ border: '1px solid #232036', borderRadius: 8, padding: '10px 12px', background: '#232036' }}>
                  <summary style={{ cursor: 'pointer', color: '#7b61ff', fontSize: 14, fontWeight: 700 }}>All Products</summary>
                  <div style={{ display: 'grid', gap: 14, marginTop: 10 }}>
                    {allProductsGrouped.map(({ category, items }) => (
                      <details key={category} style={{ border: '1px solid #232036', borderRadius: 8, padding: '10px 12px', background: '#232036' }}>
                        <summary style={{ cursor: 'pointer', fontSize: 13, color: '#8d81ff', fontWeight: 700 }}>{category}</summary>
                        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                          {items.map((product) => (
                            <div key={product.id}>
                              <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ProductImageHover imageUrl={product.imageUrl} name={product.name} />
                                {product.name}
                              </div>
                              <div style={{ display: 'grid', gap: 6 }}>{renderSizeGroups(product)}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Watchlist prompt modal ── */}
      {showTagWatchPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#1a1a24', borderRadius: 12, border: '1px solid #2a2740', maxWidth: 520, width: '100%', padding: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10, color: '#fff' }}>Add to watch list?</h3>
            <p style={{ marginTop: 0, marginBottom: 14, color: '#cfc9f7', lineHeight: 1.45 }}>
              You suggested <strong>{pendingWatchPlayerName}</strong>. Do you also want to add this player to your watch list to get notified when new photos are added?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={handleSkipAddToWatchlist} disabled={addingPendingWatchPlayer}>Not now</button>
              <button className="btn btn-primary" onClick={handleConfirmAddToWatchlist} disabled={addingPendingWatchPlayer}>{addingPendingWatchPlayer ? 'Adding...' : 'Add to Watch List'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Crop modal ── */}
      {showCropModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1a24', borderRadius: 12, border: '1px solid #2a2740', maxWidth: 600, maxHeight: 600, overflow: 'auto', padding: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Crop photo for {productToCrop?.name}</h3>
            <div style={{ marginBottom: 16, maxHeight: 400 }}>
              <Cropper
                ref={setCropperRef}
                src={`/api/photos/${photo.id}/asset?variant=thumbnail`}
                crossOrigin="anonymous"
                style={{ maxHeight: 400, width: '100%' }}
                aspectRatio={getCropAspectRatio(productToCrop)}
                viewMode={1} guides responsive autoCropArea={1} minContainerHeight={200} minContainerWidth={200}
                onInitialized={cropper => {
                  setCropperRef(cropper);
                  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
                  const cartItem = cart.find((item: any) => item.photoId === photo.id && item.productId === productToCrop?.id && item.productSizeId === sizeToCrop?.id);
                  if (cartItem && cartItem.cropData) {
                    const checkAndSet = () => {
                      const imgData = cropper.getImageData();
                      const dW = imgData.naturalWidth; const dH = imgData.naturalHeight;
                      const oW = Number(photo.width || photo.metadata?.width || 0);
                      const oH = Number(photo.height || photo.metadata?.height || 0);
                      if (dW > 0 && dH > 0 && oW > 0 && oH > 0) {
                        cropper.setData({ x: cartItem.cropData.x * (dW / oW), y: cartItem.cropData.y * (dH / oH), width: cartItem.cropData.width * (dW / oW), height: cartItem.cropData.height * (dH / oH) });
                      } else { setTimeout(checkAndSet, 50); }
                    };
                    checkAndSet();
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={handleResetCrop}>Reset Crop</button>
              <button className="btn btn-secondary" onClick={handleCancelCrop}>Cancel</button>
              <button className="btn btn-primary" disabled={addingKey !== ''} onClick={handleCropConfirm}>{addingKey !== '' ? 'Adding...' : 'Add to Cart'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── WHCC photo selector modal ── */}
      {showWhccPhotoModal && whccProductToConfigure && whccSizeToConfigure && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#1a1a24', borderRadius: 12, border: '1px solid #2a2740', maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
            {(() => {
              const { minPhotos, maxPhotos } = getWhccPhotoSelectionRequirements(whccProductToConfigure);
              const selectedCount = whccSelectedPhotoIds.length;
              const minLabel = minPhotos === maxPhotos ? `${minPhotos}` : `${minPhotos}-${maxPhotos}`;
              const canContinue = selectedCount >= minPhotos && selectedCount <= maxPhotos;
              const photosSource = albumPhotos || [photo];
              return (
                <>
                  <h3 style={{ marginTop: 0, marginBottom: 8 }}>Select photos for {whccProductToConfigure.name}</h3>
                  <div style={{ fontSize: 13, color: '#a9a6c7', marginBottom: 12 }}>Choose {minLabel} photo{minPhotos === 1 && maxPhotos === 1 ? '' : 's'} from this album before launching the editor.</div>
                  <div style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #3a3656', borderRadius: 999, padding: '6px 10px', background: '#141320', color: '#ddd' }}>
                    <span>Selected:</span><strong>{selectedCount}</strong><span>of</span><strong>{minLabel}</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                    {photosSource.map((p) => {
                      const pId = Number(p.id);
                      const isSel = whccSelectedPhotoIds.includes(pId);
                      const disableUnchecked = !isSel && whccSelectedPhotoIds.length >= maxPhotos;
                      return (
                        <button key={p.id} type="button" onClick={() => handleWhccPhotoToggle(pId)} disabled={disableUnchecked}
                          style={{ border: isSel ? '2px solid #7b61ff' : '1px solid #2e2b46', borderRadius: 8, padding: 6, background: isSel ? 'rgba(123,97,255,0.12)' : '#161526', cursor: disableUnchecked ? 'not-allowed' : 'pointer', opacity: disableUnchecked ? 0.6 : 1, textAlign: 'left', color: '#fff' }}>
                          <img src={`/api/photos/${p.id}/asset?variant=thumbnail`} alt={p.fileName} style={{ width: '100%', height: 88, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                          <div style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.fileName || `Photo ${p.id}`}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={closeWhccPhotoModal}>Cancel</button>
                    <button className="btn btn-primary" disabled={!canContinue || !!addingKey} onClick={handleConfirmWhccPhotoSelection}>
                      {addingKey ? 'Adding...' : `Continue with ${selectedCount} photo${selectedCount === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
};

export default PhotoOrderPanel;

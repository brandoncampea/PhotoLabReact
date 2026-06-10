import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatCropData } from '../utils/formatCropData';
import { analyticsService } from '../services/analyticsService';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import WatermarkedImage from '../components/WatermarkedImage';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import api from '../services/api';
import { photoService } from '../services/photoService';
import { productService } from '../services/productService';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { Album, Photo, Product, ProductSize } from '../types';
import './AlbumDetails.css';
import { Helmet } from 'react-helmet-async';


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

const AlbumDetails: React.FC = () => {
    // Helper to get the album cover image URL for Open Graph
    const getOgImageUrl = () => {
      // Prefer explicit coverImageUrl, fallback to first photo thumbnail
      if (album && (album as any).coverImageUrl) {
        return String((album as any).coverImageUrl);
      }
      if (photos && photos.length > 0) {
        // Use the first photo's thumbnail as fallback
        return `/api/photos/${photos[0].id}/asset?variant=thumbnail`;
      }
      return undefined;
    };
  // Utility must be defined before use
  const normalizeMetadata = (metadata: unknown): Record<string, any> => {
    if (!metadata) return {};
    if (typeof metadata === 'string') {
      try {
        const parsed = JSON.parse(metadata);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    if (typeof metadata === 'object') return metadata as Record<string, any>;
    return {};
  };

  // Recommendation filter for product recommendations
  const [recommendationFilter, setRecommendationFilter] = useState('');
  const { albumId, studioSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingKey, setAddingKey] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [tagSuggestionName, setTagSuggestionName] = useState('');
  const [tagSuggestionSubmitting, setTagSuggestionSubmitting] = useState(false);
  const [tagSuggestionMessage, setTagSuggestionMessage] = useState('');
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropperRef, setCropperRef] = useState<any>(null);
  const [productToCrop, setProductToCrop] = useState<ProductWithMatch | null>(null);
  const [sizeToCrop, setSizeToCrop] = useState<ProductSize | null>(null);
  const [showWhccPhotoModal, setShowWhccPhotoModal] = useState(false);
  const [whccProductToConfigure, setWhccProductToConfigure] = useState<ProductWithMatch | null>(null);
  const [whccSizeToConfigure, setWhccSizeToConfigure] = useState<ProductSize | null>(null);
  const [whccOrderRowToConfigure, setWhccOrderRowToConfigure] = useState<ProductOrderRow | null>(null);
  const [whccSelectedPhotoIds, setWhccSelectedPhotoIds] = useState<number[]>([]);
  const [photoQuery, setPhotoQuery] = useState('');
  const [metadataFilter, setMetadataFilter] = useState<'all' | 'camera' | 'iso' | 'aperture' | 'shutterSpeed' | 'focalLength' | 'dateTaken' | 'any'>('all');
  const { addToCart } = useCart();
  const autoBuyAttemptedRef = useRef(false);
  const [orderRowToCrop, setOrderRowToCrop] = useState<ProductOrderRow | null>(null);






  const selectedPhotoId = Number(searchParams.get('photo') || 0);


  const studioSlugFromQuery = searchParams.get('studioSlug');
  // Navigation logic
  // If viewing a photo, 'Back to Album' returns to album grid (removes ?photo=...)
  // If viewing album grid, 'Back to Albums' returns to studio's album list
  const backToAlbumsHref = studioSlug
    ? `/albums?studioSlug=${encodeURIComponent(studioSlug)}`
    : studioSlugFromQuery
    ? `/albums?studioSlug=${encodeURIComponent(studioSlugFromQuery)}`
    : '/albums';

  // When viewing a photo, go back to album grid (same path, no ?photo=...)
  const backToAlbumHref = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('photo');
    window.location.href = url.pathname + url.search;
  };


  const filteredPhotos = useMemo(() => {
    const query = photoQuery.trim().toLowerCase();
    if (!query) return photos;

    return photos.filter((photo) => {
      const fileName = String(photo.fileName || '').toLowerCase();
      const playerNames = String((photo as any).playerNames || '').toLowerCase();
      const metadata = normalizeMetadata((photo as any).metadata);

      if (metadataFilter === 'all') {
        if (fileName.includes(query)) return true;
        if (playerNames.includes(query)) return true;
        return Object.values(metadata).some((value) => String(value || '').toLowerCase().includes(query));
      }

      if (metadataFilter === 'any') {
        if (playerNames.includes(query)) return true;
        return Object.values(metadata).some((value) => String(value || '').toLowerCase().includes(query));
      }

      if (metadataFilter === 'camera') {
        const make = String(metadata.cameraMake || '').toLowerCase();
        const model = String(metadata.cameraModel || '').toLowerCase();
        return make.includes(query) || model.includes(query);
      }

      if (metadataFilter === 'iso') {
        return String(metadata.iso || '').toLowerCase().includes(query);
      }

      if (metadataFilter === 'aperture') {
        return String(metadata.aperture || '').toLowerCase().includes(query);
      }

      if (metadataFilter === 'shutterSpeed') {
        return String(metadata.shutterSpeed || '').toLowerCase().includes(query);
      }

      if (metadataFilter === 'focalLength') {
        return String(metadata.focalLength || '').toLowerCase().includes(query);
      }

      if (metadataFilter === 'dateTaken') {
        return String(metadata.dateTaken || '').toLowerCase().includes(query);
      }

      return false;
    });
  }, [photos, photoQuery, metadataFilter]);

  const selectedPhoto = useMemo(
    () => filteredPhotos.find((p) => p.id === selectedPhotoId) || null,
    [filteredPhotos, selectedPhotoId]
  );

  useEffect(() => {
    setTagSuggestionName('');
    setTagSuggestionMessage('');
  }, [selectedPhotoId]);

  useEffect(() => {
    const id = Number(albumId);
    if (!Number.isInteger(id) || id <= 0) {
      setError('Invalid album id');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [albumRes, photosRes, productsRes] = await Promise.all([
          api.get<Album>(`/albums/${id}`),
          photoService.getPhotosByAlbum(id),
          productService.getActiveProducts(id),
        ]);
        setAlbum(albumRes.data);
        setPhotos(Array.isArray(photosRes) ? photosRes : []);
        setProducts(Array.isArray(productsRes) ? productsRes : []);
        // Track album view for analytics
        analyticsService.trackAlbumView(
          id,
          albumRes.data?.name || '',
          Number((albumRes.data as any)?.studioId || 0) || undefined
        );
      } catch {
        setError('Failed to load album');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [albumId]);
  // Track photo view for analytics when selectedPhoto changes
  useEffect(() => {
    if (selectedPhoto && album) {
      analyticsService.trackPhotoView(selectedPhoto.id, selectedPhoto.fileName, album.id, album.name, Number((album as any)?.studioId || 0) || undefined);
    }
  }, [selectedPhoto, album]);

  const handleThumbnailSelect = (photo: Photo) => {
    if (!album) return;
    const studioId = Number((album as any)?.studioId || 0) || undefined;
    analyticsService.trackPhotoThumbnailClick(photo.id, photo.fileName, album.id, album.name, studioId);

    const url = new URL(window.location.href);
    url.searchParams.set('photo', String(photo.id));
    navigate(url.pathname + url.search, { replace: false });
  };

  const handleSubmitTagSuggestion = async () => {
    if (!selectedPhoto) return;
    if (!user) {
      setTagSuggestionMessage('Please log in to suggest a player tag.');
      navigate('/login');
      return;
    }
    const playerName = tagSuggestionName.trim();
    if (!playerName) {
      setTagSuggestionMessage('Please enter a player name first.');
      return;
    }

    try {
      setTagSuggestionSubmitting(true);
      setTagSuggestionMessage('');
      const response = await photoService.submitPlayerTagSuggestion(selectedPhoto.id, playerName, user.email);
      setTagSuggestionMessage(response?.message || 'Tag suggestion submitted.');
      setTagSuggestionName('');
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to submit tag suggestion.';
      setTagSuggestionMessage(message);
    } finally {
      setTagSuggestionSubmitting(false);
    }
  };

  const getDigitalScopeValue = (product: any): 'photo' | 'album' => {
    const scope = String(product?.digitalDownloadScope || '').trim().toLowerCase();
    return scope === 'album' ? 'album' : 'photo';
  };

  const getStudioDisplayOrder = (product: any): number | null => {
    const value = Number(product?.studioDisplayOrder);
    return Number.isFinite(value) ? value : null;
  };


  const orderedProducts = useMemo((): ProductWithMatch[] => {
    if (!selectedPhoto) return [];

    const width = Number(selectedPhoto.width || 0);
    const height = Number(selectedPhoto.height || 0);
    const photoDims = [width, height].sort((a, b) => b - a); // [larger, smaller]
    const photoRatio = width > 0 && height > 0 ? photoDims[0] / photoDims[1] : 0;

    let withMatch: ProductWithMatch[] = (products || []).map((product) => {
      const sizes = Array.isArray(product.sizes) ? product.sizes : [];
      let bestSize: ProductSize | null = null;
      let ratioDiff = Number.POSITIVE_INFINITY;

      if (photoRatio > 0) {
        sizes.forEach((size) => {
          const sw = Number(size.width || 0);
          const sh = Number(size.height || 0);
          if (sw > 0 && sh > 0) {
            const sizeDims = [sw, sh].sort((a, b) => b - a); // [larger, smaller]
            const sizeRatio = sizeDims[0] / sizeDims[1];
            const diff = Math.abs(sizeRatio - photoRatio);
            if (diff < ratioDiff) {
              ratioDiff = diff;
              bestSize = size;
            }
          }
        });
      }

      return {
        ...product,
        bestSize,
        ratioDiff,
        isRecommended: Number.isFinite(ratioDiff),
      };
    });

    // Filter by recommendationFilter (product name or size)
    if (recommendationFilter.trim()) {
      const filter = recommendationFilter.trim().toLowerCase();
      withMatch = withMatch.filter((product) => {
        const nameMatch = product.name?.toLowerCase().includes(filter);
        const sizeMatch = product.bestSize && `${product.bestSize.width}x${product.bestSize.height}`.includes(filter);
        return nameMatch || sizeMatch;
      });
    }

    const recommendedNonDigital = withMatch
      .filter((p) => !p.isDigital && p.isRecommended)
      .sort((a, b) => a.ratioDiff - b.ratioDiff);

    const recommendedCutoff = recommendedNonDigital.length > 0
      ? Math.min(0.25, recommendedNonDigital[Math.min(5, recommendedNonDigital.length - 1)].ratioDiff)
      : 0;

    return [...withMatch].sort((a, b) => {
      // 1) Digital products always first
      if (!!a.isDigital !== !!b.isDigital) return a.isDigital ? -1 : 1;

      // 2) Studio-configured display order overrides heuristic ordering
      const aOrder = getStudioDisplayOrder(a);
      const bOrder = getStudioDisplayOrder(b);
      const aHasOrder = aOrder !== null;
      const bHasOrder = bOrder !== null;
      if (aHasOrder && bHasOrder && aOrder !== bOrder) return Number(aOrder) - Number(bOrder);
      if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

      // 3) For non-digital, recommended products first (closest sizes)
      const aRec = !a.isDigital && a.isRecommended && a.ratioDiff <= recommendedCutoff;
      const bRec = !b.isDigital && b.isRecommended && b.ratioDiff <= recommendedCutoff;
      if (aRec !== bRec) return aRec ? -1 : 1;

      // 4) Within recommended, closest ratio first
      if (aRec && bRec && a.ratioDiff !== b.ratioDiff) return a.ratioDiff - b.ratioDiff;

      // 5) Then the rest alphabetically
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [products, selectedPhoto, recommendationFilter]);

  const studioRecommendedProductIds = useMemo(() => {
    return new Set(
      orderedProducts
        .filter((p) => !p.isDigital && !!p.studioIsRecommended)
        .map((p) => Number(p.id))
        .filter((id) => Number.isInteger(id) && id > 0)
    );
  }, [orderedProducts]);

  const hasStudioRecommendedProducts = useMemo(
    () => studioRecommendedProductIds.size > 0,
    [studioRecommendedProductIds]
  );

  const recommendedProductIds = useMemo(() => {
    const nonDigital = orderedProducts.filter((p) => !p.isDigital);
    if (nonDigital.length === 0) return new Set<number>();

    // If the studio explicitly configured recommendations, only use those.
    if (hasStudioRecommendedProducts) {
      return new Set<number>(studioRecommendedProductIds);
    }

    const recommended = nonDigital.filter((p) => p.isRecommended).sort((a, b) => a.ratioDiff - b.ratioDiff);
    if (recommended.length === 0) return new Set<number>();
    const cutoff = Math.min(0.25, recommended[Math.min(5, recommended.length - 1)].ratioDiff);
    const ratioBased = nonDigital
      .filter((p) => p.isRecommended && p.ratioDiff <= cutoff)
      .map((p) => p.id);
    return new Set(ratioBased);
  }, [orderedProducts, hasStudioRecommendedProducts, studioRecommendedProductIds]);

  const productsBySection = useMemo(() => {
    const albumPurchaseEnabled = album?.albumPurchaseEnabled !== false;
    const digital = orderedProducts.filter((p) => p.isDigital && (albumPurchaseEnabled || getDigitalScopeValue(p) !== 'album'));
    const recommended = orderedProducts.filter((p) => !p.isDigital && recommendedProductIds.has(p.id));
    const remaining = orderedProducts.filter((p) => !p.isDigital && !recommendedProductIds.has(p.id));
    return { digital, recommended, remaining };
  }, [orderedProducts, recommendedProductIds, album]);

  const albumPurchaseProducts = useMemo(
    () => (orderedProducts || []).filter((p) => !!p.isDigital && getDigitalScopeValue(p) === 'album'),
    [orderedProducts]
  );

  const recommendedGrouped = useMemo(() => {
    const grouped = new Map<string, Map<string, ProductWithMatch[]>>();

    const getProductGroupName = (rawName: string): string => {
      const name = String(rawName || '').trim();
      // Collapse size-suffixed product names (e.g., "Framed Print 12x16" -> "Framed Print")
      return name
        .replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?$/i, '')
        .trim() || 'Product';
    };

    const getPrimarySize = (product: ProductWithMatch): ProductSize | null => {
      if (product.bestSize) return product.bestSize;
      return Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes[0] : null;
    };

    const getDimensionFromName = (value: string): { width: number; height: number } => {
      const match = String(value || '').match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i);
      if (!match) return { width: 0, height: 0 };
      return { width: Number(match[1]) || 0, height: Number(match[2]) || 0 };
    };

    const compareBySizeAsc = (a: ProductWithMatch, b: ProductWithMatch): number => {
      const aSize = getPrimarySize(a);
      const bSize = getPrimarySize(b);

      const aDim = {
        width: Number(aSize?.width || 0) || getDimensionFromName(aSize?.name || a.name).width,
        height: Number(aSize?.height || 0) || getDimensionFromName(aSize?.name || a.name).height,
      };
      const bDim = {
        width: Number(bSize?.width || 0) || getDimensionFromName(bSize?.name || b.name).width,
        height: Number(bSize?.height || 0) || getDimensionFromName(bSize?.name || b.name).height,
      };

      const aArea = (aDim.width > 0 && aDim.height > 0) ? (aDim.width * aDim.height) : Number.POSITIVE_INFINITY;
      const bArea = (bDim.width > 0 && bDim.height > 0) ? (bDim.width * bDim.height) : Number.POSITIVE_INFINITY;

      if (aArea !== bArea) return aArea - bArea;
      if (aDim.width !== bDim.width) return aDim.width - bDim.width;
      if (aDim.height !== bDim.height) return aDim.height - bDim.height;

      const aPrice = Number(aSize?.price || a.price || 0);
      const bPrice = Number(bSize?.price || b.price || 0);
      if (aPrice !== bPrice) return aPrice - bPrice;

      return String(a.name || '').localeCompare(String(b.name || ''));
    };

    const selectBestItems = (items: ProductWithMatch[]): ProductWithMatch[] => {
      if (items.length <= 1) return items;

      const ranked = [...items].sort((a, b) => {
        const aFinite = Number.isFinite(a.ratioDiff);
        const bFinite = Number.isFinite(b.ratioDiff);
        if (aFinite !== bFinite) return aFinite ? -1 : 1;
        if (aFinite && bFinite && a.ratioDiff !== b.ratioDiff) return a.ratioDiff - b.ratioDiff;

        const aOrder = getStudioDisplayOrder(a);
        const bOrder = getStudioDisplayOrder(b);
        const aHasOrder = aOrder !== null;
        const bHasOrder = bOrder !== null;
        if (aHasOrder && bHasOrder && aOrder !== bOrder) return Number(aOrder) - Number(bOrder);
        if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

        return compareBySizeAsc(a, b);
      });

      const best = ranked[0];
      if (!best || !Number.isFinite(best.ratioDiff)) {
        return ranked.slice(0, Math.min(3, ranked.length));
      }

      // Keep the closest matching variants, capped for concise UX.
      const threshold = Number(best.ratioDiff) + 0.06;
      const shortlisted = ranked.filter((item) => Number.isFinite(item.ratioDiff) && item.ratioDiff <= threshold);
      return (shortlisted.length > 0 ? shortlisted : ranked).slice(0, 3);
    };

    productsBySection.recommended.forEach((product) => {
      const category = String(product.category || 'Other');
      const productName = getProductGroupName(String(product.name || 'Product'));
      if (!grouped.has(category)) grouped.set(category, new Map<string, ProductWithMatch[]>());
      const productsByName = grouped.get(category)!;
      if (!productsByName.has(productName)) productsByName.set(productName, []);
      productsByName.get(productName)!.push(product);
    });

    // Preserve explicit product order from `productsBySection.recommended`.
    // Only bump Partner Photo Fulfillment to top for category ordering.
    const groupedEntries = Array.from(grouped.entries());
    const partnerIdx = groupedEntries.findIndex(([cat]) => cat.toLowerCase().includes('partner photo fulfillment'));
    if (partnerIdx > 0) {
      const [partner] = groupedEntries.splice(partnerIdx, 1);
      groupedEntries.unshift(partner);
    }
    return groupedEntries.map(([category, productsByName]) => ({
      category,
      products: Array.from(productsByName.entries())
        .map(([name, items]) => ({ name, items: selectBestItems(items).sort(compareBySizeAsc) })),
    }));
  }, [productsBySection.recommended]);

  const allProductsGrouped = useMemo(() => {
    const grouped: Record<string, ProductWithMatch[]> = {};
    orderedProducts.forEach((product) => {
      const category = String(product.category || 'Other');
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(product);
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, items]) => ({
        category,
        items: [...items],
      }));
  }, [orderedProducts]);

  const getDefaultSize = (product: ProductWithMatch): ProductSize | null => {
    if (product.bestSize) return product.bestSize;
    return Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes[0] : null;
  };

  const getOrderRowsForSize = (size: ProductSize): ProductOrderRow[] => {
    const variants = Array.isArray(size?.whccVariants) ? size.whccVariants : [];
    const activeVariants = variants.filter((variant: any) => variant?.isActive !== false);
    if (!activeVariants.length) {
      return [{
        key: `size-${size.id}`,
        size,
        label: `${size?.name || 'Default'}${size?.width && size?.height ? ` (${size.width}x${size.height})` : ''}`,
        price: Number(size?.price || 0),
        variant: null,
      }];
    }

    return activeVariants.map((variant: any, index: number) => {
      const variantPrice = Number(
        variant?.studioPrice ??
        variant?.price ??
        size?.price ??
        0
      ) || 0;
      const variantName = String(variant?.displayName || '').trim() || `Variant ${index + 1}`;
      const sizeLabel = `${size?.name || 'Default'}${size?.width && size?.height ? ` (${size.width}x${size.height})` : ''}`;
      return {
        key: `size-${size.id}-variant-${variant?.id || variant?.localId || index}`,
        size,
        label: `${sizeLabel} • ${variantName}`,
        price: variantPrice,
        variant: {
          id: Number.isInteger(Number(variant?.id)) ? Number(variant.id) : null,
          localId: String(variant?.localId || ''),
          displayName: variantName,
          whccProductUID: Number(variant?.whccProductUID || 0) || null,
          whccProductNodeIDs: Array.isArray(variant?.whccProductNodeIDs) ? variant.whccProductNodeIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0) : [],
          whccItemAttributeUIDs: Array.isArray(variant?.whccItemAttributeUIDs) ? variant.whccItemAttributeUIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0) : [],
          isDefault: Boolean(variant?.isDefault),
          isActive: variant?.isActive !== false,
        },
      } as ProductOrderRow;
    });
  };

  const getOrderRowsForProduct = (product: ProductWithMatch): ProductOrderRow[] => {
    const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
    if (!sizes.length) return [];
    return sizes.flatMap((size) => getOrderRowsForSize(size));
  };

  const getSizeLabel = (size: ProductSize): string => {
    return `${size?.name || 'Default'}${size?.width && size?.height ? ` (${size.width}x${size.height})` : ''}`;
  };

  const getVariantLabel = (row?: ProductOrderRow | null): string => {
    return String(row?.variant?.displayName || '').trim();
  };

  const getRowsGroupedBySize = (product: ProductWithMatch): Array<{ key: string; size: ProductSize; sizeLabel: string; rows: ProductOrderRow[] }> => {
    const rows = getOrderRowsForProduct(product);
    if (!rows.length) return [];

    const grouped = new Map<string, { key: string; size: ProductSize; sizeLabel: string; rows: ProductOrderRow[] }>();
    rows.forEach((row) => {
      const sizeLabel = getSizeLabel(row.size);
      const key = `${Number(row.size?.id || 0)}-${sizeLabel}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.rows.push(row);
        return;
      }
      grouped.set(key, {
        key,
        size: row.size,
        sizeLabel,
        rows: [row],
      });
    });

    return Array.from(grouped.values());
  };

  const getDefaultOrderRow = (product: ProductWithMatch): ProductOrderRow | null => {
    const preferredSize = getDefaultSize(product);
    if (preferredSize) {
      const rows = getOrderRowsForSize(preferredSize);
      const preferred = rows.find((row) => row?.variant?.isDefault && row?.variant?.isActive)
        || rows.find((row) => row?.variant?.isActive)
        || rows[0]
        || null;
      if (preferred) return preferred;
    }

    const allRows = getOrderRowsForProduct(product);
    return allRows.find((row) => row?.variant?.isDefault && row?.variant?.isActive)
      || allRows.find((row) => row?.variant?.isActive)
      || allRows[0]
      || null;
  };

  const getCropAspectRatio = (product: ProductWithMatch | null): number => {
    if (!product || !selectedPhoto) return NaN;
    const size = sizeToCrop || getDefaultSize(product);
    let width = Number(size?.width || 0);
    let height = Number(size?.height || 0);
    const photoWidth = Number(selectedPhoto.width || 0);
    const photoHeight = Number(selectedPhoto.height || 0);
    const photoIsLandscape = photoWidth > photoHeight;
    const sizeIsLandscape = width > height;
    // If photo and product size orientations don't match, swap
    if (photoIsLandscape !== sizeIsLandscape) {
      [width, height] = [height, width];
    }
    if (width > 0 && height > 0) {
      return width / height;
    }
    return NaN;
  };

  const getSelectedSizeForCart = (product: ProductWithMatch, sizeOverride?: ProductSize | null, selectedRow?: ProductOrderRow | null): ProductSize | null => {
    const baseSize = sizeOverride || selectedRow?.size || getDefaultSize(product);
    if (!baseSize) return null;

    const selectedVariant = selectedRow?.variant || null;
    const variantAwareSize: ProductSize = {
      ...baseSize,
      ...(selectedVariant
        ? {
            whccVariants: Array.isArray(baseSize?.whccVariants) ? baseSize.whccVariants : [],
          }
        : {}),
    };

    if (selectedVariant) {
      const variantPrice = Number(selectedRow?.price ?? baseSize?.price ?? 0);
      return {
        ...variantAwareSize,
        price: Number.isFinite(variantPrice) ? variantPrice : Number(baseSize?.price || 0),
      };
    }

    if (product.isDigital) {
      return {
        ...variantAwareSize,
        price: Number(product.price || baseSize.price || 0),
      };
    }

    return variantAwareSize;
  };

  const getDigitalScope = (product: ProductWithMatch): 'photo' | 'album' => {
    return getDigitalScopeValue(product);
  };

  const getWhccPhotoSelectionRequirements = (product: ProductWithMatch): { minPhotos: number; maxPhotos: number } => {
    const rawMin = Number(product.minPhotos || 1);
    const minPhotos = Number.isFinite(rawMin) && rawMin > 0 ? Math.max(1, Math.floor(rawMin)) : 1;

    const rawMax = Number(product.maxPhotos || minPhotos);
    const normalizedMax = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : minPhotos;
    const maxPhotos = Math.max(minPhotos, normalizedMax);

    return {
      minPhotos,
      maxPhotos,
    };
  };

  const getWhccSelectionHint = (product: ProductWithMatch): string => {
    const { minPhotos, maxPhotos } = getWhccPhotoSelectionRequirements(product);
    if (minPhotos === maxPhotos) {
      return `Editor requires ${minPhotos} album photo${minPhotos === 1 ? '' : 's'}.`;
    }
    return `Editor requires ${minPhotos}-${maxPhotos} album photos.`;
  };

  const openWhccPhotoSelection = (
    product: ProductWithMatch,
    selectedSize: ProductSize,
    selectedRow?: ProductOrderRow | null,
    preferredPhotoId?: number
  ) => {
    const { minPhotos, maxPhotos } = getWhccPhotoSelectionRequirements(product);
    const validAlbumPhotoIds = photos
      .map((p) => Number(p.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const fallbackId = validAlbumPhotoIds[0] || 0;
    const initialId = Number(preferredPhotoId || selectedPhoto?.id || fallbackId || 0);

    const seedIds = initialId > 0 ? [initialId] : [];
    const padded = [...seedIds];
    for (const id of validAlbumPhotoIds) {
      if (padded.length >= minPhotos) break;
      if (!padded.includes(id)) padded.push(id);
    }

    const initialSelection = padded.slice(0, maxPhotos);

    setWhccProductToConfigure(product);
    setWhccSizeToConfigure(selectedSize);
    setWhccOrderRowToConfigure(selectedRow || null);
    setWhccSelectedPhotoIds(initialSelection);
    setShowWhccPhotoModal(true);
  };

  const buildProductOptions = (product: ProductWithMatch, selectedSize: ProductSize, selectedRow?: ProductOrderRow | null): Record<string, any> | undefined => {
    const baseOptions = (product as any)?.productOptions && typeof (product as any).productOptions === 'object'
      ? { ...(product as any).productOptions }
      : {};

    const sizeVariants = Array.isArray(selectedSize?.whccVariants) ? selectedSize.whccVariants : [];
    const selectedVariant = selectedRow?.variant || null;
    const hasVariantData = !!selectedVariant || sizeVariants.length > 0;

    if (!hasVariantData && Object.keys(baseOptions).length === 0) {
      return undefined;
    }

    const nextOptions: Record<string, any> = {
      ...baseOptions,
      ...(sizeVariants.length > 0 ? { whccVariants: sizeVariants } : {}),
    };

    if (selectedVariant) {
      if (Number.isInteger(Number(selectedVariant.id)) && Number(selectedVariant.id) > 0) {
        nextOptions.whccSelectedVariantId = Number(selectedVariant.id);
      }
      if (String(selectedVariant.localId || '').trim()) {
        nextOptions.whccSelectedVariantLocalId = String(selectedVariant.localId).trim();
      }
      if (Number.isInteger(Number(selectedVariant.whccProductUID)) && Number(selectedVariant.whccProductUID) > 0) {
        nextOptions.whccSelectedVariantProductUID = Number(selectedVariant.whccProductUID);
      }
      if (Array.isArray(selectedVariant.whccProductNodeIDs)) {
        nextOptions.whccSelectedVariantProductNodeIDs = selectedVariant.whccProductNodeIDs;
      }
      if (Array.isArray(selectedVariant.whccItemAttributeUIDs)) {
        nextOptions.whccSelectedVariantItemAttributeUIDs = selectedVariant.whccItemAttributeUIDs;
        // If there is a single finish attribute UID, set it as whccFinish for WHCC order mapping
        if (selectedVariant.whccItemAttributeUIDs.length === 1) {
          nextOptions.whccFinish = selectedVariant.whccItemAttributeUIDs[0];
        }
        // If there are multiple, prefer the first (or enhance logic as needed)
        else if (selectedVariant.whccItemAttributeUIDs.length > 1) {
          nextOptions.whccFinish = selectedVariant.whccItemAttributeUIDs[0];
        }
      }
      if (String(selectedVariant.displayName || '').trim()) {
        nextOptions.whccSelectedVariantDisplayName = String(selectedVariant.displayName).trim();
      }
    }

    return nextOptions;
  };

  const handleWhccPhotoToggle = (photoId: number) => {
    const id = Number(photoId || 0);
    if (!Number.isInteger(id) || id <= 0 || !whccProductToConfigure) return;

    const { maxPhotos } = getWhccPhotoSelectionRequirements(whccProductToConfigure);
    setWhccSelectedPhotoIds((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      if (prev.length >= maxPhotos) return prev;
      return [...prev, id];
    });
  };

  const closeWhccPhotoModal = () => {
    setShowWhccPhotoModal(false);
    setWhccProductToConfigure(null);
    setWhccSizeToConfigure(null);
    setWhccOrderRowToConfigure(null);
    setWhccSelectedPhotoIds([]);
  };

  const handleConfirmWhccPhotoSelection = async () => {
    const product = whccProductToConfigure;
    const selectedSize = whccSizeToConfigure;
    if (!product || !selectedSize) return;

    const key = `${product.id}-${selectedSize.id}`;
    const { minPhotos, maxPhotos } = getWhccPhotoSelectionRequirements(product);
    const selectedIds = [...new Set(whccSelectedPhotoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];

    if (selectedIds.length < minPhotos) {
      setAddMessage(`Select at least ${minPhotos} photo${minPhotos === 1 ? '' : 's'} to continue.`);
      return;
    }

    if (selectedIds.length > maxPhotos) {
      setAddMessage(`Select no more than ${maxPhotos} photo${maxPhotos === 1 ? '' : 's'} for this product.`);
      return;
    }

    const selectedPhotos = selectedIds
      .map((id) => photos.find((p) => Number(p.id) === id) || null)
      .filter((p): p is Photo => !!p);

    if (!selectedPhotos.length) {
      setAddMessage('Selected photos could not be loaded from this album.');
      return;
    }

    setAddingKey(key);
    setAddMessage('');

    try {
      const primaryPhoto = selectedPhotos[0];
      await addToCart(
        primaryPhoto,
        { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 },
        product,
        selectedSize,
        1,
        selectedIds,
        selectedPhotos.map((photo, idx) => ({
          photo,
          cropData: { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 },
          position: idx + 1,
        })),
        {
          albumId: Number(album?.id || 0) || undefined,
          albumName: String(album?.name || '').trim() || undefined,
          albumCoverImageUrl: String((album as any)?.coverImageUrl || '').trim() || undefined,
          productOptions: buildProductOptions(product, selectedSize, whccOrderRowToConfigure),
        }
      );

      const params = new URLSearchParams({
        launchWhccEditor: '1',
        productId: String(product.id),
        productSizeId: String(selectedSize.id),
        photoId: String(primaryPhoto.id),
      });

      closeWhccPhotoModal();
      setAddMessage(`Redirecting to editor for ${product.name}...`);
      navigate(`/cart?${params.toString()}`);
    } catch {
      setAddMessage('Failed to start editor workflow.');
    } finally {
      setAddingKey('');
    }
  };

  const handleAddToCart = async (product: ProductWithMatch, sizeOverride?: ProductSize | null, selectedRow?: ProductOrderRow | null) => {
    const digitalScope = product.isDigital ? getDigitalScope(product) : 'photo';
    const isAlbumDigitalPurchase = product.isDigital && digitalScope === 'album';
    const requiresWhccEditor = !!product.requiresWhccEditor && !product.isDigital;
    const albumPurchaseEnabled = album?.albumPurchaseEnabled !== false;
    const fallbackPhoto = photos[0] || null;
    const effectiveSelectedPhoto = selectedPhoto || (isAlbumDigitalPurchase ? fallbackPhoto : null);

    if (isAlbumDigitalPurchase && !albumPurchaseEnabled) {
      setAddMessage('Album purchase is disabled for this album.');
      return;
    }

    if (!effectiveSelectedPhoto) {
      setAddMessage(isAlbumDigitalPurchase ? 'No photos available in this album yet.' : 'Select a photo to order this product.');
      return;
    }

    const selectedSize = getSelectedSizeForCart(product, sizeOverride, selectedRow);
    if (!selectedSize) {
      setAddMessage('This product has no available size.');
      return;
    }

    const productOptions = buildProductOptions(product, selectedSize, selectedRow);
    const rowKey = selectedRow?.key || `${product.id}-${selectedSize.id}`;

    if (requiresWhccEditor) {
      setAddMessage('');
      openWhccPhotoSelection(product, selectedSize, selectedRow, effectiveSelectedPhoto?.id);
      return;
    }

    // Digital products do not require crop workflow.
    if (product.isDigital) {
      setAddingKey(rowKey);
      setAddMessage('');
      try {
        const allAlbumPhotoIds = digitalScope === 'album'
          ? photos.map((p) => Number(p.id)).filter((id) => Number.isInteger(id) && id > 0)
          : [effectiveSelectedPhoto.id];
        const effectivePhotoIds = allAlbumPhotoIds.length ? allAlbumPhotoIds : [effectiveSelectedPhoto.id];
        const primaryPhotoId = effectivePhotoIds[0] || effectiveSelectedPhoto.id;
        const primaryPhoto = photos.find((p) => p.id === primaryPhotoId) || effectiveSelectedPhoto;
        await addToCart(
          primaryPhoto,
          { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 },
          product,
          selectedSize,
          1,
          effectivePhotoIds,
          [{ photo: primaryPhoto, cropData: { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 }, position: 1 }],
          {
            albumId: Number(album?.id || 0) || undefined,
            albumName: String(album?.name || '').trim() || undefined,
            albumCoverImageUrl: String((album as any)?.coverImageUrl || '').trim() || undefined,
            digitalDownloadScope: digitalScope,
            productOptions,
          }
        );
        setAddMessage(digitalScope === 'album' ? `${product.name} (full album) added to cart.` : `${product.name} added to cart.`);
      } catch {
        setAddMessage('Failed to add item to cart.');
      } finally {
        setAddingKey('');
      }
      return;
    }

    setProductToCrop(product);
    setSizeToCrop(selectedSize);
    setOrderRowToCrop(selectedRow || null);
    setShowCropModal(true);
  };

  useEffect(() => {
    const shouldAutoBuyAlbum = String(searchParams.get('buyAlbum') || '').trim() === '1';
    if (!shouldAutoBuyAlbum) return;
    if (autoBuyAttemptedRef.current) return;
    if (!albumPurchaseProducts.length) return;

    autoBuyAttemptedRef.current = true;
    const firstProduct = albumPurchaseProducts[0] as ProductWithMatch;
    void handleAddToCart(firstProduct);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('buyAlbum');
    const query = nextParams.toString();
    navigate(`${window.location.pathname}${query ? `?${query}` : ''}`, { replace: true });
  }, [albumPurchaseProducts, navigate, searchParams]);

  const handleCropConfirm = async () => {
    if (!selectedPhoto || !productToCrop) return;
    const size = sizeToCrop || getDefaultSize(productToCrop);
    if (!size) {
      setAddMessage('This product has no available size.');
      setShowCropModal(false);
      return;
    }

    const key = orderRowToCrop?.key || `${productToCrop.id}-${size.id}`;
    setAddingKey(key);
    setAddMessage('');
    try {
      const cropper = cropperRef?.cropper || cropperRef;
      const cropData = cropper?.getData ? cropper.getData() : null;
      let cropValues;
      const originalWidth = Number(selectedPhoto.width || selectedPhoto.metadata?.width || 0);
      const originalHeight = Number(selectedPhoto.height || selectedPhoto.metadata?.height || 0);
      if (cropData && selectedPhoto) {
        // Get the displayed (thumbnail) image size from the cropper
        const displayedWidth = cropper.getImageData().naturalWidth;
        const displayedHeight = cropper.getImageData().naturalHeight;
        // Calculate scale factors
        const scaleX = originalWidth > 0 && displayedWidth > 0 ? originalWidth / displayedWidth : 1;
        const scaleY = originalHeight > 0 && displayedHeight > 0 ? originalHeight / displayedHeight : 1;
        cropValues = formatCropData({
          x: cropData.x * scaleX,
          y: cropData.y * scaleY,
          width: cropData.width * scaleX,
          height: cropData.height * scaleY,
          rotate: typeof cropData.rotate === 'number' ? cropData.rotate : 0,
          scaleX: typeof cropData.scaleX === 'number' ? cropData.scaleX : 1,
          scaleY: typeof cropData.scaleY === 'number' ? cropData.scaleY : 1,
        });
        console.log('[AlbumDetails] handleCropConfirm - cropperData:', cropData, 'displayed:', displayedWidth, displayedHeight, 'original:', originalWidth, originalHeight, 'scale:', scaleX, scaleY, 'final crop:', cropValues);
      } else {
        // Default to centered crop with correct aspect ratio for the product size
        let cropAspect = 1;
        if (size && size.width && size.height) {
          cropAspect = Number(size.width) / Number(size.height);
        }
        function getCenteredCrop(naturalWidth: number, naturalHeight: number, targetAspect: number) {
          const imageAspect = naturalWidth / naturalHeight;
          let cropWidth, cropHeight, cropX, cropY;
          if (imageAspect > targetAspect) {
            // Image is wider than target aspect: crop width
            cropHeight = naturalHeight;
            cropWidth = Math.round(cropHeight * targetAspect);
            cropX = Math.round((naturalWidth - cropWidth) / 2);
            cropY = 0;
          } else {
            // Image is taller than target aspect: crop height
            cropWidth = naturalWidth;
            cropHeight = Math.round(cropWidth / targetAspect);
            cropX = 0;
            cropY = Math.round((naturalHeight - cropHeight) / 2);
          }
          return { x: cropX, y: cropY, width: cropWidth, height: cropHeight, rotate: 0, scaleX: 1, scaleY: 1 };
        }
        cropValues = getCenteredCrop(originalWidth, originalHeight, cropAspect);
        console.log('[AlbumDetails] handleCropConfirm - no cropData or selectedPhoto, using centered aspect crop', cropValues);
      }

      await addToCart(
        selectedPhoto,
        cropValues,
        productToCrop,
        size,
        1,
        undefined,
        undefined,
        {
          albumId: Number(album?.id || 0) || undefined,
          albumName: String(album?.name || '').trim() || undefined,
          albumCoverImageUrl: String((album as any)?.coverImageUrl || '').trim() || undefined,
          productOptions: buildProductOptions(productToCrop, size, orderRowToCrop),
        }
      );
      setAddMessage(`${productToCrop.name} added to cart.`);
      setShowCropModal(false);
      setProductToCrop(null);
      setSizeToCrop(null);
      setOrderRowToCrop(null);
      setCropperRef(null);
    } catch {
      setAddMessage('Failed to add item to cart.');
    } finally {
      setAddingKey('');
    }
  };

  const handleCancelCrop = () => {
    setShowCropModal(false);
    setProductToCrop(null);
    setSizeToCrop(null);
    setOrderRowToCrop(null);
    setCropperRef(null);
  };

  const handleResetCrop = () => {
    const cropper = cropperRef?.cropper || cropperRef;
    if (cropper?.reset) {
      cropper.reset();
    }
  };


  if (loading) return <div className="loading">Loading album...</div>;
  if (error) return <div className="albums-error-message">{error}</div>;
  if (!album) return <div className="albums-error-message">Album not found</div>;

  // Open Graph meta tags for album sharing
  const ogImageUrl = getOgImageUrl();

  // Album description for meta tag
  const ogDescription = album?.description || 'View this photo album.';

  // Album title for meta tag
  const ogTitle = album?.name ? `Photo Album: ${album.name}` : 'Photo Album';

  return (
    <>
      <Helmet>
        <title>{ogTitle}</title>
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        {ogImageUrl && <meta property="og:image" content={ogImageUrl} />}
        {ogImageUrl && <meta name="twitter:image" content={ogImageUrl} />}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={window.location.href} />
      </Helmet>
      <div className="main-content dark-bg albums-full-height">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {selectedPhoto ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                marginBottom: 0,
                textDecoration: 'none',
                borderRadius: 999,
                padding: '8px 14px',
                border: '1px solid #7b61ff',
                background: 'rgba(123, 97, 255, 0.08)',
                color: '#c7bcff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={backToAlbumHref}
            >
              ← Back to Album
            </button>
          ) : (
            <Link
              to={backToAlbumsHref}
              className="btn btn-secondary"
              style={{
                marginBottom: 0,
                textDecoration: 'none',
                borderRadius: 999,
                padding: '8px 14px',
                border: '1px solid #7b61ff',
                background: 'rgba(123, 97, 255, 0.08)',
                color: '#c7bcff',
                fontWeight: 600,
              }}
            >
              ← Back to Albums
            </Link>
          )}
        </div>
        <h1 className="gradient-text" style={{ marginBottom: 6, lineHeight: 1.15 }}>{album.name}</h1>
        {Array.isArray(album.schoolTags) && album.schoolTags.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <span style={{ color: '#b8b4d9', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Tagged Schools
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {album.schoolTags.map((school) => (
                <span
                  key={school}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(96, 165, 250, 0.35)',
                    background: 'rgba(30, 41, 59, 0.88)',
                    color: '#dbeafe',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  {school}
                </span>
              ))}
            </div>
          </div>
        )}
        {album.description && <p className="albums-description" style={{ marginTop: 0, color: '#a8a8b8' }}>{album.description}</p>}
      </div>

      {album?.albumPurchaseEnabled !== false && albumPurchaseProducts.length > 0 && (
        <div style={{ marginBottom: 14, border: '1px solid #2f5dff', borderRadius: 8, padding: 12, background: 'rgba(47, 93, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <h3 style={{ margin: 0, color: '#c7d8ff' }}>Buy Entire Album</h3>
            <span className="badge" style={{ background: '#2f5dff' }}>Full Album</span>
          </div>
          <div style={{ color: '#b3c1e8', fontSize: 12, marginBottom: 10 }}>
            Purchase the full album as a digital download.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {albumPurchaseProducts.map((product) => {
              const defaultRow = getDefaultOrderRow(product);
              const defaultSize = defaultRow?.size || null;
              const rowKey = defaultRow?.key || `${product.id}-${defaultSize?.id || 0}`;
              return (
                <div
                  key={rowKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: '1px solid #2a407f',
                    borderRadius: 6,
                    padding: '8px 10px',
                    background: '#1b2240',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong>{product.name}</strong>
                      <span className="badge">Digital</span>
                      <span className="badge" style={{ background: '#2f5dff' }}>Full Album</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#9fb2ea' }}>
                      {defaultRow
                        ? (
                          <>
                            <div>{getSizeLabel(defaultRow.size)}</div>
                            {!!getVariantLabel(defaultRow) && (
                              <div style={{ color: '#bdb7ee' }}>{getVariantLabel(defaultRow)}</div>
                            )}
                          </>
                        )
                        : 'No size available'}
                    </div>
                  </div>
                  <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 700 }}>
                    ${Number(defaultRow?.price ?? product.price ?? defaultSize?.price ?? 0).toFixed(2)}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!defaultSize || addingKey === rowKey}
                    onClick={() => handleAddToCart(product, defaultSize, defaultRow)}
                    style={{ minWidth: 140, fontWeight: 700 }}
                  >
                    {addingKey === rowKey ? 'Adding...' : 'Buy Entire Album'}
                  </button>
                </div>
              );
            })}
          </div>
          {!!addMessage && (
            <div style={{ marginTop: 10, color: addMessage.includes('Failed') ? '#ff9a9a' : '#79d279', fontSize: 12 }}>
              {addMessage}
            </div>
          )}
        </div>
      )}

      {album?.albumPurchaseEnabled !== false && albumPurchaseProducts.length === 0 && (
        <div style={{ marginBottom: 14, border: '1px solid #3a3656', borderRadius: 8, padding: 10, background: '#161526', color: '#aaa', fontSize: 12 }}>
          Album purchase is enabled, but no full-album digital product is currently offered for this album.
        </div>
      )}



      <div style={{ marginBottom: 14, border: '1px solid #2a2740', borderRadius: 8, padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
          <input
            type="text"
            value={photoQuery}
            onChange={(e) => setPhotoQuery(e.target.value)}
            placeholder="Filter photos by name or metadata..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #3a3656',
              background: '#141320',
              color: '#fff',
            }}
          />
          <select
            value={metadataFilter}
            onChange={(e) => setMetadataFilter(e.target.value as any)}
            style={{
              minWidth: 170,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #3a3656',
              background: '#141320',
              color: '#fff',
            }}
          >
            <option value="all">Name + Metadata</option>
            <option value="any">Metadata (Any Field)</option>
            <option value="camera">Camera</option>
            <option value="iso">ISO</option>
            <option value="aperture">Aperture</option>
            <option value="shutterSpeed">Shutter Speed</option>
            <option value="focalLength">Focal Length</option>
            <option value="dateTaken">Date Taken</option>
          </select>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#aaa' }}>
          Showing {filteredPhotos.length} of {photos.length} photo{photos.length === 1 ? '' : 's'}
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="empty-state">No photos in this album yet.</div>
      ) : filteredPhotos.length === 0 ? (
        <div className="empty-state">No photos match your filter.</div>
      ) : (
        <div className="albums-grid">
          {filteredPhotos.map((photo) => {
            const playerNames = (photo.playerNames || '').split(',').filter((p) => p.trim());
            const playerNumbers = (photo.playerNumbers || '').split(',').filter((p) => p.trim());
            const hasPlayers = playerNames.length > 0 || playerNumbers.length > 0;
            const isSelected = selectedPhotoId === photo.id;

            return (
              <React.Fragment key={photo.id}>
                <div
                  className="album-card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    border: isSelected ? '2px solid #7b61ff' : undefined,
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    handleThumbnailSelect(photo);
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select photo ${photo.fileName}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleThumbnailSelect(photo);
                    }
                  }}
                >
                  {(() => {
                    const studioId = (album as any)?.studioId || (album as any)?.studio_id || (photos.length > 0 ? (photos[0] as any)?.studioId || (photos[0] as any)?.studio_id : undefined);
                    return (
                      <WatermarkedImage
                        src={`/api/photos/${photo.id}/asset?variant=thumbnail`}
                        alt={photo.fileName}
                        style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                        studioId={studioId}
                      />
                    );
                  })()}
                  {hasPlayers && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(20, 19, 32, 0.9)',
                        display: 'none',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px',
                        borderRadius: 0,
                      }}
                      className="player-hover-overlay"
                    >
                      <div style={{ textAlign: 'center', color: '#fff' }}>
                        {playerNames.length > 0 && (
                          <div style={{ marginBottom: playerNumbers.length > 0 ? 8 : 0 }}>
                            <div style={{ fontSize: '0.85rem', color: '#a8a8b8', marginBottom: 4 }}>Players</div>
                            <div style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>
                              {playerNames.map((name, idx) => (
                                <div key={idx}>{name.trim()}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {playerNumbers.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.85rem', color: '#a8a8b8', marginBottom: 4 }}>Numbers</div>
                            <div style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>
                              {playerNumbers.map((num, idx) => (
                                <div key={idx}>#{num.trim()}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* Inline order panel below selected photo, spanning all columns */}
                {isSelected && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      margin: '0 0 24px 0',
                      border: '2px solid #7b61ff',
                      borderRadius: 12,
                      padding: 18,
                      background: '#18162a',
                      boxShadow: '0 4px 24px 0 rgba(123,97,255,0.10)',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      zIndex: 2,
                      display: 'block',
                      position: 'relative',
                    }}
                  >
                    {/* Close (X) button */}
                    <button
                      aria-label="Close order panel"
                      onClick={() => {
                        const url = new URL(window.location.href);
                        url.searchParams.delete('photo');
                        navigate(url.pathname + url.search, { replace: false });
                      }}
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 14,
                        background: 'transparent',
                        border: 'none',
                        color: '#b9aaff',
                        fontSize: 22,
                        fontWeight: 700,
                        cursor: 'pointer',
                        zIndex: 10,
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                    <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, color: '#fff', textAlign: 'center' }}>Order this photo</h3>
                    {/* Enlarged photo preview */}
                    {selectedPhoto && (
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 18 }}>
                        <div style={{ width: 400, height: 267, maxWidth: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#18162a', borderRadius: 10, boxShadow: '0 2px 12px 0 rgba(123,97,255,0.10)', overflow: 'hidden' }}>
                          {(() => {
                            const studioId = (album as any)?.studioId || (album as any)?.studio_id || (photos.length > 0 ? (photos[0] as any)?.studioId || (photos[0] as any)?.studio_id : undefined);
                            return (
                              <WatermarkedImage
                                src={`/api/photos/${selectedPhoto.id}/asset?variant=thumbnail`}
                                alt={selectedPhoto.fileName}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                studioId={studioId}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        margin: '0 auto 16px auto',
                        maxWidth: 540,
                        border: '1px solid #3a3656',
                        borderRadius: 10,
                        padding: 12,
                        background: '#141320',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#ddd7ff', marginBottom: 6 }}>Help tag this photo</div>
                      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>
                        Know the player in this photo? Log in and submit a name for studio review.
                      </div>
                      {!user && (
                        <div style={{ marginBottom: 10, fontSize: 12, color: '#cbd5e1' }}>
                          You must be logged in to suggest tags.{' '}
                          <Link to="/login" style={{ color: '#9f7aea', fontWeight: 700 }}>Log in</Link>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={tagSuggestionName}
                          onChange={(e) => setTagSuggestionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSubmitTagSuggestion();
                            }
                          }}
                          disabled={!user}
                          placeholder="Enter player name"
                          style={{
                            flex: '1 1 260px',
                            padding: '10px 12px',
                            borderRadius: 6,
                            border: '1px solid #3a3656',
                            background: '#10101a',
                            color: '#fff',
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!user || tagSuggestionSubmitting}
                          onClick={handleSubmitTagSuggestion}
                        >
                          {tagSuggestionSubmitting ? 'Submitting...' : 'Submit Tag'}
                        </button>
                      </div>
                      {!!tagSuggestionMessage && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: tagSuggestionMessage.toLowerCase().includes('failed') || tagSuggestionMessage.toLowerCase().includes('error')
                              ? '#ff9a9a'
                              : '#79d279',
                          }}
                        >
                          {tagSuggestionMessage}
                        </div>
                      )}
                    </div>

                    {addMessage && <div style={{ marginBottom: 8, color: addMessage.includes('Failed') ? '#ff9a9a' : '#79d279', textAlign: 'center' }}>{addMessage}</div>}
                    <div style={{ marginBottom: 12 }}>
                      <input
                        type="text"
                        placeholder="Filter products by name or size..."
                        value={recommendationFilter}
                        onChange={e => setRecommendationFilter(e.target.value)}
                        style={{ padding: 8, width: '100%', borderRadius: 6, border: '1px solid #3a3656', background: '#141320', color: '#fff' }}
                      />
                    </div>
                    {orderedProducts.length === 0 ? (
                      <div style={{ color: '#999', textAlign: 'center' }}>No products available for this album.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Digital Products Section */}
                        {productsBySection.digital.length > 0 && (
                          <div>
                            <h4 style={{ marginTop: 0, marginBottom: 10, color: '#7b61ff', fontSize: 14, fontWeight: 600 }}>Digital</h4>
                            <div style={{ display: 'grid', gap: 8 }}>
                              {productsBySection.digital.map((product) => {
                                const sizeGroups = getRowsGroupedBySize(product);
                                return (
                                  <div key={product.id} style={{ display: 'grid', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <strong>{product.name}</strong>
                                      <span className="badge">Digital</span>
                                      {getDigitalScope(product) === 'album' && <span className="badge" style={{ background: '#2f5dff' }}>Full Album</span>}
                                    </div>
                                    {sizeGroups.length > 0 ? sizeGroups.map((group) => {
                                      const hasChildVariants = group.rows.length > 1 || group.rows.some((row) => !!getVariantLabel(row));

                                      if (!hasChildVariants) {
                                        const row = group.rows[0];
                                        const rowKey = row.key;
                                        return (
                                          <div
                                            key={group.key}
                                            className="order-product-row"
                                            style={{
                                              display: 'flex',
                                              flexDirection: 'row',
                                              alignItems: 'center',
                                              border: '1px solid #232036',
                                              borderRadius: 6,
                                              padding: '8px 10px',
                                              background: '#232036',
                                              gap: 10,
                                              flexWrap: 'wrap',
                                            }}
                                          >
                                            <div className="order-size-cell">
                                              <div style={{ fontSize: 12, color: '#aaa' }}>{group.sizeLabel}</div>
                                              {!!product.requiresWhccEditor && (
                                                <div style={{ fontSize: 11, color: '#9fb2ea', marginTop: 4 }}>
                                                  {getWhccSelectionHint(product)}
                                                </div>
                                              )}
                                            </div>
                                            <div
                                              className="order-price-cell"
                                              style={{
                                                minWidth: 90,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                flex: '0 0 auto',
                                                width: 'auto',
                                              }}
                                            >
                                              ${Number(row.price || 0).toFixed(2)}
                                            </div>
                                            <button
                                              className="btn btn-primary btn-sm order-add-cart-btn"
                                              disabled={!row.size || addingKey === rowKey}
                                              onClick={() => handleAddToCart(product, row.size, row)}
                                              style={{
                                                fontSize: 'clamp(13px, 3vw, 16px)',
                                                padding: 'clamp(7px, 2vw, 12px) clamp(18px, 5vw, 28px)',
                                                borderRadius: 24,
                                                minWidth: 110,
                                                width: 'auto',
                                                whiteSpace: 'nowrap',
                                                fontWeight: 700,
                                                boxShadow: '0 2px 8px 0 rgba(123,97,255,0.10)',
                                                marginLeft: 4,
                                                letterSpacing: 0.1,
                                                flex: '1 1 100%',
                                                maxWidth: '100%',
                                                marginTop: 8,
                                              }}
                                            >
                                              {addingKey === rowKey ? 'Adding...' : (product.requiresWhccEditor ? 'Select Photos' : 'Add to Cart')}
                                            </button>
                                          </div>
                                        );
                                      }

                                      return (
                                        <div
                                          key={group.key}
                                          className="order-product-row order-size-group"
                                          style={{
                                            border: '1px solid #1f1c33',
                                            borderRadius: 6,
                                            padding: '6px 8px',
                                            background: '#29264a',
                                            display: 'grid',
                                            gap: 6,
                                          }}
                                        >
                                          <div className="order-size-group-label" style={{ fontSize: 12, color: '#aaa', fontWeight: 700 }}>{group.sizeLabel}</div>
                                          <div className="order-size-group-children" style={{ display: 'grid', gap: 6, paddingLeft: 10, borderLeft: '2px solid #3c3568' }}>
                                            {group.rows.map((row) => {
                                              const rowKey = row.key;
                                              return (
                                                <div key={rowKey} className="order-variant-row">
                                                  <div className="order-variant-name" style={{ fontSize: 12, color: '#bdb7ee' }}>{getVariantLabel(row) || 'Default'}</div>
                                                  <div className="order-variant-price" style={{ minWidth: 90, textAlign: 'right', fontWeight: 700 }}>${Number(row.price || 0).toFixed(2)}</div>
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
                                          {!!product.requiresWhccEditor && (
                                            <div style={{ fontSize: 11, color: '#9fb2ea' }}>
                                              {getWhccSelectionHint(product)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }) : (
                                      <div style={{ color: '#aaa', fontSize: 12 }}>No size available</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {/* Recommended Products Section */}
                        {productsBySection.recommended.length > 0 && (
                          <div>
                            <h4 style={{ marginTop: 0, marginBottom: 10, color: '#7b61ff', fontSize: 14, fontWeight: 600 }}>Recommended</h4>
                            <div style={{ display: 'grid', gap: 8 }}>
                              {recommendedGrouped.map(({ category, products }) => (
                                <details key={category} open style={{ border: '1px solid #232036', borderRadius: 8, padding: '6px 8px', background: 'rgba(123, 97, 255, 0.05)' }}>
                                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#8d81ff', fontWeight: 700 }}>
                                    {category}
                                  </summary>
                                  <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                                    {products.map(({ name, items }) => (
                                      <div key={`${category}-${name}`} style={{ border: '1px solid #232036', borderRadius: 6, padding: '6px 8px', background: '#232036' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                                          <strong>{name}</strong>
                                          <span className="badge" style={{ background: '#2e2a52' }}>Recommended</span>
                                        </div>
                                        <div style={{ display: 'grid', gap: 6 }}>
                                          {items.map((product) => {
                                            const sizeGroups = getRowsGroupedBySize(product);
                                            return (
                                              <div key={product.id}>
                                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{product.name}</div>
                                                <div style={{ display: 'grid', gap: 6 }}>
                                                  {sizeGroups.length > 0 ? sizeGroups.map((group) => {
                                                    const hasChildVariants = group.rows.length > 1 || group.rows.some((row) => !!getVariantLabel(row));

                                                    if (!hasChildVariants) {
                                                      const row = group.rows[0];
                                                      const rowKey = row.key;
                                                      return (
                                                        <div
                                                          key={group.key}
                                                          className="order-product-row"
                                                          style={{
                                                            display: 'flex',
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            border: '1px solid #1f1c33',
                                                            borderRadius: 6,
                                                            padding: '6px 8px',
                                                            background: '#29264a',
                                                            gap: 10,
                                                            flexWrap: 'wrap',
                                                          }}
                                                        >
                                                          <div className="order-size-cell" style={{ fontSize: 12, color: '#bbb', flex: '1 1 100%' }}>
                                                            <div>{group.sizeLabel}</div>
                                                            {!!product.requiresWhccEditor && (
                                                              <div style={{ fontSize: 11, color: '#9fb2ea', marginTop: 4 }}>
                                                                {getWhccSelectionHint(product)}
                                                              </div>
                                                            )}
                                                          </div>
                                                          <div
                                                            className="order-price-cell"
                                                            style={{
                                                              minWidth: 90,
                                                              textAlign: 'right',
                                                              fontWeight: 700,
                                                              flex: '0 0 auto',
                                                              width: 'auto',
                                                            }}
                                                          >
                                                            ${Number(row?.price || 0).toFixed(2)}
                                                          </div>
                                                          <button
                                                            className="btn btn-primary btn-sm order-add-cart-btn"
                                                            disabled={!row.size || addingKey === rowKey}
                                                            onClick={() => handleAddToCart(product, row.size, row)}
                                                            style={{
                                                              fontSize: 'clamp(13px, 3vw, 16px)',
                                                              padding: 'clamp(7px, 2vw, 12px) clamp(18px, 5vw, 28px)',
                                                              borderRadius: 24,
                                                              minWidth: 110,
                                                              width: 'auto',
                                                              whiteSpace: 'nowrap',
                                                              fontWeight: 700,
                                                              boxShadow: '0 2px 8px 0 rgba(123,97,255,0.10)',
                                                              marginLeft: 4,
                                                              letterSpacing: 0.1,
                                                              flex: '1 1 100%',
                                                              maxWidth: '100%',
                                                              marginTop: 8,
                                                            }}
                                                          >
                                                            {addingKey === rowKey ? 'Adding...' : (product.requiresWhccEditor ? 'Select Photos' : 'Add to Cart')}
                                                          </button>
                                                        </div>
                                                      );
                                                    }

                                                    return (
                                                      <div
                                                        key={group.key}
                                                        className="order-product-row order-size-group"
                                                        style={{
                                                          border: '1px solid #1f1c33',
                                                          borderRadius: 6,
                                                          padding: '6px 8px',
                                                          background: '#29264a',
                                                          display: 'grid',
                                                          gap: 6,
                                                        }}
                                                      >
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
                                                        {!!product.requiresWhccEditor && (
                                                          <div style={{ fontSize: 11, color: '#9fb2ea' }}>
                                                            {getWhccSelectionHint(product)}
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  }) : (
                                                    <div style={{ fontSize: 12, color: '#aaa' }}>No size available</div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* All Products Section */}
                        {allProductsGrouped.length > 0 && (
                          <div>
                            <details style={{ border: '1px solid #232036', borderRadius: 8, padding: '10px 12px', background: '#232036' }}>
                              <summary style={{ cursor: 'pointer', color: '#7b61ff', fontSize: 14, fontWeight: 700 }}>
                                All Products
                              </summary>
                              <div style={{ display: 'grid', gap: 14, marginTop: 10 }}>
                                {allProductsGrouped.map(({ category, items }) => (
                                  <details key={category} style={{ border: '1px solid #232036', borderRadius: 8, padding: '10px 12px', background: '#232036' }}>
                                    <summary style={{ cursor: 'pointer', fontSize: 13, color: '#8d81ff', fontWeight: 700 }}>
                                      {category}
                                    </summary>
                                    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                                      {items.map((product) => {
                                        const sizeGroups = getRowsGroupedBySize(product);
                                        return (
                                          <div key={product.id}>
                                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{product.name}</div>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                              {sizeGroups.length > 0 ? sizeGroups.map((group) => {
                                                const hasChildVariants = group.rows.length > 1 || group.rows.some((row) => !!getVariantLabel(row));

                                                if (!hasChildVariants) {
                                                  const row = group.rows[0];
                                                  const rowKey = row.key;
                                                  return (
                                                    <div
                                                      key={group.key}
                                                      className="order-product-row"
                                                      style={{
                                                        display: 'flex',
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        border: '1px solid #1f1c33',
                                                        borderRadius: 6,
                                                        padding: '6px 8px',
                                                        background: '#29264a',
                                                        gap: 10,
                                                        flexWrap: 'wrap',
                                                      }}
                                                    >
                                                      <div className="order-size-cell" style={{ fontSize: 12, color: '#bbb', flex: '1 1 100%' }}>
                                                        <div>{group.sizeLabel}</div>
                                                        {!!product.requiresWhccEditor && (
                                                          <div style={{ fontSize: 11, color: '#9fb2ea', marginTop: 4 }}>
                                                            {getWhccSelectionHint(product)}
                                                          </div>
                                                        )}
                                                      </div>
                                                      <div
                                                        className="order-price-cell"
                                                        style={{
                                                          minWidth: 90,
                                                          textAlign: 'right',
                                                          fontWeight: 700,
                                                          flex: '0 0 auto',
                                                          width: 'auto',
                                                        }}
                                                      >
                                                        ${Number(row?.price || 0).toFixed(2)}
                                                      </div>
                                                      <button
                                                        className="btn btn-primary btn-sm order-add-cart-btn"
                                                        disabled={!row.size || addingKey === rowKey}
                                                        onClick={() => handleAddToCart(product, row.size, row)}
                                                        style={{
                                                          fontSize: 'clamp(13px, 3vw, 16px)',
                                                          padding: 'clamp(7px, 2vw, 12px) clamp(18px, 5vw, 28px)',
                                                          borderRadius: 24,
                                                          minWidth: 110,
                                                          width: 'auto',
                                                          whiteSpace: 'nowrap',
                                                          fontWeight: 700,
                                                          boxShadow: '0 2px 8px 0 rgba(123,97,255,0.10)',
                                                          marginLeft: 4,
                                                          letterSpacing: 0.1,
                                                          flex: '1 1 100%',
                                                          maxWidth: '100%',
                                                          marginTop: 8,
                                                        }}
                                                      >
                                                        {addingKey === rowKey ? 'Adding...' : (product.requiresWhccEditor ? 'Select Photos' : 'Add to Cart')}
                                                      </button>
                                                    </div>
                                                  );
                                                }

                                                return (
                                                  <div
                                                    key={group.key}
                                                    className="order-product-row order-size-group"
                                                    style={{
                                                      border: '1px solid #1f1c33',
                                                      borderRadius: 6,
                                                      padding: '6px 8px',
                                                      background: '#29264a',
                                                      display: 'grid',
                                                      gap: 6,
                                                    }}
                                                  >
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
                                                    {!!product.requiresWhccEditor && (
                                                      <div style={{ fontSize: 11, color: '#9fb2ea' }}>
                                                        {getWhccSelectionHint(product)}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              }) : (
                                                <div style={{ fontSize: 12, color: '#aaa' }}>No size available</div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
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
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {showWhccPhotoModal && whccProductToConfigure && whccSizeToConfigure && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#1a1a24', borderRadius: 12, border: '1px solid #2a2740', maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
            {(() => {
              const { minPhotos, maxPhotos } = getWhccPhotoSelectionRequirements(whccProductToConfigure);
              const selectedCount = whccSelectedPhotoIds.length;
              const minLabel = minPhotos === maxPhotos ? `${minPhotos}` : `${minPhotos}-${maxPhotos}`;
              const canContinue = selectedCount >= minPhotos && selectedCount <= maxPhotos;
              const modalKey = `${whccProductToConfigure.id}-${whccSizeToConfigure.id}`;

              return (
                <>
                  <h3 style={{ marginTop: 0, marginBottom: 8 }}>
                    Select photos for {whccProductToConfigure.name}
                  </h3>
                  <div style={{ fontSize: 13, color: '#a9a6c7', marginBottom: 12 }}>
                    Choose {minLabel} photo{minPhotos === 1 && maxPhotos === 1 ? '' : 's'} from this album before launching the editor.
                  </div>

                  <div style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #3a3656', borderRadius: 999, padding: '6px 10px', background: '#141320', color: '#ddd' }}>
                    <span>Selected:</span>
                    <strong>{selectedCount}</strong>
                    <span>of</span>
                    <strong>{minLabel}</strong>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                    {photos.map((photo) => {
                      const photoId = Number(photo.id);
                      const isSelected = whccSelectedPhotoIds.includes(photoId);
                      const disableUnchecked = !isSelected && whccSelectedPhotoIds.length >= maxPhotos;

                      return (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => handleWhccPhotoToggle(photoId)}
                          disabled={disableUnchecked}
                          style={{
                            border: isSelected ? '2px solid #7b61ff' : '1px solid #2e2b46',
                            borderRadius: 8,
                            padding: 6,
                            background: isSelected ? 'rgba(123, 97, 255, 0.12)' : '#161526',
                            cursor: disableUnchecked ? 'not-allowed' : 'pointer',
                            opacity: disableUnchecked ? 0.6 : 1,
                            textAlign: 'left',
                            color: '#fff',
                          }}
                        >
                          <img
                            src={`/api/photos/${photo.id}/asset?variant=thumbnail`}
                            alt={photo.fileName}
                            style={{ width: '100%', height: 88, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }}
                          />
                          <div style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {photo.fileName || `Photo ${photo.id}`}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={closeWhccPhotoModal}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={!canContinue || addingKey === modalKey}
                      onClick={handleConfirmWhccPhotoSelection}
                    >
                      {addingKey === modalKey ? 'Preparing...' : 'Continue to Editor'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {showCropModal && selectedPhoto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1a24', borderRadius: 12, border: '1px solid #2a2740', maxWidth: 600, maxHeight: 600, overflow: 'auto', padding: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Crop photo for {productToCrop?.name}</h3>
            <div style={{ marginBottom: 16, maxHeight: 400 }}>
              <Cropper
                ref={setCropperRef}
                src={selectedPhoto ? `/api/photos/${selectedPhoto.id}/asset?variant=thumbnail` : ''}
                crossOrigin="anonymous"
                style={{ maxHeight: 400, width: '100%' }}
                aspectRatio={getCropAspectRatio(productToCrop)}
                viewMode={1}
                guides={true}
                responsive={true}
                autoCropArea={1}
                minContainerHeight={200}
                minContainerWidth={200}
                onInitialized={cropper => {
                  setCropperRef(cropper);
                  // Load cropData from cart item if available and scale to displayed image
                  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
                  const cartItem = cart.find((item: any) => item.photoId === selectedPhoto.id && item.productId === productToCrop?.id && item.productSizeId === sizeToCrop?.id);
                  if (cartItem && cartItem.cropData && selectedPhoto) {
                    // Get displayed (thumbnail) and original image sizes
                    const checkAndSet = () => {
                      const imgData = cropper.getImageData();
                      const displayedWidth = imgData.naturalWidth;
                      const displayedHeight = imgData.naturalHeight;
                      const originalWidth = Number(selectedPhoto.width || selectedPhoto.metadata?.width || 0);
                      const originalHeight = Number(selectedPhoto.height || selectedPhoto.metadata?.height || 0);
                      if (displayedWidth > 0 && displayedHeight > 0 && originalWidth > 0 && originalHeight > 0) {
                        // Scale from original to displayed
                        const scaleX = displayedWidth / originalWidth;
                        const scaleY = displayedHeight / originalHeight;
                        cropper.setData({
                          x: cartItem.cropData.x * scaleX,
                          y: cartItem.cropData.y * scaleY,
                          width: cartItem.cropData.width * scaleX,
                          height: cartItem.cropData.height * scaleY,
                        });
                      } else {
                        // Retry after a short delay if image not ready
                        setTimeout(checkAndSet, 50);
                      }
                    };
                    checkAndSet();
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={handleResetCrop}
              >
                Reset Crop
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCancelCrop}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={addingKey !== ''}
                onClick={handleCropConfirm}
              >
                {addingKey !== '' ? 'Adding...' : 'Add to Cart'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  </>
  );
};

export default AlbumDetails;


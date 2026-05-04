import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analyticsService } from '../services/analyticsService';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import WatermarkedImage from '../components/WatermarkedImage';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import api from '../services/api';
import { photoService } from '../services/photoService';
import { productService } from '../services/productService';
import { useCart } from '../contexts/CartContext';
import { Album, Photo, Product, ProductSize } from '../types';
import './AlbumDetails.css';


type ProductWithMatch = Product & {
  bestSize?: ProductSize | null;
  ratioDiff: number;
  isRecommended: boolean;
};

const AlbumDetails: React.FC = () => {
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
  const [searchParams] = useSearchParams();
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingKey, setAddingKey] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropperRef, setCropperRef] = useState<any>(null);
  const [productToCrop, setProductToCrop] = useState<ProductWithMatch | null>(null);
  const [sizeToCrop, setSizeToCrop] = useState<ProductSize | null>(null);
  const [showWhccPhotoModal, setShowWhccPhotoModal] = useState(false);
  const [whccProductToConfigure, setWhccProductToConfigure] = useState<ProductWithMatch | null>(null);
  const [whccSizeToConfigure, setWhccSizeToConfigure] = useState<ProductSize | null>(null);
  const [whccSelectedPhotoIds, setWhccSelectedPhotoIds] = useState<number[]>([]);
  const [photoQuery, setPhotoQuery] = useState('');
  const [metadataFilter, setMetadataFilter] = useState<'all' | 'camera' | 'iso' | 'aperture' | 'shutterSpeed' | 'focalLength' | 'dateTaken' | 'any'>('all');
  const { addToCart } = useCart();
  const autoBuyAttemptedRef = useRef(false);






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
    const digital = orderedProducts.filter((p) => p.isDigital && (albumPurchaseEnabled || getDigitalScope(p) !== 'album'));
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

  const getSelectedSizeForCart = (product: ProductWithMatch, sizeOverride?: ProductSize | null): ProductSize | null => {
    const baseSize = sizeOverride || getDefaultSize(product);
    if (!baseSize) return null;

    if (product.isDigital) {
      return {
        ...baseSize,
        price: Number(product.price || baseSize.price || 0),
      };
    }

    return baseSize;
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
    setWhccSelectedPhotoIds(initialSelection);
    setShowWhccPhotoModal(true);
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

  const handleAddToCart = async (product: ProductWithMatch, sizeOverride?: ProductSize | null) => {
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

    const selectedSize = getSelectedSizeForCart(product, sizeOverride);
    if (!selectedSize) {
      setAddMessage('This product has no available size.');
      return;
    }

    if (requiresWhccEditor) {
      setAddMessage('');
      openWhccPhotoSelection(product, selectedSize, effectiveSelectedPhoto?.id);
      return;
    }

    // Digital products do not require crop workflow.
    if (product.isDigital) {
      const key = `${product.id}-${selectedSize.id}`;
      setAddingKey(key);
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

    const key = `${productToCrop.id}-${size.id}`;
    setAddingKey(key);
    setAddMessage('');
    try {
      const cropper = cropperRef?.cropper || cropperRef;
      const cropData = cropper?.getData ? cropper.getData() : null;
      const cropValues = cropData ? {
        x: Math.round(cropData.x),
        y: Math.round(cropData.y),
        width: Math.round(cropData.width),
        height: Math.round(cropData.height),
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
      } : { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 };

      await addToCart(
        selectedPhoto,
        cropValues,
        productToCrop,
        size,
        1
      );
      setAddMessage(`${productToCrop.name} added to cart.`);
      setShowCropModal(false);
      setProductToCrop(null);
      setSizeToCrop(null);
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

  return (
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
              const defaultSize = getDefaultSize(product);
              const rowKey = `${product.id}-${defaultSize?.id || 0}`;
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
                      {defaultSize
                        ? `${defaultSize.name}${defaultSize.width && defaultSize.height ? ` (${defaultSize.width}x${defaultSize.height})` : ''}`
                        : 'No size available'}
                    </div>
                  </div>
                  <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 700 }}>
                    ${Number(product.price || defaultSize?.price || 0).toFixed(2)}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!defaultSize || addingKey === rowKey}
                    onClick={() => handleAddToCart(product)}
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
                                const defaultSize = getDefaultSize(product);
                                const rowKey = `${product.id}-${defaultSize?.id || 0}`;
                                return (
                                  <div
                                    key={product.id}
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
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <strong>{product.name}</strong>
                                        <span className="badge">Digital</span>
                                        {getDigitalScope(product) === 'album' && <span className="badge" style={{ background: '#2f5dff' }}>Full Album</span>}
                                      </div>
                                      <div style={{ fontSize: 12, color: '#aaa' }}>
                                        {defaultSize
                                          ? `${defaultSize.name}${defaultSize.width && defaultSize.height ? ` (${defaultSize.width}x${defaultSize.height})` : ''}`
                                          : 'No size available'}
                                      </div>
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
                                      ${Number(product.price || defaultSize?.price || 0).toFixed(2)}
                                    </div>
                                    <button
                                      className="btn btn-primary btn-sm order-add-cart-btn"
                                      disabled={!defaultSize || addingKey === rowKey}
                                      onClick={() => handleAddToCart(product)}
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
                                            const defaultSize = getDefaultSize(product);
                                            const rowKey = `${product.id}-${defaultSize?.id || 0}`;
                                            return (
                                              <div
                                                key={product.id}
                                                className="order-product-row"
                                                style={{
                                                  display: 'flex',
                                                  flexDirection: 'row',
                                                  alignItems: 'center',
                                                  border: '1px solid #1f1c33',
                                                  borderRadius: 6,
                                                  padding: '4px 6px',
                                                  background: '#29264a',
                                                  gap: 10,
                                                  flexWrap: 'wrap',
                                                }}
                                              >
                                                <div className="order-size-cell" style={{ fontSize: 12, color: '#aaa', flex: '1 1 100%' }}>
                                                  {defaultSize
                                                    ? `${defaultSize.name}${defaultSize.width && defaultSize.height ? ` (${defaultSize.width}x${defaultSize.height})` : ''}`
                                                    : 'No size available'}
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
                                                  ${Number(defaultSize?.price || 0).toFixed(2)}
                                                </div>
                                                <button
                                                  className="btn btn-primary btn-sm order-add-cart-btn"
                                                  disabled={!defaultSize || addingKey === rowKey}
                                                  onClick={() => handleAddToCart(product)}
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
                                        const sizes = Array.isArray(product.sizes) ? product.sizes : [];
                                        return (
                                          <div key={product.id}>
                                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{product.name}</div>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                              {sizes.length > 0 ? sizes.map((size) => {
                                                const rowKey = `${product.id}-${size?.id || size?.name || 'size'}`;
                                                return (
                                                  <div
                                                    key={rowKey}
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
                                                      {size?.name || 'Default'}{size?.width && size?.height ? ` (${size.width}x${size.height})` : ''}
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
                                                      ${Number(size?.price || 0).toFixed(2)}
                                                    </div>
                                                    <button
                                                      className="btn btn-primary btn-sm order-add-cart-btn"
                                                      disabled={!size || addingKey === rowKey}
                                                      onClick={() => handleAddToCart(product, size)}
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
  );
};

export default AlbumDetails;


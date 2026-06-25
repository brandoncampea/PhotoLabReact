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
import playerWatchlistService from '../services/playerWatchlistService';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { Album, Photo, Product, ProductSize, PackageSlot } from '../types';
import { usePackageBuilder } from '../contexts/PackageBuilderContext';
import PackageProgressBar from '../components/PackageProgressBar';
import './AlbumDetails.css';
import { Helmet } from 'react-helmet-async';
import PhotoOrderPanel from '../components/PhotoOrderPanel';
import FeaturePromoModal from '../components/FeaturePromoModal';


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
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [showTagWatchPrompt, setShowTagWatchPrompt] = useState(false);
  const [pendingWatchPlayerName, setPendingWatchPlayerName] = useState('');
  const [pendingTagSuggestionBaseMessage, setPendingTagSuggestionBaseMessage] = useState('');
  const [addingPendingWatchPlayer, setAddingPendingWatchPlayer] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropperRef, setCropperRef] = useState<any>(null);
  const [productToCrop, setProductToCrop] = useState<ProductWithMatch | null>(null);
  const [sizeToCrop, setSizeToCrop] = useState<ProductSize | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [packageCropSlotIndex, setPackageCropSlotIndex] = useState<number | null>(null);
  const [showWhccPhotoModal, setShowWhccPhotoModal] = useState(false);
  const [whccProductToConfigure, setWhccProductToConfigure] = useState<ProductWithMatch | null>(null);
  const [whccSizeToConfigure, setWhccSizeToConfigure] = useState<ProductSize | null>(null);
  const [whccOrderRowToConfigure, setWhccOrderRowToConfigure] = useState<ProductOrderRow | null>(null);
  const [whccSelectedPhotoIds, setWhccSelectedPhotoIds] = useState<number[]>([]);
  const [photoQuery, setPhotoQuery] = useState('');
  const [metadataFilter, setMetadataFilter] = useState<'all' | 'camera' | 'iso' | 'aperture' | 'shutterSpeed' | 'focalLength' | 'dateTaken' | 'any'>('all');
  const { addToCart, addPackageToCart } = useCart();
  const packageBuilder = usePackageBuilder();
  const autoBuyAttemptedRef = useRef(false);
  const [orderRowToCrop, setOrderRowToCrop] = useState<ProductOrderRow | null>(null);

  // Favorites
  const [favToken, setFavToken] = useState<string>(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('favToken');
    if (fromQuery) {
      localStorage.setItem('favToken', fromQuery);
      return fromQuery;
    }
    const stored = localStorage.getItem('favToken');
    if (stored) return stored;
    const newToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    localStorage.setItem('favToken', newToken);
    return newToken;
  });
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [favTogglingId, setFavTogglingId] = useState<number | null>(null);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [showFavEmailPrompt, setShowFavEmailPrompt] = useState(false);
  const [favEmail, setFavEmail] = useState('');
  const [favEmailSending, setFavEmailSending] = useState(false);
  const [favEmailSent, setFavEmailSent] = useState(false);

  const [showPromoModal, setShowPromoModal] = useState(false);

  // Album-level player tag suggestion
  const [showPlayerSuggestModal, setShowPlayerSuggestModal] = useState(false);
  const [playerSuggestName, setPlayerSuggestName] = useState('');
  const [playerSuggestNumber, setPlayerSuggestNumber] = useState('');
  const [playerSuggestNotes, setPlayerSuggestNotes] = useState('');
  const [playerSuggestSubmitting, setPlayerSuggestSubmitting] = useState(false);
  const [playerSuggestMessage, setPlayerSuggestMessage] = useState('');



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
    if (!query && !showFavOnly) return photos;
    if (!query && showFavOnly) return photos.filter(p => favorites.has(p.id));

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
    }).filter(photo => !showFavOnly || favorites.has(photo.id));
  }, [photos, photoQuery, metadataFilter, showFavOnly, favorites]);

  const selectedPhoto = useMemo(
    () => filteredPhotos.find((p) => p.id === selectedPhotoId) || null,
    [filteredPhotos, selectedPhotoId]
  );

  useEffect(() => {
    setTagSuggestionName('');
    setTagSuggestionMessage('');
    setShowTagWatchPrompt(false);
    setPendingWatchPlayerName('');
    setPendingTagSuggestionBaseMessage('');
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
        // Load packages for this album's effective price list (album list → studio default)
        try {
          const pkgsRes = await api.get(`/packages/for-album/${id}`);
          setPackages(pkgsRes.data || []);
        } catch { /* packages are optional */ }
        // Track album view for analytics
        analyticsService.trackAlbumView(
          id,
          albumRes.data?.name || '',
          Number((albumRes.data as any)?.studioId || 0) || undefined
        );

        // Load favorites for this session
        try {
          const favRes = await api.get(`/albums/${id}/favorites?token=${encodeURIComponent(favToken)}`);
          setFavorites(new Set((favRes.data.favorites || []).map(Number)));
        } catch { /* non-fatal */ }

        // Track referral visit if ?ref= is in URL
        const refCode = new URLSearchParams(window.location.search).get('ref');
        if (refCode) {
          localStorage.setItem('albumRefCode', refCode);
          api.post(`/albums/${id}/track-visit`, { code: refCode }).catch(() => {});
        }
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

  const toggleFavorite = async (photoId: number) => {
    if (!album || favTogglingId === photoId) return;
    setFavTogglingId(photoId);
    try {
      const res = await api.post(`/albums/${album.id}/favorites`, { token: favToken, photoId });
      setFavorites(prev => {
        const next = new Set(prev);
        if (res.data.favorited) next.add(photoId);
        else next.delete(photoId);
        return next;
      });
    } catch { /* non-fatal */ }
    setFavTogglingId(null);
  };

  const saveFavoritesEmail = async () => {
    if (!album || !favEmail.trim()) return;
    setFavEmailSending(true);
    try {
      await api.post(`/albums/${album.id}/favorites/save-email`, { token: favToken, email: favEmail.trim() });
      setFavEmailSent(true);
    } catch { /* non-fatal */ }
    setFavEmailSending(false);
  };

  const handleSubmitPlayerSuggestion = async () => {
    if (!album) return;
    if (!user) {
      setPlayerSuggestMessage('Please log in to suggest a player.');
      navigate('/login');
      return;
    }
    const name = playerSuggestName.trim();
    if (!name) { setPlayerSuggestMessage('Please enter a player name.'); return; }
    try {
      setPlayerSuggestSubmitting(true);
      setPlayerSuggestMessage('');
      const res = await api.post(`/albums/${album.id}/player-suggestions`, {
        playerName: name,
        playerNumber: playerSuggestNumber.trim() || undefined,
        notes: playerSuggestNotes.trim() || undefined,
      });
      setPlayerSuggestMessage(res.data?.message || 'Tag submitted!');
      setPlayerSuggestName('');
      setPlayerSuggestNumber('');
      setPlayerSuggestNotes('');
    } catch (err: any) {
      setPlayerSuggestMessage(err?.response?.data?.error || 'Failed to submit.');
    } finally {
      setPlayerSuggestSubmitting(false);
    }
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
      const baseMessage = response?.message || 'Tag suggestion submitted.';
      setTagSuggestionMessage(baseMessage);
      setPendingTagSuggestionBaseMessage(baseMessage);
      setPendingWatchPlayerName(playerName);
      setShowTagWatchPrompt(true);
      setTagSuggestionName('');
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to submit tag suggestion.';
      setTagSuggestionMessage(message);
    } finally {
      setTagSuggestionSubmitting(false);
    }
  };

  const handleSkipAddToWatchlist = () => {
    setShowTagWatchPrompt(false);
    setPendingWatchPlayerName('');
    setPendingTagSuggestionBaseMessage('');
  };

  const handleConfirmAddToWatchlist = async () => {
    if (!pendingWatchPlayerName) {
      handleSkipAddToWatchlist();
      return;
    }

    try {
      setAddingPendingWatchPlayer(true);
      const studioId = Number((album as any)?.studioId || 0) || undefined;
      await playerWatchlistService.addPlayer(pendingWatchPlayerName, null, studioId);
      setTagSuggestionMessage(`${pendingTagSuggestionBaseMessage || 'Tag suggestion submitted.'} Added to your watch list.`);
    } catch (watchErr: any) {
      const status = Number(watchErr?.response?.status || 0);
      if (status === 409) {
        setTagSuggestionMessage(`${pendingTagSuggestionBaseMessage || 'Tag suggestion submitted.'} This player is already in your watch list.`);
      } else {
        setTagSuggestionMessage(`${pendingTagSuggestionBaseMessage || 'Tag suggestion submitted.'} Could not add to watch list right now.`);
      }
    } finally {
      setAddingPendingWatchPlayer(false);
      setShowTagWatchPrompt(false);
      setPendingWatchPlayerName('');
      setPendingTagSuggestionBaseMessage('');
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
    const digital = orderedProducts.filter((p) => p.isDigital && getDigitalScopeValue(p) !== 'album');
    const recommended = orderedProducts.filter((p) => !p.isDigital && recommendedProductIds.has(p.id));
    const remaining = orderedProducts.filter((p) => !p.isDigital && !recommendedProductIds.has(p.id));
    return { digital, recommended, remaining };
  }, [orderedProducts, recommendedProductIds, album]);

  const albumPurchaseProducts = useMemo(
    () => (products || [])
      .filter((p) => !!p.isDigital && getDigitalScopeValue(p) === 'album')
      .map((p) => ({ ...p, ratioDiff: 0, isRecommended: false, studioIsRecommended: false }) as ProductWithMatch),
    [products]
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
    // Wait until products are loaded before deciding
    if (loading || !products.length) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('buyAlbum');
    const query = nextParams.toString();

    if (!albumPurchaseProducts.length) {
      // Products loaded but none have album scope — land on the album normally
      navigate(`${window.location.pathname}${query ? `?${query}` : ''}`, { replace: true });
      return;
    }

    autoBuyAttemptedRef.current = true;
    const firstProduct = albumPurchaseProducts[0] as ProductWithMatch;
    void handleAddToCart(firstProduct);
    navigate(`${window.location.pathname}${query ? `?${query}` : ''}`, { replace: true });
  }, [albumPurchaseProducts, loading, products, navigate, searchParams]);

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

      if (packageCropSlotIndex !== null) {
        // Package mode: fill the slot instead of adding to cart directly
        packageBuilder.fillCurrentSlot(selectedPhoto, cropValues);
        setAddMessage('Photo added to package!');
        setShowCropModal(false);
        setProductToCrop(null);
        setSizeToCrop(null);
        setOrderRowToCrop(null);
        setPackageCropSlotIndex(null);
        setCropperRef(null);
      } else {
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
      }
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

  // Package builder: use currently-selected photo for the active slot
  const handleUsePhotoForPackage = () => {
    if (!selectedPhoto || !packageBuilder.currentSlot) return;
    const slot = packageBuilder.currentSlot;

    if (slot.isDigital) {
      // Digital items need no crop
      packageBuilder.fillCurrentSlot(selectedPhoto, { x: 0, y: 0, width: 100, height: 100, rotate: 0, scaleX: 1, scaleY: 1 });
      return;
    }

    const product = (products || []).find((p: Product) => p.id === slot.productId);
    if (!product) return;
    const size = (product.sizes || []).find((s: ProductSize) => s.id === slot.productSizeId);
    if (!size) return;

    const mockProduct: ProductWithMatch = { ...product, bestSize: size, ratioDiff: 0, isRecommended: true };
    setProductToCrop(mockProduct);
    setSizeToCrop(size);
    setOrderRowToCrop(null);
    setPackageCropSlotIndex(packageBuilder.currentSlotIndex);
    setShowCropModal(true);
  };

  // Package builder: commit all filled slots to cart and navigate to cart
  const handleCommitPackage = async () => {
    if (!packageBuilder.isComplete || !packageBuilder.activePackage) return;
    try {
      await addPackageToCart(
        packageBuilder.activePackage,
        packageBuilder.slots as PackageSlot[],
        packageBuilder.albumInfo
      );
      packageBuilder.cancelPackage();
      navigate('/cart');
    } catch {
      setAddMessage('Failed to add package to cart.');
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

  const ProductImageHover = ({ imageUrl, name }: { imageUrl?: string | null; name: string }) => {
    if (!imageUrl) return null;
    return (
      <span className="product-img-wrap">
        <img src={imageUrl} alt={name} className="product-img-thumb" />
        <span className="product-img-tooltip">
          <img src={imageUrl} alt={name} />
        </span>
      </span>
    );
  };

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
      {/* Sticky package builder progress bar — shown when a package is in progress */}
      {packageBuilder.isActive && <PackageProgressBar onCommit={handleCommitPackage} />}
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




      {/* Packages section */}
      {packages.length > 0 && (
        <div style={{ marginBottom: 14, border: '1px solid #3a2d7f', borderRadius: 10, padding: '12px 14px', background: 'rgba(123, 97, 255, 0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: '#c7bcff', fontSize: 15, fontWeight: 700 }}>📦 Packages</h3>
            <span style={{ fontSize: 12, color: '#8d81ff' }}>Bundle and save</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {packages.map((pkg: any) => {
              const isThisActive = packageBuilder.activePackage?.id === pkg.id;
              // Build readable items summary from loaded products
              const itemsSummary = (pkg.items || []).map((item: any) => {
                const prod = products.find(p => p.id === item.productId);
                const sz = prod?.sizes.find(s => s.id === item.productSizeId);
                const label = [sz?.name, prod?.name].filter(Boolean).join(' ');
                return `${item.quantity}× ${label || `Product ${item.productId}`}`;
              }).join(' · ');

              return (
                <div
                  key={pkg.id}
                  style={{
                    border: isThisActive ? '2px solid #7b61ff' : '1px solid #2a2056',
                    borderRadius: 10,
                    padding: '10px 14px',
                    background: isThisActive ? 'rgba(123, 97, 255, 0.1)' : '#1a1630',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 15, marginBottom: 3 }}>{pkg.name}</div>
                    {pkg.description && (
                      <div style={{ fontSize: 12, color: '#8d81ff', marginBottom: 4 }}>{pkg.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#a8a8c8', lineHeight: 1.5 }}>{itemsSummary}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#9fffb4' }}>
                      ${Number(pkg.packagePrice || 0).toFixed(2)}
                    </div>
                    {!isThisActive ? (
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ fontWeight: 700, minWidth: 120, borderRadius: 999, whiteSpace: 'nowrap' }}
                        onClick={() => packageBuilder.startPackage(pkg, products, {
                          albumId: album?.id,
                          albumName: album?.name ?? undefined,
                          albumCoverImageUrl: (album as any)?.coverImageUrl ?? undefined,
                        })}
                      >
                        Start Package
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#7b61ff', fontWeight: 700 }}>In Progress ↑</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#aaa' }}>
            Showing {filteredPhotos.length} of {photos.length} photo{photos.length === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowFavOnly(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20,
                border: `1px solid ${showFavOnly ? '#f472b6' : 'rgba(244,114,182,0.3)'}`,
                background: showFavOnly ? 'rgba(244,114,182,0.15)' : 'transparent',
                color: showFavOnly ? '#f472b6' : '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ♥ {favorites.size > 0 ? `${favorites.size} Saved` : 'Favorites'}
            </button>
            {favorites.size > 0 && (
              <button
                type="button"
                onClick={() => setShowFavEmailPrompt(true)}
                style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(123,97,255,0.4)', background: 'rgba(123,97,255,0.1)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Save & Share
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowPlayerSuggestModal(true); setPlayerSuggestMessage(''); }}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(99,179,120,0.4)', background: 'rgba(99,179,120,0.08)', color: '#6ee7a0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              👤 Tag a Player
            </button>
            <button
              type="button"
              onClick={() => setShowPromoModal(true)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(255,210,80,0.35)', background: 'rgba(255,210,80,0.07)', color: '#fcd34d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              title="See what you can do here"
            >
              ✨ What's New
            </button>
          </div>
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
                  {/* Heart / favorite button */}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); toggleFavorite(photo.id); }}
                    disabled={favTogglingId === photo.id}
                    style={{
                      position: 'absolute', bottom: 6, right: 6, zIndex: 10,
                      width: 28, height: 28, borderRadius: '50%', border: 'none',
                      background: favorites.has(photo.id) ? 'rgba(244,114,182,0.9)' : 'rgba(0,0,0,0.5)',
                      color: favorites.has(photo.id) ? '#fff' : '#f472b6',
                      fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}
                    aria-label={favorites.has(photo.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {favorites.has(photo.id) ? '♥' : '♡'}
                  </button>
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
                  <PhotoOrderPanel
                    photo={photo}
                    albumId={Number(album.id)}
                    albumName={String(album?.name || '')}
                    studioId={Number((album as any)?.studioId || 0) || undefined}
                    albumCoverImageUrl={String((album as any)?.coverImageUrl || '').trim() || undefined}
                    products={products}
                    albumPhotos={photos}
                    albumPurchaseEnabled={album?.albumPurchaseEnabled !== false}
                    onClose={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.delete('photo');
                      navigate(url.pathname + url.search, { replace: false });
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

    </div>

      {/* Feature promo modal — shown once to first-time visitors, or on demand */}
      <FeaturePromoModal forceShow={showPromoModal} onDismiss={() => setShowPromoModal(false)} />

      {/* Suggest a player modal */}
      {showPlayerSuggestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#16162a', border: '1px solid rgba(99,179,120,0.25)', borderRadius: 16, padding: 26, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>👤 Tag a Player</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 18 }}>
              Spot someone you know in this album? Tell us and the studio will make sure they're tagged in all their photos.
            </div>
            {playerSuggestMessage ? (
              <>
                <div style={{ fontSize: 13, color: playerSuggestMessage.startsWith('Thanks') || playerSuggestMessage.startsWith('You already') ? '#86efac' : '#f87171', marginBottom: 16, lineHeight: 1.5 }}>{playerSuggestMessage}</div>
                <button type="button" onClick={() => { setShowPlayerSuggestModal(false); setPlayerSuggestMessage(''); }} style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: '#7b61ff', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Done</button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Player Name *</label>
                  <input
                    type="text"
                    value={playerSuggestName}
                    onChange={e => setPlayerSuggestName(e.target.value)}
                    placeholder="e.g. Jordan Smith"
                    autoFocus
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 7, border: '1px solid #2e2b4a', background: '#1a1a2e', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Jersey # (optional)</label>
                  <input
                    type="text"
                    value={playerSuggestNumber}
                    onChange={e => setPlayerSuggestNumber(e.target.value)}
                    placeholder="e.g. 23"
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 7, border: '1px solid #2e2b4a', background: '#1a1a2e', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                  <input
                    type="text"
                    value={playerSuggestNotes}
                    onChange={e => setPlayerSuggestNotes(e.target.value)}
                    placeholder="e.g. wearing red jersey, front row"
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 7, border: '1px solid #2e2b4a', background: '#1a1a2e', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowPlayerSuggestModal(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #2e2b4a', background: 'transparent', color: '#9ca3af', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button
                    type="button"
                    onClick={handleSubmitPlayerSuggestion}
                    disabled={!playerSuggestName.trim() || playerSuggestSubmitting}
                    style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: (!playerSuggestName.trim() || playerSuggestSubmitting) ? 0.6 : 1 }}
                  >
                    {playerSuggestSubmitting ? 'Submitting…' : 'Submit Tag'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Favorites email prompt modal */}
      {showFavEmailPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#16162a', border: '1px solid rgba(244,114,182,0.3)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Save your favorites</div>
            {favEmailSent ? (
              <>
                <div style={{ fontSize: 14, color: '#86efac', marginBottom: 16 }}>We've emailed you a link to your saved favorites.</div>
                <button type="button" onClick={() => { setShowFavEmailPrompt(false); setFavEmailSent(false); }} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#7b61ff', color: '#fff', fontWeight: 700, cursor: 'pointer', width: '100%' }}>Close</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>Enter your email and we'll send you a link so you can come back to your {favorites.size} saved photo{favorites.size !== 1 ? 's' : ''} anytime.</div>
                <input
                  type="email"
                  value={favEmail}
                  onChange={e => setFavEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(244,114,182,0.4)', background: '#1a1a2e', color: '#fff', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowFavEmailPrompt(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #3a3656', background: 'transparent', color: '#9ca3af', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="button" disabled={!favEmail.trim() || favEmailSending} onClick={saveFavoritesEmail} style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: '#f472b6', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: (!favEmail.trim() || favEmailSending) ? 0.6 : 1 }}>
                    {favEmailSending ? 'Sending…' : 'Send Magic Link'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
  </>
  );
};

export default AlbumDetails;


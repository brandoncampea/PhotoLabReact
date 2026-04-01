import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import api from '../services/api';
import { photoService } from '../services/photoService';
import { productService } from '../services/productService';
import { useCart } from '../contexts/CartContext';
import { Album, Photo, Product, ProductSize } from '../types';

type ProductWithMatch = Product & {
  bestSize?: ProductSize | null;
  ratioDiff: number;
  isRecommended: boolean;
};

const AlbumDetails: React.FC = () => {
  const { albumId } = useParams();
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
  const { addToCart } = useCart();

  const selectedPhotoId = Number(searchParams.get('photo') || 0);

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
      } catch {
        setError('Failed to load album');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [albumId]);

  const selectedPhoto = useMemo(
    () => photos.find((p) => p.id === selectedPhotoId) || null,
    [photos, selectedPhotoId]
  );

  const orderedProducts = useMemo((): ProductWithMatch[] => {
    if (!selectedPhoto) return [];

    const width = Number(selectedPhoto.width || 0);
    const height = Number(selectedPhoto.height || 0);
    const photoRatio = width > 0 && height > 0 ? width / height : 0;

    const withMatch: ProductWithMatch[] = (products || []).map((product) => {
      const sizes = Array.isArray(product.sizes) ? product.sizes : [];
      let bestSize: ProductSize | null = null;
      let ratioDiff = Number.POSITIVE_INFINITY;

      if (photoRatio > 0) {
        sizes.forEach((size) => {
          const sw = Number(size.width || 0);
          const sh = Number(size.height || 0);
          if (sw > 0 && sh > 0) {
            const sizeRatio = sw / sh;
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

    const recommendedNonDigital = withMatch
      .filter((p) => !p.isDigital && p.isRecommended)
      .sort((a, b) => a.ratioDiff - b.ratioDiff);

    const recommendedCutoff = recommendedNonDigital.length > 0
      ? Math.min(0.25, recommendedNonDigital[Math.min(5, recommendedNonDigital.length - 1)].ratioDiff)
      : 0;

    return [...withMatch].sort((a, b) => {
      // 1) Digital products always first
      if (!!a.isDigital !== !!b.isDigital) return a.isDigital ? -1 : 1;

      // 2) For non-digital, recommended products first (closest sizes)
      const aRec = !a.isDigital && a.isRecommended && a.ratioDiff <= recommendedCutoff;
      const bRec = !b.isDigital && b.isRecommended && b.ratioDiff <= recommendedCutoff;
      if (aRec !== bRec) return aRec ? -1 : 1;

      // 3) Within recommended, closest ratio first
      if (aRec && bRec && a.ratioDiff !== b.ratioDiff) return a.ratioDiff - b.ratioDiff;

      // 4) Then the rest alphabetically
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [products, selectedPhoto]);

  const recommendedProductIds = useMemo(() => {
    const nonDigital = orderedProducts.filter((p) => !p.isDigital);
    if (nonDigital.length === 0) return new Set<number>();
    const recommended = nonDigital.filter((p) => p.isRecommended).sort((a, b) => a.ratioDiff - b.ratioDiff);
    if (recommended.length === 0) return new Set<number>();
    const cutoff = Math.min(0.25, recommended[Math.min(5, recommended.length - 1)].ratioDiff);
    return new Set(nonDigital.filter((p) => p.isRecommended && p.ratioDiff <= cutoff).map((p) => p.id));
  }, [orderedProducts]);

  const productsBySection = useMemo(() => {
    const digital = orderedProducts.filter((p) => p.isDigital);
    const recommended = orderedProducts.filter((p) => !p.isDigital && recommendedProductIds.has(p.id));
    const remaining = orderedProducts.filter((p) => !p.isDigital && !recommendedProductIds.has(p.id));
    return { digital, recommended, remaining };
  }, [orderedProducts, recommendedProductIds]);

  const getDefaultSize = (product: ProductWithMatch): ProductSize | null => {
    if (product.bestSize) return product.bestSize;
    return Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes[0] : null;
  };

  const getCropAspectRatio = (product: ProductWithMatch | null): number => {
    if (!product) return NaN;
    const size = getDefaultSize(product);
    const width = Number(size?.width || 0);
    const height = Number(size?.height || 0);
    if (width > 0 && height > 0) {
      return width / height;
    }
    return NaN;
  };

  const handleAddToCart = async (product: ProductWithMatch) => {
    if (!selectedPhoto) return;
    setProductToCrop(product);
    setShowCropModal(true);
  };

  const handleCropConfirm = async () => {
    if (!selectedPhoto || !productToCrop) return;
    const size = getDefaultSize(productToCrop);
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
        <Link to="/albums" className="btn btn-secondary" style={{ marginBottom: 12 }}>← Back to Albums</Link>
        <h1 className="gradient-text" style={{ marginBottom: 6 }}>{album.name}</h1>
        {album.description && <p className="albums-description" style={{ marginTop: 0 }}>{album.description}</p>}
      </div>

      {selectedPhoto && (
        <div style={{ marginBottom: 14, border: '1px solid #2a2740', borderRadius: 8, overflow: 'hidden' }}>
          <img
            src={selectedPhoto.fullImageUrl || selectedPhoto.thumbnailUrl}
            alt={selectedPhoto.fileName}
            style={{ width: '100%', maxHeight: 520, objectFit: 'contain', background: '#0f0f16' }}
          />
        </div>
      )}

      {selectedPhoto && (
        <div style={{ marginBottom: 16, border: '1px solid #2a2740', borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Order this photo</h3>
          {addMessage && <div style={{ marginBottom: 8, color: addMessage.includes('Failed') ? '#ff9a9a' : '#79d279' }}>{addMessage}</div>}

          {orderedProducts.length === 0 ? (
            <div style={{ color: '#999' }}>No products available for this album.</div>
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
                        <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: '1px solid #232036', borderRadius: 6, padding: '8px 10px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong>{product.name}</strong>
                              <span className="badge">Digital</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#aaa' }}>
                              {defaultSize
                                ? `${defaultSize.name}${defaultSize.width && defaultSize.height ? ` (${defaultSize.width}x${defaultSize.height})` : ''}`
                                : 'No size available'}
                            </div>
                          </div>
                          <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 700 }}>
                            ${Number(defaultSize?.price || 0).toFixed(2)}
                          </div>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!defaultSize || addingKey === rowKey}
                            onClick={() => handleAddToCart(product)}
                          >
                            {addingKey === rowKey ? 'Adding...' : 'Add to Cart'}
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
                    {productsBySection.recommended.map((product) => {
                      const defaultSize = getDefaultSize(product);
                      const rowKey = `${product.id}-${defaultSize?.id || 0}`;
                      return (
                        <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: '1px solid #232036', borderRadius: 6, padding: '8px 10px', background: 'rgba(123, 97, 255, 0.05)' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong>{product.name}</strong>
                              <span className="badge" style={{ background: '#2e2a52' }}>Recommended</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#aaa' }}>
                              {defaultSize
                                ? `${defaultSize.name}${defaultSize.width && defaultSize.height ? ` (${defaultSize.width}x${defaultSize.height})` : ''}`
                                : 'No size available'}
                            </div>
                          </div>
                          <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 700 }}>
                            ${Number(defaultSize?.price || 0).toFixed(2)}
                          </div>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!defaultSize || addingKey === rowKey}
                            onClick={() => handleAddToCart(product)}
                          >
                            {addingKey === rowKey ? 'Adding...' : 'Add to Cart'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All Products Section */}
              {productsBySection.remaining.length > 0 && (
                <div>
                  <h4 style={{ marginTop: 0, marginBottom: 10, color: '#7b61ff', fontSize: 14, fontWeight: 600 }}>All Products</h4>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {productsBySection.remaining.map((product) => {
                      const defaultSize = getDefaultSize(product);
                      const rowKey = `${product.id}-${defaultSize?.id || 0}`;
                      return (
                        <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: '1px solid #232036', borderRadius: 6, padding: '8px 10px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong>{product.name}</strong>
                            </div>
                            <div style={{ fontSize: 12, color: '#aaa' }}>
                              {defaultSize
                                ? `${defaultSize.name}${defaultSize.width && defaultSize.height ? ` (${defaultSize.width}x${defaultSize.height})` : ''}`
                                : 'No size available'}
                            </div>
                          </div>
                          <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 700 }}>
                            ${Number(defaultSize?.price || 0).toFixed(2)}
                          </div>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!defaultSize || addingKey === rowKey}
                            onClick={() => handleAddToCart(product)}
                          >
                            {addingKey === rowKey ? 'Adding...' : 'Add to Cart'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="empty-state">No photos in this album yet.</div>
      ) : (
        <div className="albums-grid">
          {photos.map((photo) => (
            <Link
              key={photo.id}
              to={`?photo=${photo.id}`}
              className="album-card"
              style={{ padding: 0, overflow: 'hidden', border: selectedPhotoId === photo.id ? '2px solid #7b61ff' : undefined }}
            >
              <img
                src={photo.thumbnailUrl || photo.fullImageUrl}
                alt={photo.fileName}
                style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
              />
            </Link>
          ))}
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
                src={selectedPhoto.fullImageUrl || selectedPhoto.thumbnailUrl}
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


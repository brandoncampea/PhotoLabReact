import React, { useRef, useState, useEffect } from 'react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import { Photo, CropData, Product, ProductSize, Watermark } from '../types';
import { useCart } from '../contexts/CartContext';
import { productService } from '../services/productService';
import { watermarkService } from '../services/watermarkService';
import { photoService } from '../services/photoService';
import WatermarkedImage from './WatermarkedImage';

interface CropperModalProps {
  photo: Photo;
  onClose: () => void;
  editMode?: boolean;
  existingCropData?: CropData;
  existingQuantity?: number;
  existingProductId?: number;
  existingProductSizeId?: number;
}

const CropperModal: React.FC<CropperModalProps> = ({ 
  photo, 
  onClose, 
  editMode = false,
  existingCropData,
  existingQuantity = 1,
  existingProductId,
  existingProductSizeId
}) => {
  const cropperRef = useRef<ReactCropperElement>(null);
  const { addToCart, updateCropData } = useCart();
  const [quantity, setQuantity] = useState(existingQuantity);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoAspectRatio, setPhotoAspectRatio] = useState<number | null>(null);
  const [watermark, setWatermark] = useState<Watermark | null>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [tab, setTab] = useState<'recommended' | 'all'>('recommended');

  useEffect(() => {
    loadProducts();
    loadPhotoAspectRatio();
    loadWatermark();
    loadRecommendations();
  }, []);

  useEffect(() => {
    // If no recommended products exist, default to 'all' tab
    const recommendedProductIds = recommendations?.recommendations?.map((rec: any) => rec.id) || [];
    if (recommendedProductIds.length === 0) {
      setTab('all');
    } else {
      setTab('recommended');
    }
  }, [recommendations]);

  const loadPhotoAspectRatio = () => {
    const img = new Image();
    img.onload = () => {
      setPhotoAspectRatio(img.width / img.height);
    };
    img.src = photo.fullImageUrl;
  };

  const loadWatermark = async () => {
    try {
      const defaultWatermark = await watermarkService.getDefaultWatermark();
      setWatermark(defaultWatermark);
    } catch (error) {
      console.error('Failed to load watermark:', error);
    }
  };

  const loadRecommendations = async () => {
    if (!photo.id) return;
    
    try {
      const data = await photoService.getRecommendations(photo.id);
      setRecommendations(data);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await productService.getActiveProducts();
      // Sort by popularity (highest first)
      const sorted = [...data].sort((a, b) => b.popularity - a.popularity);
      setProducts(sorted);
      
      // In edit mode, select the existing product and size
      if (editMode && existingProductId && existingProductSizeId) {
        const product = sorted.find(p => p.id === existingProductId);
        if (product) {
          setSelectedProduct(product);
          const size = product.sizes.find(s => s.id === existingProductSizeId);
          if (size) {
            setSelectedSize(size);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    const sortedSizes = getSortedSizes(product.sizes);
    if (sortedSizes.length > 0) {
      setSelectedSize(sortedSizes[0]);
    }
  };

  const getSortedSizes = (sizes: ProductSize[]) => {
    if (!photoAspectRatio) return sizes;
    
    return [...sizes].sort((a, b) => {
      const aRatio = a.width / a.height;
      const bRatio = b.width / b.height;
      const aDiff = Math.abs(aRatio - photoAspectRatio);
      const bDiff = Math.abs(bRatio - photoAspectRatio);
      return aDiff - bDiff;
    });
  };

  const isRecommendedSize = (size: ProductSize): boolean => {
    if (!photoAspectRatio) return false;
    
    const sizeRatio = size.width / size.height;
    const diff = Math.abs(sizeRatio - photoAspectRatio);
    
    // Consider it recommended if aspect ratio difference is less than 15%
    return diff < 0.15;
  };

  const handleSizeSelect = (size: ProductSize) => {
    setSelectedSize(size);
  };

  useEffect(() => {
    if (selectedSize && cropperRef.current?.cropper) {
      const aspectRatio = selectedSize.width / selectedSize.height;
      const cropper = cropperRef.current.cropper;
      cropper.setAspectRatio(aspectRatio);
      
      // In edit mode, restore existing crop data (stored as percentages)
      if (editMode && existingCropData) {
        const imageData = cropper.getImageData();
        const toPixels = (value: number, dimension: number) => (value / 100) * dimension;

        cropper.setData({
          x: toPixels(existingCropData.x, imageData.naturalWidth),
          y: toPixels(existingCropData.y, imageData.naturalHeight),
          width: toPixels(existingCropData.width, imageData.naturalWidth),
          height: toPixels(existingCropData.height, imageData.naturalHeight),
          rotate: existingCropData.rotate,
          scaleX: existingCropData.scaleX,
          scaleY: existingCropData.scaleY
        });
      }
    }
  }, [selectedSize, editMode, existingCropData]);

  const getAspectRatio = () => {
    if (selectedSize) {
      return selectedSize.width / selectedSize.height;
    }
    return 4 / 3;
  };

  const getTotalPrice = () => {
    if (selectedProduct && selectedSize) {
      return selectedSize.price * quantity;
    }
    return 0;
  };

  const handleAddToCart = () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper || !selectedProduct || !selectedSize) {
      alert('Please select a product and size');
      return;
    }

    const rawCropData = cropper.getData();
    
    // Validate that crop has been applied (not full image)
    const imageData = cropper.getImageData();
    const cropBoxData = cropper.getCropBoxData();
    
    // Check if the crop box is smaller than the full image (allowing for small rounding errors)
    const isCropped = 
      Math.abs(cropBoxData.width - imageData.naturalWidth) > 5 ||
      Math.abs(cropBoxData.height - imageData.naturalHeight) > 5 ||
      rawCropData.x > 5 ||
      rawCropData.y > 5;

    if (!isCropped) {
      alert('Please crop the image to match your selected product size before adding to cart');
      return;
    }
    
    // Normalize crop data to percentages so previews render correctly on thumbnails
    const toPercent = (value: number, dimension: number) => (value / dimension) * 100;
    const normalizedCropData: CropData = {
      x: toPercent(rawCropData.x, imageData.naturalWidth),
      y: toPercent(rawCropData.y, imageData.naturalHeight),
      width: toPercent(rawCropData.width, imageData.naturalWidth),
      height: toPercent(rawCropData.height, imageData.naturalHeight),
      rotate: rawCropData.rotate,
      scaleX: rawCropData.scaleX,
      scaleY: rawCropData.scaleY,
    };

    if (editMode) {
      // Update existing item's crop data
      updateCropData(photo.id, normalizedCropData);
    } else {
      // Add new item to cart
      addToCart(photo, quantity, normalizedCropData, selectedProduct.id, selectedSize.id);
    }
    
    onClose();
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content cropper-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body">
            <div className="loading">Loading products...</div>
          </div>
        </div>
      </div>
    );
  }

  // Product selection screen
  if (!selectedProduct) {
    const recommendedProductIds = recommendations?.recommendations?.map((rec: any) => rec.id) || [];
    const recommendedProducts = products.filter(p => recommendedProductIds.includes(p.id));
    const otherProducts = products.filter(p => !recommendedProductIds.includes(p.id));
    const allProducts = tab === 'recommended' ? recommendedProducts : otherProducts;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content cropper-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px' }}>
          <div className="modal-header">
            <h2>{editMode ? 'Edit Crop' : 'Select Product'}</h2>
            <button onClick={onClose} className="btn-close">
              ×
            </button>
          </div>

          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '40% 1fr', gap: '2rem', padding: '2rem' }}>
            {/* LEFT COLUMN: Photo Preview & Metadata */}
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: '320px',
                  height: '320px',
                  margin: '0 auto 0.5rem auto',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  backgroundColor: '#f4f6f8'
                }}
              >
                <WatermarkedImage
                  src={photo.thumbnailUrl}
                  alt={photo.fileName}
                  fill={false}
                  style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain', display: 'block' }}
                />
              </div>
              <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#333' }}>{photo.fileName}</p>
                {photo.metadata && (
                  <div style={{ fontSize: '0.875rem', color: '#666', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {photo.metadata.cameraMake && (
                      <div>
                        <strong>Camera:</strong> {photo.metadata.cameraMake}
                      </div>
                    )}
                    {photo.metadata.dateTaken && (
                      <div>
                        <strong>Date:</strong> {new Date(photo.metadata.dateTaken).toLocaleDateString()}
                      </div>
                    )}
                    {photo.metadata.width && photo.metadata.height && (
                      <div>
                        <strong>Size:</strong> {photo.metadata.width} × {photo.metadata.height}px
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Recommendations & Products */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Tabs */}
              {products.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e0e0e0' }}>
                  {recommendedProducts.length > 0 && (
                    <button
                      onClick={() => setTab('recommended')}
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: tab === 'recommended' ? '#4169E1' : 'transparent',
                        color: tab === 'recommended' ? '#fff' : '#666',
                        border: 'none',
                        borderBottom: tab === 'recommended' ? '3px solid #4169E1' : 'none',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        transition: 'all 0.2s'
                      }}
                    >
                      ⭐ Recommended ({recommendedProducts.length})
                    </button>
                  )}
                  <button
                    onClick={() => setTab('all')}
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: tab === 'all' ? '#4169E1' : 'transparent',
                      color: tab === 'all' ? '#fff' : '#666',
                      border: 'none',
                      borderBottom: tab === 'all' ? '3px solid #4169E1' : 'none',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    All Products ({products.length})
                  </button>
                </div>
              )}

              {/* Product Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', maxHeight: '70vh', overflowY: 'auto' }}>
                {allProducts.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                    {tab === 'recommended' ? 'No recommended products' : 'No products available'}
                  </div>
                ) : (
                  allProducts.map(product => {
                    const isRecommended = recommendedProductIds.includes(product.id);
                    const rec = recommendations?.recommendations?.find((r: any) => r.id === product.id);
                    
                    return (
                      <div
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        style={{
                          border: isRecommended ? '2px solid #4169E1' : '2px solid #e0e0e0',
                          borderRadius: '8px',
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          backgroundColor: isRecommended ? '#f0f7ff' : '#fff',
                          display: 'flex',
                          gap: '0.75rem',
                          alignItems: 'flex-start',
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#4169E1';
                          e.currentTarget.style.transform = 'translateX(2px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = isRecommended ? '#4169E1' : '#e0e0e0';
                          e.currentTarget.style.transform = 'translateX(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        {isRecommended && (
                          <div style={{
                            position: 'absolute',
                            top: '0.5rem',
                            left: '0.5rem',
                            backgroundColor: '#4169E1',
                            color: '#fff',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700
                          }}>
                            RECOMMENDED
                          </div>
                        )}
                        <div style={{ flex: 1, paddingTop: isRecommended ? '1.5rem' : '0' }}>
                          <h4 style={{ margin: '0 0 0.25rem 0', color: '#333', fontSize: '0.95rem' }}>{product.name}</h4>
                          <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.85rem' }}>{product.description}</p>
                          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', fontWeight: 600, color: '#4169E1' }}>
                            From ${Math.min(...product.sizes.map(s => s.price)).toFixed(2)}
                          </p>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#888' }}>
                            {product.sizes.length} sizes
                          </p>
                          {rec && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>
                              Match: {rec.matchQuality}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cropper screen
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content cropper-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{editMode ? 'Edit Crop' : 'Crop & Order Photo'}</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#666' }}>
              {selectedProduct.name} - {selectedSize?.name}
            </p>
          </div>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button 
              onClick={() => setSelectedProduct(null)}
              className="btn btn-secondary"
              style={{ fontSize: '0.9rem' }}
            >
              ← Change Product
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
              {getSortedSizes(selectedProduct.sizes).map(size => {
                const recommended = isRecommendedSize(size);
                return (
                  <button
                    key={size.id}
                    onClick={() => handleSizeSelect(size)}
                    className="btn"
                    style={{
                      backgroundColor: selectedSize?.id === size.id ? '#4169E1' : '#fff',
                      color: selectedSize?.id === size.id ? '#fff' : '#333',
                      border: recommended ? '2px solid #10b981' : '1px solid #ddd',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem',
                      position: 'relative'
                    }}
                  >
                    {size.name} (${size.price.toFixed(2)})
                    {recommended && (
                      <span style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: '#10b981',
                        color: '#fff',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '3px',
                        fontWeight: 600
                      }}>
                        ✓ Best Fit
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cropper-container" style={{ position: 'relative', overflow: 'hidden' }}>
            <Cropper
              ref={cropperRef}
              src={photo.fullImageUrl}
              style={{ height: 400, width: '100%' }}
              initialAspectRatio={getAspectRatio()}
              aspectRatio={getAspectRatio()}
              guides={true}
              viewMode={1}
              minCropBoxHeight={10}
              minCropBoxWidth={10}
              background={false}
              responsive={true}
              autoCropArea={1}
              checkOrientation={false}
            />
            {watermark && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 10,
                  overflow: 'hidden',
                  display: 'flex',
                  justifyContent: watermark.position.includes('right') ? 'flex-end' : watermark.position.includes('left') ? 'flex-start' : 'center',
                  alignItems: watermark.position.includes('bottom') ? 'flex-end' : watermark.position.includes('top') ? 'flex-start' : 'center',
                  padding: watermark.tiled ? 0 : '10px',
                  ...(watermark.tiled
                    ? {
                        backgroundImage: `url(${watermark.imageUrl})`,
                        backgroundRepeat: 'repeat',
                        backgroundSize: '200px auto',
                        backgroundPosition: 'center',
                        opacity: watermark.opacity,
                      }
                    : {}),
                }}
              >
                {!watermark.tiled && (
                  <img
                    src={watermark.imageUrl}
                    alt="Watermark"
                    style={{
                      maxWidth: '35%',
                      maxHeight: '35%',
                      opacity: watermark.opacity,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {watermark && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: '#0369a1',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
              <span>
                <strong>Note:</strong> Watermarks are for preview only and will be removed from all purchased photos.
              </span>
            </div>
          )}

          <div className="cropper-controls">
            <div className="quantity-control">
              <label htmlFor="quantity">Quantity:</label>
              <div className="quantity-input">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="quantity-btn"
                >
                  -
                </button>
                <input
                  type="number"
                  id="quantity"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="quantity-btn"
                >
                  +
                </button>
              </div>
            </div>

            <div className="price-info">
              <span className="photo-price">
               ${(selectedSize?.price ?? 0).toFixed(2)} each
              </span>
              <span className="total-price">
                Total: ${getTotalPrice().toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={handleAddToCart} className="btn btn-primary">
            {editMode ? 'Update Crop' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CropperModal;

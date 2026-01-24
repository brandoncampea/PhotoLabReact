import React, { useRef, useState, useEffect } from 'react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import { Photo, CropData, Product, ProductSize, Watermark } from '../types';
import { useCart } from '../contexts/CartContext';
import { productService } from '../services/productService';
import { watermarkService } from '../services/watermarkService';
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

  useEffect(() => {
    loadProducts();
    loadPhotoAspectRatio();
    loadWatermark();
  }, []);

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
      cropperRef.current.cropper.setAspectRatio(aspectRatio);
      
      // In edit mode, restore existing crop data
      if (editMode && existingCropData) {
        cropperRef.current.cropper.setData({
          x: existingCropData.x,
          y: existingCropData.y,
          width: existingCropData.width,
          height: existingCropData.height,
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
      return (selectedProduct.basePrice + selectedSize.priceModifier) * quantity;
    }
    return 0;
  };

  const handleAddToCart = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper && selectedProduct && selectedSize) {
      const cropData = cropper.getData() as CropData;
      
      if (editMode) {
        // Update existing item's crop data
        updateCropData(photo.id, cropData);
      } else {
        // Add new item to cart
        addToCart(photo, quantity, cropData, selectedProduct.id, selectedSize.id);
      }
      
      onClose();
    }
  };

  const handleAddWithoutCrop = () => {
    if (selectedProduct && selectedSize) {
      addToCart(photo, quantity, undefined, selectedProduct.id, selectedSize.id);
      onClose();
    }
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
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content cropper-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{editMode ? 'Edit Crop' : 'Select Product'}</h2>
            <button onClick={onClose} className="btn-close">
              ×
            </button>
          </div>

          <div className="modal-body">
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ width: '100%', maxHeight: '200px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '0.5rem' }}>
                <WatermarkedImage
                  src={photo.thumbnailUrl}
                  alt={photo.fileName}
                  style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }}
                />
              </div>
              <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#333' }}>{photo.fileName}</p>
                {photo.metadata && (
                  <div style={{ fontSize: '0.875rem', color: '#666', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                    {photo.metadata.cameraMake && (
                      <div>
                        <strong>Camera:</strong> {photo.metadata.cameraMake} {photo.metadata.cameraModel}
                      </div>
                    )}
                    {photo.metadata.dateTaken && (
                      <div>
                        <strong>Date:</strong> {new Date(photo.metadata.dateTaken).toLocaleDateString()}
                      </div>
                    )}
                    {photo.metadata.iso && (
                      <div>
                        <strong>ISO:</strong> {photo.metadata.iso}
                      </div>
                    )}
                    {photo.metadata.aperture && (
                      <div>
                        <strong>Aperture:</strong> f/{photo.metadata.aperture}
                      </div>
                    )}
                    {photo.metadata.shutterSpeed && (
                      <div>
                        <strong>Shutter:</strong> {photo.metadata.shutterSpeed}
                      </div>
                    )}
                    {photo.metadata.focalLength && (
                      <div>
                        <strong>Focal Length:</strong> {photo.metadata.focalLength}mm
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
            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
              Choose a product type to crop your photo to the correct proportions:
            </p>
            <div className="product-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '1rem' 
            }}>
              {products.map(product => (
                <div 
                  key={product.id}
                  onClick={() => handleProductSelect(product)}
                  style={{
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: '#fff',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#4169E1';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e0e0e0';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {product.isDigital && (
                    <div style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      💾 Digital
                    </div>
                  )}
                  <h3 style={{ marginBottom: '0.5rem', color: '#333' }}>{product.name}</h3>
                  <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
                    {product.description}
                  </p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#4169E1' }}>
                    From ${product.basePrice.toFixed(2)}
                  </p>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#888' }}>
                    {product.sizes.length} sizes available
                    {product.isDigital && ' • Instant delivery'}
                  </p>
                </div>
              ))}
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
                    {size.name} (${(selectedProduct.basePrice + size.priceModifier).toFixed(2)})
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

          <div className="cropper-container" style={{ position: 'relative' }}>
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
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 10,
                  display: 'flex',
                  justifyContent: watermark.position.includes('right') ? 'flex-end' : watermark.position.includes('left') ? 'flex-start' : 'center',
                  alignItems: watermark.position.includes('bottom') ? 'flex-end' : watermark.position.includes('top') ? 'flex-start' : 'center',
                  padding: watermark.tiled ? 0 : '10px',
                  ...(watermark.tiled ? {
                    backgroundImage: `url(${watermark.imageUrl})`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '200px auto',
                    backgroundPosition: 'center',
                    opacity: watermark.opacity,
                  } : {}),
                }}
              >
                {!watermark.tiled && (
                  <img
                    src={watermark.imageUrl}
                    alt="Watermark"
                    style={{
                      maxWidth: '40%',
                      maxHeight: '40%',
                      opacity: watermark.opacity,
                      objectFit: 'contain',
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
                ${(selectedProduct.basePrice + (selectedSize?.priceModifier || 0)).toFixed(2)} each
              </span>
              <span className="total-price">
                Total: ${getTotalPrice().toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {!editMode && (
            <button onClick={handleAddWithoutCrop} className="btn btn-secondary">
              Add Without Crop
            </button>
          )}
          <button onClick={handleAddToCart} className="btn btn-primary">
            {editMode ? 'Update Crop' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CropperModal;

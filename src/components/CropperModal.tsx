
import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import MultiPhotoSelector from './MultiPhotoSelector';
import { Photo, CropData } from '../types';
import WatermarkedImage from './WatermarkedImage';
function CropperModal(props: any) {
  // TEMPORARY STUBS TO ALLOW COMPILATION
  // Remove or replace with real implementations as needed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleProductSelect = (product: any) => {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSortedSizes = (sizes: any[]) => sizes || [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isRecommendedSize = (size: any) => false;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSizeSelect = (size: any) => {};
  const cropperRef: any = { current: null };
  const getAspectRatio = () => 1;
  const watermark: any = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setQuantity = (q: number) => {};
  const getTotalPrice = () => 0;
  const handleAddToCart = () => {};
  const showMultiPhotoSelector = false;
  // Local state for products, loading, and error
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');

  // Debug: log products and error state
  useEffect(() => {
    console.log('[CropperModal] products:', products);
    if (productsError) {
      console.error('[CropperModal] productsError:', productsError);
    }
  }, [products, productsError]);


  // Destructure all required props
  const {
    recommendations = { recommendations: [] },
    setTab = () => {},
    photoService,
    photo,
    setPhotoAspectRatio,
    productService,
    // setProducts, // no longer needed
    loading,
    selectedProduct,
    onClose,
    editMode,
    selectedSize,
    quantity,
    albumPhotos,
    selectedPackage,
    addToCart,
    // ...add any other props needed by this component
    setSelectedProduct = () => {},
  } = props;


  // Load products when modal opens if not already loaded
  useEffect(() => {
    console.log('[CropperModal] useEffect fired:', {
      productsLength: products.length,
      hasProductService: !!productService,
      albumId: photo?.albumId
    });
    if (products.length === 0 && productService && photo?.albumId) {
      setProductsLoading(true);
      setProductsError('');
      console.log('[CropperModal] Fetching products for albumId:', photo.albumId);
      (async () => {
        try {
          const productsData = await productService.getActiveProducts(photo.albumId);
          console.log('[CropperModal] products API response:', productsData);
          setProducts(productsData);
        } catch (error: any) {
          setProductsError('Failed to load products: ' + (typeof error === 'object' && 'message' in error ? error.message : error?.toString() || 'Unknown error'));
          console.error('[CropperModal] Failed to load products:', error);
        } finally {
          setProductsLoading(false);
        }
      })();
    }
  }, [products.length, productService, photo?.albumId]);

  useEffect(() => {
    // If no recommended products exist, default to 'all' tab
    const recommendedProductIds = recommendations?.recommendations?.map((rec: any) => rec.id) || [];
    if (recommendedProductIds.length === 0) {
      setTab('all');
    }
  }, [recommendations]);

  // Always render modal in a portal to document.body
  // Move function definitions to top-level
  const loadPhotoAspectRatio = async () => {
    try {
      const data = await photoService.getPhotoAspectRatio(photo.albumId);
      setPhotoAspectRatio(data.aspectRatio);
    } catch (error) {
      console.error('Failed to load photo aspect ratio:', error);
    }
  };

  const loadRecommendations = async () => {
    try {
      // Fetch all products
      const productsData = await productService.getProducts();
      setProducts(productsData);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    }
  };

  // ...existing code (modalContent, returns, etc.)...


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
    // Always include digital products in recommended
    const recommendedProducts = products.filter(
      (p: any) => recommendedProductIds.includes(p.id) || p.isDigital
    );
    const otherProducts = products.filter(
      p => !recommendedProducts.includes(p)
    );

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content cropper-modal"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: '1200px',
            width: '95%',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div className="modal-header">
            <h2>{editMode ? 'Edit Crop' : 'Select Product'}</h2>
            <button onClick={onClose} className="btn-close">
              ×
            </button>
          </div>

          <div
            className="modal-body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(280px, 40%) minmax(0, 1fr)',
              gap: '2rem',
              padding: '2rem',
              height: 'calc(90vh - 140px)',
              minHeight: 0,
              overflow: 'hidden',
              alignItems: 'start'
            }}
          >
            {/* LEFT COLUMN: Photo Preview & Metadata */}
            <div style={{ marginBottom: '1rem', minHeight: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, height: '100%', overflow: 'hidden' }}>
              {/* Loading/Error State for Products */}
              {productsLoading && (
                <div style={{ color: '#4169E1', fontWeight: 600, textAlign: 'center', marginBottom: '1rem' }}>
                  Loading products...
                </div>
              )}
              {productsError && (
                <div style={{ color: 'red', fontWeight: 600, textAlign: 'center', marginBottom: '1rem' }}>
                  {productsError}
                </div>
              )}
              {/* Instruction if nothing selected */}
              {!selectedProduct && !productsLoading && !productsError && (
                <div style={{
                  background: '#fffbe6',
                  color: '#b45309',
                  border: '1.5px solid #fde68a',
                  borderRadius: 8,
                  padding: '1rem',
                  marginBottom: '1rem',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  textAlign: 'center',
                  boxShadow: '0 2px 8px rgba(253,230,138,0.10)'
                }}>
                  Select a product to begin ordering.
                </div>
              )}
              {/* Recommended Products */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#4169E1', margin: '0 0 0.5rem 0' }}>Recommended Products</h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '0.75rem',
                  border: recommendedProducts.length === 0 ? '2px solid #fde68a' : undefined,
                  boxShadow: recommendedProducts.length === 0 ? '0 0 0 2px #fde68a55' : undefined,
                  borderRadius: 8,
                  padding: recommendedProducts.length === 0 ? '1rem' : 0
                }}>
                  {recommendedProducts.length === 0 ? (
                    <div style={{ color: '#999', textAlign: 'center' }}>No recommended products</div>
                  ) : (
                    recommendedProducts.map(product => {
                       const rec = recommendations?.recommendations?.find((r: any) => r.id === product.id);
                      return (
                        <div
                           key={product.id}
                           onClick={() => handleProductSelect(product)}
                          style={{
                            border: '2px solid #4169E1',
                            borderRadius: '8px',
                            padding: '1rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            backgroundColor: '#f0f7ff',
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
                            e.currentTarget.style.borderColor = '#4169E1';
                            e.currentTarget.style.transform = 'translateX(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={{ flex: 1, paddingTop: '1.5rem' }}>
                             <h4 style={{ margin: '0 0 0.25rem 0', color: '#333', fontSize: '0.95rem' }}>{product.name}</h4>
                             <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.85rem' }}>{product.description}</p>
                            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', fontWeight: 600, color: '#4169E1' }}>
                               From ${Math.min(...product.sizes.map((s: any) => s.price)).toFixed(2)}
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
              {/* All Other Products */}
              <div>
                <h3 style={{ fontSize: '1.1rem', color: '#333', margin: '0 0 0.5rem 0' }}>All Other Products</h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '0.75rem',
                  border: otherProducts.length === 0 ? '2px solid #fde68a' : undefined,
                  boxShadow: otherProducts.length === 0 ? '0 0 0 2px #fde68a55' : undefined,
                  borderRadius: 8,
                  padding: otherProducts.length === 0 ? '1rem' : 0
                }}>
                  {otherProducts.length === 0 ? (
                    <div style={{ color: '#999', textAlign: 'center' }}>No other products</div>
                  ) : (
                    otherProducts.map(product => {
                      return (
                        <div
                           key={product.id}
                           onClick={() => handleProductSelect(product)}
                          style={{
                            border: '2px solid #e0e0e0',
                            borderRadius: '8px',
                            padding: '1rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            backgroundColor: '#fff',
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
                            e.currentTarget.style.borderColor = '#e0e0e0';
                            e.currentTarget.style.transform = 'translateX(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={{ flex: 1 }}>
                             <h4 style={{ margin: '0 0 0.25rem 0', color: '#333', fontSize: '0.95rem' }}>{product.name}</h4>
                             <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.85rem' }}>{product.description}</p>
                            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', fontWeight: 600, color: '#4169E1' }}>
                               From ${Math.min(...product.sizes.map((s: any) => s.price)).toFixed(2)}
                            </p>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#888' }}>
                               {product.sizes.length} sizes
                            </p>
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
      </div>
    );
  }

  // Multi-photo selector screen
  if (showMultiPhotoSelector && selectedProduct && selectedSize) {
    const handleMultiPhotoComplete = (photos: { photo: Photo; cropData: CropData; position: number }[]) => {
      // Add multi-photo item to cart
      addToCart(
        photos[0].photo, // Primary photo
        photos[0].cropData,
        selectedProduct,
        selectedSize,
        quantity,
        photos.map(p => p.photo.id), // All photo IDs
        photos // All photos with crop data
      );
      onClose();
    };

    return ReactDOM.createPortal(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content cropper-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', width: '95%', height: '90vh' }}>
          <MultiPhotoSelector
            product={selectedProduct}
            selectedSize={selectedSize}
            availablePhotos={albumPhotos}
            initialPhoto={photo}
            onComplete={handleMultiPhotoComplete}
            onCancel={onClose}
          />
        </div>
      </div>,
      document.body
    );
  }

  // Cropper screen
  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content cropper-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{editMode ? 'Edit Crop' : selectedPackage ? 'Crop Photo for Package' : 'Crop & Order Photo'}</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#666' }}>
              {selectedPackage ? (
                <span style={{ color: '#ff6b35', fontWeight: 'bold' }}>
                  Package: {selectedPackage.name} (${selectedPackage.packagePrice.toFixed(2)})
                </span>
              ) : (
                <>{selectedProduct.name} - {selectedSize?.name}</>
              )}
            </p>
          </div>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {selectedPackage && (
            <div style={{
              backgroundColor: '#fff3e0',
              border: '2px solid #ff6b35',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#ff6b35' }}>📦 {selectedPackage.name}</h4>
              <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.5rem 0' }}>{selectedPackage.description}</p>
              <div style={{ fontSize: '0.85rem', color: '#333' }}>
                <strong>This package includes:</strong>
                <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.5rem' }}>
                   {selectedPackage?.items?.map((item: any, idx: number) => (
                    <li key={idx}>
                      {item.quantity}x {item.product?.name} - {item.productSize?.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!selectedPackage && (
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button 
               onClick={() => setSelectedProduct && setSelectedProduct(null)}
              className="btn btn-secondary"
              style={{ fontSize: '0.9rem' }}
            >
              ← Change Product
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
               {selectedProduct && getSortedSizes(selectedProduct.sizes).map((size: any) => {
                 const recommended = isRecommendedSize && isRecommendedSize(size);
                return (
                  <button
                    key={size.id}
                     onClick={() => handleSizeSelect && handleSizeSelect(size)}
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
            )}

          <div className="cropper-container" style={{ position: 'relative', overflow: 'hidden' }}>
             <Cropper
               ref={cropperRef as any}
              src={photo.fullImageUrl}
              style={{ height: 400, width: '100%' }}
               initialAspectRatio={getAspectRatio && getAspectRatio()}
               aspectRatio={getAspectRatio && getAspectRatio()}
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
                   justifyContent: watermark && watermark.position.includes('right') ? 'flex-end' : watermark && watermark.position.includes('left') ? 'flex-start' : 'center',
                   alignItems: watermark && watermark.position.includes('bottom') ? 'flex-end' : watermark && watermark.position.includes('top') ? 'flex-start' : 'center',
                   padding: watermark && watermark.tiled ? 0 : '10px',
                   ...((watermark && watermark.tiled)
                    ? {
                         backgroundImage: `url(${watermark && watermark.imageUrl})`,
                        backgroundRepeat: 'repeat',
                        backgroundSize: '200px auto',
                        backgroundPosition: 'center',
                         opacity: watermark && watermark.opacity,
                      }
                    : {}),
                }}
              >
                 {watermark && !watermark.tiled && (
                  <img
                     src={watermark && watermark.imageUrl}
                    alt="Watermark"
                    style={{
                      maxWidth: '35%',
                      maxHeight: '35%',
                       opacity: watermark && watermark.opacity,
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
                   onClick={() => setQuantity && setQuantity(Math.max(1, quantity - 1))}
                  className="quantity-btn"
                >
                  -
                </button>
                <input
                  type="number"
                  id="quantity"
                  min="1"
                  value={quantity}
                   onChange={(e) => setQuantity && setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button
                   onClick={() => setQuantity && setQuantity(quantity + 1)}
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
                 Total: ${(getTotalPrice && getTotalPrice().toFixed(2))}
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
    </div>,
    document.body
  );
};
export default CropperModal;

import React, { useState } from 'react';
import { mpixService } from '../services/mpixService';
import { priceListAdminService } from '../services/priceListAdminService';
import { PriceList } from '../types';

interface MpixProduct {
  productUID: number;
  productId: number;
  name: string;
  description?: string;
  basePrice: number;
  width?: number;
  height?: number;
  category?: string;
}

interface ImportMapping {
  productUID: number;
  selectedSizeId?: number;
  customPrice?: number;
  useCustomPrice: boolean;
  markupPercentage?: number;
}

const AdminMpixImport: React.FC<{ onClose: () => void; onImportComplete: () => void }> = ({ onClose, onImportComplete }) => {
  const [progress, setProgress] = useState<string | null>(null);
  const [step, setStep] = useState<'select-list' | 'select-products' | 'confirm'>('select-list');
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);
  const [mpixProducts, setMpixProducts] = useState<MpixProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Map<number, ImportMapping>>(new Map());
  const [importing, setImporting] = useState(false);
  const [globalMarkup, setGlobalMarkup] = useState<number>(100);

  // Step 1: Load price lists
  const handleLoadPriceLists = async () => {
    setLoading(true);
    setError(null);
    try {
      const lists = await priceListAdminService.getAll();
      setPriceLists(lists);
    } catch (err) {
      setError('Failed to load price lists');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Load Mpix products
  const handleLoadMpixProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await mpixService.getProductCatalog();
      setMpixProducts(catalog.products || []);
      setStep('select-products');
    } catch (err) {
      setError('Failed to load Mpix products. Check your Mpix configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle product selection
  const toggleProductSelection = (productUID: number) => {
    const newSelected = new Map(selectedProducts);
    if (newSelected.has(productUID)) {
      newSelected.delete(productUID);
    } else {
      newSelected.set(productUID, {
        productUID,
        useCustomPrice: false,
        markupPercentage: globalMarkup,
      });
    }
    setSelectedProducts(newSelected);
  };

  // Select all products
  const handleSelectAll = () => {
    const newSelected = new Map<number, ImportMapping>();
    mpixProducts.forEach(product => {
      newSelected.set(product.productUID, {
        productUID: product.productUID,
        useCustomPrice: false,
        markupPercentage: globalMarkup,
      });
    });
    setSelectedProducts(newSelected);
  };

  // Deselect all products
  const handleDeselectAll = () => {
    setSelectedProducts(new Map());
  };

  // Apply global markup to all selected products
  const handleApplyGlobalMarkup = () => {
    const newSelected = new Map(selectedProducts);
    newSelected.forEach((mapping, productUID) => {
      if (!mapping.useCustomPrice) {
        newSelected.set(productUID, {
          ...mapping,
          markupPercentage: globalMarkup,
        });
      }
    });
    setSelectedProducts(newSelected);
  };

  // Update mapping for a product
  const updateMapping = (productUID: number, updates: Partial<ImportMapping>) => {
    const newSelected = new Map(selectedProducts);
    const current = newSelected.get(productUID) || { productUID, useCustomPrice: false };
    newSelected.set(productUID, { ...current, ...updates });
    setSelectedProducts(newSelected);
  };

  // Import selected products to price list
  const handleImport = async () => {
      setProgress('Validating Mpix data...');
      setProgress('Checking for duplicates...');
      setProgress('Adding products to price list...');
    if (!selectedPriceListId || selectedProducts.size === 0) {
      setError('Please select a price list and at least one product');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const selectedMpixProducts = mpixProducts.filter((p) =>
        selectedProducts.has(p.productUID)
      );

      // Get existing price list to check for duplicates
      const priceList = await priceListAdminService.getById(selectedPriceListId);
      const existingProductNames = new Set(priceList?.products?.map(p => p.name.toLowerCase()) || []);

      // Group similar products by their base name (e.g., "Print", "Canvas", "Metal Print")
      const groupedProducts = new Map<string, typeof selectedMpixProducts>();
      
      selectedMpixProducts.forEach(product => {
        // Extract base product name (e.g., "4x6 Print" → "Print", "8x10 Metal Print" → "Metal Print")
        const baseName = product.name.split(/\s*\d+x\d+/)[0].trim() || product.category || 'Other';
        
        if (!groupedProducts.has(baseName)) {
          groupedProducts.set(baseName, []);
        }
        groupedProducts.get(baseName)!.push(product);
      });

      const itemsToAdd: any[] = [];
      const skippedDuplicates: string[] = [];

      // Process each product group
      groupedProducts.forEach((products, baseName) => {
        // Use the extracted base name for the product
        const productName = baseName;
        
        // Check if this product already exists in price list
        if (existingProductNames.has(productName.toLowerCase())) {
          skippedDuplicates.push(productName);
          return;
        }

        // Deduplicate sizes by dimensions (width x height) - keep the first occurrence
        const seenDimensions = new Set<string>();
        const uniqueProducts = products.filter(product => {
          const dimensionKey = `${product.width}x${product.height}`;
          if (seenDimensions.has(dimensionKey)) {
            return false; // Skip duplicate dimensions
          }
          seenDimensions.add(dimensionKey);
          return true;
        });

        // Add the group as a single product with multiple sizes
        const sizes = uniqueProducts.map(product => {
          const mapping = selectedProducts.get(product.productUID)!;
          let cost = product.basePrice;
          // Estimate cost if 0
          if (!cost || cost === 0) {
            // Estimate: $0.10 per square inch if dimensions exist, else $1.00
            if (product.width && product.height) {
              cost = Math.max(0.5, Math.round(product.width * product.height * 0.10 * 100) / 100);
            } else {
              cost = 1.0;
            }
          }

          let price = cost;
          if (mapping.useCustomPrice && mapping.customPrice) {
            price = mapping.customPrice;
          } else {
            const markup = mapping.markupPercentage ?? 100;
            price = cost * (1 + markup / 100);
          }

          return {
            name: product.width && product.height ? `${product.width}x${product.height}` : product.name,
            width: product.width,
            height: product.height,
            price,
            cost,
          };
        });

        // Create grouped product entry
        itemsToAdd.push({
          productName: productName,
          description: uniqueProducts[0].description || `${productName} - Multiple sizes`,
          category: uniqueProducts[0].category || 'Other',
          sizes, // Array of sizes with their pricing
          mpixProductUIDs: uniqueProducts.map(p => p.productUID), // Link to all Mpix products
        });
      });

      if (itemsToAdd.length === 0) {
          setProgress(null);
          setProgress(null);
          setProgress(null);
          setProgress(null);
        setError('All selected products already exist in this price list');
        setImporting(false);
        return;
      }

      // Add to price list
      await priceListAdminService.addItemsToPriceList(selectedPriceListId!, itemsToAdd);
  // TODO: Replace with real API call to add items to price list when implemented

      // Show confirmation message
      let confirmMsg = `✓ Successfully imported ${itemsToAdd.length} product group(s)`;
      if (skippedDuplicates.length > 0) {
        confirmMsg += ` (${skippedDuplicates.length} duplicate(s) skipped)`;
      }
      alert(confirmMsg);

      onImportComplete();
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content import-modal">
        <h2>Import Products from Mpix</h2>

        {error && (
          <div className="info-box-error mb-20">
            ✗ {error}
          </div>
        )}

        {/* Step 1: Select Price List */}
        {step === 'select-list' && (
          <>
            <p className="text-secondary mb-20">
              Select a price list where you want to add Mpix products.
            </p>

            {priceLists.length === 0 ? (
              <button
                onClick={handleLoadPriceLists}
                disabled={loading}
                className="btn btn-primary mb-20"
              >
                {loading ? 'Loading...' : 'Load Price Lists'}
              </button>
            ) : (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label className="block-label mb-8 fw-500">Select Price List</label>
                  <select
                    value={selectedPriceListId || ''}
                    onChange={(e) => setSelectedPriceListId(Number(e.target.value))}
                    className="import-input-lg w-100"
                  >
                    <option value="">-- Select a price list --</option>
                    {priceLists.map((list) => (
                      <option key={`pricelist-${list.id}`} value={list.id}>
                        {list.name} ({list.description})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleLoadMpixProducts}
                  disabled={!selectedPriceListId || loading}
                  className="btn btn-success"
                >
                  {loading ? 'Loading...' : 'Next: Select Products'}
                </button>
              </>
            )}
          </>
        )}

        {/* Step 2: Select Products */}
        {step === 'select-products' && (
          <>
            <p className="text-secondary mb-20">
              Select products from Mpix catalog to add to your price list.
            </p>

            {/* Global Controls */}
            <div className="admin-section-card" style={{ marginBottom: '20px' }}>
              <div className="flex-row gap-15 align-center flex-wrap">
                <div className="flex-row gap-10">
                  <button
                    onClick={handleSelectAll}
                    className="btn btn-primary btn-sm"
                  >
                    Select All ({mpixProducts.length})
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="btn btn-secondary btn-sm"
                  >
                    Deselect All
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <label className="fs-13 fw-500 nowrap">Global Markup %:</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={globalMarkup}
                    onChange={(e) => setGlobalMarkup(Math.max(0, parseInt(e.target.value) || 0))}
                    className="import-input w-80 fs-13"
                  />
                  <button
                    onClick={handleApplyGlobalMarkup}
                    disabled={selectedProducts.size === 0}
                    className="btn btn-success btn-sm"
                  >
                    Apply to Selected
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span className="fs-12 text-secondary">Selected: <strong>{selectedProducts.size}</strong> / {mpixProducts.length}</span>
                </div>
              </div>
            </div>

            <div className="import-scroll-panel">
              {mpixProducts.map((product) => {
                const isSelected = selectedProducts.has(product.productUID);
                const mapping = selectedProducts.get(product.productUID);

                // Use both productUID and productId, fallback to index for uniqueness
                const uniqueKey = `mpix-product-${product.productUID}-${product.productId}-${product.name}`;
                return (
                  <div
                    key={uniqueKey}
                    className={`import-product-card${isSelected ? ' selected' : ''}`}
                  >
                    <div className="flex-row align-start gap-15">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleProductSelection(product.productUID)}
                        className="checkbox-lg mt-5 w-18 h-18 pointer"
                      />

                      <div className="flex-1">
                        <h4 className="mb-5 mt-0">{product.name}</h4>
                        <p className="mb-5 mt-0 fs-12 text-secondary">
                          {product.description}
                        </p>
                        <p className="mb-5 mt-0 fs-12">
                          UID: {product.productUID} | Mpix Cost: ${product.basePrice.toFixed(2)}
                          {product.width && product.height && ` | ${product.width}x${product.height}`}
                        </p>

                        {isSelected && (
                          <div className="import-pricing-box">
                            <div className="import-pricing-summary">
                              <strong>Cost:</strong> ${product.basePrice.toFixed(2)}
                              {' | '}
                              <strong>Retail Price:</strong> ${
                                mapping?.useCustomPrice && mapping.customPrice
                                  ? mapping.customPrice.toFixed(2)
                                  : (product.basePrice * (1 + (mapping?.markupPercentage ?? 100) / 100)).toFixed(2)
                              }
                              {!mapping?.useCustomPrice && (
                                <>
                                  {' | '}
                                  <strong>Margin:</strong> {mapping?.markupPercentage ?? 100}%
                                </>
                              )}
                            </div>

                            {!mapping?.useCustomPrice ? (
                              <>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                                  Markup Percentage (%)
                                </label>
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={mapping?.markupPercentage ?? 100}
                                  onChange={(e) =>
                                    updateMapping(product.productUID, { markupPercentage: Math.max(0, parseInt(e.target.value)) })
                                  }
                                  style={{
                                    width: '80px',
                                    padding: '6px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    marginBottom: '8px',
                                    backgroundColor: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                  }}
                                />
                              </>
                            ) : (
                              <>
                                <label className="block-label mb-8 fs-12">
                                  Custom Retail Price ($)
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={mapping.customPrice || product.basePrice}
                                  onChange={(e) =>
                                    updateMapping(product.productUID, { customPrice: parseFloat(e.target.value) })
                                  }
                                  style={{
                                    width: '100px',
                                    padding: '6px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    marginBottom: '8px',
                                    backgroundColor: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                  }}
                                />
                              </>
                            )}

                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                              <input
                                type="checkbox"
                                checked={mapping?.useCustomPrice || false}
                                onChange={(e) =>
                                  updateMapping(product.productUID, { useCustomPrice: e.target.checked })
                                }
                              />
                              <span style={{ fontSize: '12px' }}>Override with custom price</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setStep('select-list')}
                className="btn btn-secondary"
              >
                Back
              </button>

              <button
                onClick={() => setStep('confirm')}
                disabled={selectedProducts.size === 0}
                className="btn btn-success"
              >
                Review & Import ({selectedProducts.size})
              </button>
            </div>
          </>
        )}

        {/* Step 3: Confirm */}
                {progress && (
                  <div className="info-box info-box-progress" style={{ marginBottom: '20px' }}>
                    {progress}
                  </div>
                )}
        {step === 'confirm' && (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Review and confirm import of <strong>{selectedProducts.size} products</strong> to the selected price list.
            </p>

            <div className="import-scroll-panel" style={{ maxHeight: '300px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>Products to Import:</h4>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {Array.from(selectedProducts.values()).map((mapping) => {
                  const product = mpixProducts.find((p) => p.productUID === mapping.productUID);
                  const cost = product?.basePrice || 0;
                  const retailPrice = mapping.useCustomPrice && mapping.customPrice ? mapping.customPrice : cost * (1 + (mapping.markupPercentage ?? 100) / 100);
                  const margin = ((retailPrice - cost) / cost * 100).toFixed(0);
                  
                  return (
                    <li key={`mpix-summary-${mapping.productUID}`} style={{ marginBottom: '8px', fontSize: '12px' }}>
                      <strong>{product?.name}</strong>
                      {' — Cost: '}
                      <span style={{ color: 'var(--error-color)' }}>${cost.toFixed(2)}</span>
                      {' | Retail: '}
                      <span className="success-text">${retailPrice.toFixed(2)}</span>
                      {' | Margin: '}
                      <span>{margin}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setStep('select-products')}
                className="btn btn-secondary"
              >
                Back
              </button>

              <button
                onClick={handleImport}
                disabled={importing}
                className="btn btn-success"
              >
                {importing ? 'Importing...' : 'Import to Price List'}
              </button>
            </div>
          </>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="import-close"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default AdminMpixImport;

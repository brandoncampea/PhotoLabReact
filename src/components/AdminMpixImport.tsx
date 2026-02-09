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

const AdminMpixImport: React.FC<{ onClose: () => void; onImportComplete: () => void }> = ({
  onClose,
  onImportComplete,
}) => {
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
          const cost = product.basePrice;
          
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
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '30px', maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto', width: '90%' }}>
        <h2>Import Products from Mpix</h2>

        {error && (
          <div style={{ backgroundColor: '#ffebee', padding: '12px', marginBottom: '20px', borderRadius: '4px', color: '#c62828' }}>
            ✗ {error}
          </div>
        )}

        {/* Step 1: Select Price List */}
        {step === 'select-list' && (
          <>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Select a price list where you want to add Mpix products.
            </p>

            {priceLists.length === 0 ? (
              <button
                onClick={handleLoadPriceLists}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginBottom: '20px',
                }}
              >
                {loading ? 'Loading...' : 'Load Price Lists'}
              </button>
            ) : (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Select Price List
                  </label>
                  <select
                    value={selectedPriceListId || ''}
                    onChange={(e) => setSelectedPriceListId(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
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
                  style={{
                    padding: '10px 20px',
                    backgroundColor: selectedPriceListId ? '#4caf50' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: selectedPriceListId ? 'pointer' : 'not-allowed',
                  }}
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
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Select products from Mpix catalog to add to your price list.
            </p>

            {/* Global Controls */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px', border: '1px solid #ddd' }}>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSelectAll}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#2196f3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Select All ({mpixProducts.length})
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#666',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Deselect All
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Global Markup %:
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={globalMarkup}
                    onChange={(e) => setGlobalMarkup(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{
                      width: '80px',
                      padding: '6px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    onClick={handleApplyGlobalMarkup}
                    disabled={selectedProducts.size === 0}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: selectedProducts.size > 0 ? '#4caf50' : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: selectedProducts.size > 0 ? 'pointer' : 'not-allowed',
                      fontSize: '12px',
                    }}
                  >
                    Apply to Selected
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: '#666' }}>
                  Selected: <strong>{selectedProducts.size}</strong> / {mpixProducts.length}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px', maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '15px' }}>
              {mpixProducts.map((product) => {
                const isSelected = selectedProducts.has(product.productUID);
                const mapping = selectedProducts.get(product.productUID);

                // Use both productUID and productId, fallback to index for uniqueness
                const uniqueKey = `mpix-product-${product.productUID}-${product.productId}-${product.name}`;
                return (
                  <div
                    key={uniqueKey}
                    style={{
                      padding: '15px',
                      marginBottom: '10px',
                      backgroundColor: isSelected ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: '4px',
                      border: isSelected ? '2px solid #2196f3' : '1px solid #ddd',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleProductSelection(product.productUID)}
                        style={{ marginTop: '5px', width: '18px', height: '18px', cursor: 'pointer' }}
                      />

                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 5px 0' }}>{product.name}</h4>
                        <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>
                          {product.description}
                        </p>
                        <p style={{ margin: '0 0 5px 0', fontSize: '12px' }}>
                          UID: {product.productUID} | Mpix Cost: ${product.basePrice.toFixed(2)}
                          {product.width && product.height && ` | ${product.width}x${product.height}`}
                        </p>

                        {isSelected && (
                          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'white', borderRadius: '4px' }}>
                            <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '3px', fontSize: '12px' }}>
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
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    marginBottom: '8px',
                                  }}
                                />
                              </>
                            ) : (
                              <>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
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
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    marginBottom: '8px',
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
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#999',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>

              <button
                onClick={() => setStep('confirm')}
                disabled={selectedProducts.size === 0}
                style={{
                  padding: '10px 20px',
                  backgroundColor: selectedProducts.size > 0 ? '#4caf50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedProducts.size > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                Review & Import ({selectedProducts.size})
              </button>
            </div>
          </>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && (
          <>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Review and confirm import of <strong>{selectedProducts.size} products</strong> to the selected price list.
            </p>

            <div style={{ marginBottom: '20px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '15px', backgroundColor: '#f9f9f9' }}>
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
                      <span style={{ color: '#d32f2f' }}>${cost.toFixed(2)}</span>
                      {' | Retail: '}
                      <span style={{ color: '#388e3c' }}>${retailPrice.toFixed(2)}</span>
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
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#999',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>

              <button
                onClick={handleImport}
                disabled={importing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: importing ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: importing ? 'not-allowed' : 'pointer',
                }}
              >
                {importing ? 'Importing...' : 'Import to Price List'}
              </button>
            </div>
          </>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            backgroundColor: 'transparent',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default AdminMpixImport;

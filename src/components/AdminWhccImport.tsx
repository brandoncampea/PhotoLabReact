import React, { useState } from 'react';
import { whccService } from '../services/whccService';
import { priceListAdminService } from '../services/priceListAdminService';
import { PriceList } from '../types';

interface WhccProduct {
  productUID: number;
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

const AdminWhccImport: React.FC<{ onClose: () => void; onImportComplete: () => void }> = ({
  onClose,
  onImportComplete,
}) => {
  const [step, setStep] = useState<'select-list' | 'select-products' | 'confirm'>('select-list');
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);
  const [whccProducts, setWhccProducts] = useState<WhccProduct[]>([]);
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

  // Step 2: Load WHCC products
  const handleLoadWhccProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await whccService.getProductCatalog();
      setWhccProducts(catalog.products || []);
      setStep('select-products');
    } catch (err) {
      setError('Failed to load WHCC products. Check your WHCC configuration.');
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
    whccProducts.forEach(product => {
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
      // Debug logging
      console.log('[WHCC Import] Selected Price List ID:', selectedPriceListId);
      console.log('[WHCC Import] Selected Products Map:', selectedProducts);
      const selectedWhccProducts = whccProducts.filter((p) =>
        selectedProducts.has(p.productUID)
      );
      console.log('[WHCC Import] Filtered WHCC Products:', selectedWhccProducts);

      // Get existing price list to check for duplicates
      const priceList = await priceListAdminService.getById(selectedPriceListId);
      const existingProductNames = new Set(priceList?.products?.map(p => p.name.toLowerCase()) || []);
      console.log('[WHCC Import] Existing product names:', existingProductNames);

      // Group similar products by base name to create a product with multiple sizes
      const groupedProducts = new Map<string, typeof selectedWhccProducts>();

      const getBaseName = (name: string, category?: string) => {
        const cleaned = name
          .replace(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        return cleaned || category || 'Other';
      };

      selectedWhccProducts.forEach((product) => {
        const baseName = getBaseName(product.name, product.category);

        if (!groupedProducts.has(baseName)) {
          groupedProducts.set(baseName, []);
        }
        groupedProducts.get(baseName)!.push(product);
      });
      console.log('[WHCC Import] Grouped products:', groupedProducts);

      const itemsToAdd: any[] = [];
      const skippedDuplicates: string[] = [];

      groupedProducts.forEach((products, baseName) => {
        const productName = baseName;

        // Skip if product already exists in selected price list
        if (existingProductNames.has(productName.toLowerCase())) {
          skippedDuplicates.push(productName);
          return;
        }

        // Deduplicate sizes by dimensions/name
        const seenSizes = new Set<string>();
        const uniqueProducts = products.filter((product) => {
          const sizeKey = `${product.width ?? ''}x${product.height ?? ''}|${product.name.toLowerCase()}`;
          if (seenSizes.has(sizeKey)) return false;
          seenSizes.add(sizeKey);
          return true;
        });

        const sizes = uniqueProducts.map((product) => {
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

        itemsToAdd.push({
          productName,
          description: uniqueProducts[0].description || `${productName} - Multiple sizes`,
          category: uniqueProducts[0].category || 'Other',
          sizes,
          whccProductUIDs: uniqueProducts.map(p => p.productUID),
        });
      });
      console.log('[WHCC Import] Items to add:', itemsToAdd);
      console.log('[WHCC Import] Skipped duplicates:', skippedDuplicates);

      if (itemsToAdd.length === 0) {
        setError('All selected products already exist in this price list');
        setImporting(false);
        return;
      }

      // Add to price list
      const addResult = await priceListAdminService.addItemsToPriceList(selectedPriceListId, itemsToAdd);
      console.log('[WHCC Import] addItemsToPriceList result:', addResult);

      let confirmMsg = `✓ Successfully imported ${itemsToAdd.length} product group(s)`;
      if (skippedDuplicates.length > 0) {
        confirmMsg += ` (${skippedDuplicates.length} duplicate(s) skipped)`;
      }
      alert(confirmMsg);

      onImportComplete();
    } catch (err) {
      console.error('[WHCC Import] Import failed:', err);
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content import-modal">
        <h2>Import Products from WHCC</h2>

        {error && (
          <div className="info-box-error info-box-error-margin">
            ✗ {error}
          </div>
        )}

        {/* Step 1: Select Price List */}
        {step === 'select-list' && (
          <>
            <p className="admin-whcc-desc">
              Select a price list where you want to add WHCC products.
            </p>

            {priceLists.length === 0 ? (
                <button
                  onClick={handleLoadPriceLists}
                  disabled={loading}
                  className="btn btn-primary admin-whcc-btn-margin"
                >
                {loading ? 'Loading...' : 'Load Price Lists'}
              </button>
            ) : (
              <>
                <div className="admin-whcc-select-margin">
                  <label className="admin-whcc-select-label">
                    Select Price List
                  </label>
                  <select
                    value={selectedPriceListId || ''}
                    onChange={(e) => setSelectedPriceListId(Number(e.target.value))}
                    className="admin-whcc-select"
                  >
                    <option value="">-- Select a price list --</option>
                    {priceLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.description})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleLoadWhccProducts}
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
            <p className="admin-whcc-desc">
              Select products from WHCC catalog to add to your price list.
            </p>

            {/* Global Controls */}
            <div className="admin-section-card admin-whcc-section-margin">
              <div className="admin-whcc-controls-row">
                <div className="admin-whcc-controls-btns">
                  <button
                    onClick={handleSelectAll}
                    className="btn btn-primary btn-sm"
                  >
                    Select All ({whccProducts.length})
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="btn btn-secondary btn-sm"
                  >
                    Deselect All
                  </button>
                </div>

                <div className="admin-whcc-controls-markup">
                  <label className="admin-whcc-markup-label">
                    Global Markup %:
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={globalMarkup}
                    onChange={(e) => setGlobalMarkup(Math.max(0, parseInt(e.target.value) || 0))}
                    className="admin-whcc-markup-input"
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
                  Selected: <strong>{selectedProducts.size}</strong> / {whccProducts.length}
                </div>
              </div>
            </div>

            <div className="import-scroll-panel">
              {whccProducts.map((product) => {
                const isSelected = selectedProducts.has(product.productUID);
                const mapping = selectedProducts.get(product.productUID);

                return (
                  <div
                    key={product.productUID}
                    className={`import-product-card${isSelected ? ' selected' : ''}`}
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
                        <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {product.description}
                        </p>
                        <p style={{ margin: '0 0 5px 0', fontSize: '12px' }}>
                          UID: {product.productUID} | WHCC Cost: ${product.basePrice.toFixed(2)}
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
        {step === 'confirm' && (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Review and confirm import of <strong>{selectedProducts.size} products</strong> to the selected price list.
            </p>

            <div className="import-scroll-panel" style={{ maxHeight: '300px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>Products to Import:</h4>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {Array.from(selectedProducts.values()).map((mapping) => {
                  const product = whccProducts.find((p) => p.productUID === mapping.productUID);
                  const cost = product?.basePrice || 0;
                  const retailPrice = mapping.useCustomPrice && mapping.customPrice ? mapping.customPrice : cost * (1 + (mapping.markupPercentage ?? 100) / 100);
                  const margin = ((retailPrice - cost) / cost * 100).toFixed(0);
                  
                  return (
                    <li key={mapping.productUID} style={{ marginBottom: '8px', fontSize: '12px' }}>
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

export default AdminWhccImport;

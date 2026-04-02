


import React, { useState } from 'react';
// Helper for deep selection
const getAllSizeKeys = (grouped: any, category: string, product: string) => {
  return Object.keys(grouped[category]?.[product] || {});
};

const getAllProductKeys = (grouped: any, category: string) => {
  return Object.keys(grouped[category] || {});
};

const getAllCategoryKeys = (grouped: any) => {
  return Object.keys(grouped || {});
};

/** Extract the WHCC ProductNodeID from a raw catalog product object. */
const getProductNodeID = (prod: any): number | null => {
  const raw =
    prod?.ProductNodeID ??
    prod?.productNodeID ??
    prod?.DefaultProductNodeID ??
    (Array.isArray(prod?.ProductNodes) ? prod.ProductNodes[0]?.ProductNodeID : null) ??
    (Array.isArray(prod?.productNodes) ? prod.productNodes[0]?.productNodeID : null);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Extract ordered list of ItemAttribute UIDs from a raw catalog product object. */
const getItemAttributeUIDs = (prod: any): number[] => {
  const attrs =
    prod?.DefaultItemAttributes ??
    prod?.defaultItemAttributes ??
    prod?.ItemAttributes ??
    prod?.itemAttributes ??
    [];
  if (!Array.isArray(attrs)) return [];
  return attrs
    .map((a: any) => Number(a?.AttributeUID ?? a?.attributeUID ?? a?.uid ?? a))
    .filter((v: number) => Number.isInteger(v) && v > 0);
};
import Papa from 'papaparse';
// CSV will be fetched at runtime from public/
import { superPriceListService } from '../services/superPriceListService';
import { whccService } from '../services/whccService';

const AdminWhccImport: React.FC<{ onClose: () => void; onImportComplete: () => void }> = ({ onClose, onImportComplete }) => {
  const getUid = (prod: any): number => {
    const raw = prod?.productUID ?? prod?.ProductUID ?? prod?.productUid ?? prod?.ProductUid;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  // Import handler for the confirm step
  const handleImport = async () => {
    setImporting(true);
    setError('');
    setInfo('');
    try {
      // Build a fast lookup map once (avoids expensive nested scan per selected row)
      const rowBySelectionKey = new Map<string, any>();
      Object.keys(groupedProducts).forEach((cat) => {
        Object.keys(groupedProducts[cat] || {}).forEach((prod) => {
          Object.keys(groupedProducts[cat][prod] || {}).forEach((size) => {
            const row = groupedProducts[cat][prod][size];
            const key = String(row?.selectionKey || '');
            if (!key) return;
            rowBySelectionKey.set(key, {
              row,
              category: cat,
              size,
            });
          });
        });
      });

      const items = Array.from(selectedProducts.values())
        .map((mapping: any) => {
          const key = String(mapping.selectionKey || '');
          const hit = rowBySelectionKey.get(key);
          if (!hit) return null;
          const product = hit.row;
          const cost = Number(product.price || 0);
          const whccUID = Number(product.productUID || product.ProductUID || 0) || undefined;
          const whccNodeID = getProductNodeID(product) ?? undefined;
          const whccAttrUIDs = getItemAttributeUIDs(product);
          return {
            product_size_id: Number(mapping.importId || product.importId || product.productUID || 0),
            base_cost: cost,
            markup_percent: null,
            custom_price: mapping.useCustomPrice ? mapping.customPrice : undefined,
            product_name: String(product.name || product.Name || ''),
            size_name: String(hit.size || ''),
            category: String(hit.category || 'whcc'),
            description: 'Imported from WHCC',
            ...(whccUID ? { whccProductUID: whccUID } : {}),
            ...(whccNodeID ? { whccProductNodeID: whccNodeID } : {}),
            ...(whccAttrUIDs.length ? { whccItemAttributeUIDs: whccAttrUIDs } : {}),
          };
        })
        .filter(Boolean);

      if (!items.length) {
        setError('No valid products selected to import.');
        setImporting(false);
        return;
      }

      // Send in batches to keep requests responsive for very large imports
      const batchSize = 50;
      const totalBatches = Math.ceil(items.length / batchSize);
      let importedTotal = 0;
      let updatedTotal = 0;
      let skippedTotal = 0;
      const errorSamples: any[] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchIndex = Math.floor(i / batchSize) + 1;
        setInfo(`Importing batch ${batchIndex}/${totalBatches}...`);
        const result = await superPriceListService.importItems(Number(selectedPriceListId), batch) as any;
        importedTotal += Number(result?.importedCount || 0);
        updatedTotal += Number(result?.updatedCount || 0);
        skippedTotal += Number(result?.skippedCount || 0);
        if (Array.isArray(result?.errorSamples)) {
          errorSamples.push(...result.errorSamples);
        }
        setInfo(`Imported ${importedTotal}, updated ${updatedTotal} of ${items.length} selected so far...`);
      }

      if (importedTotal === 0 && updatedTotal === 0 && items.length > 0) {
        const firstErr = errorSamples[0]?.error ? ` First error: ${errorSamples[0].error}` : '';
        setError(`No products were imported or updated.${firstErr}`);
      } else {
        const parts = [];
        if (importedTotal > 0) parts.push(`${importedTotal} imported`);
        if (updatedTotal > 0) parts.push(`${updatedTotal} enriched`);
        if (skippedTotal > 0) parts.push(`${skippedTotal} unchanged`);
        setInfo(`${parts.join(', ')}.`);
      }
      if (importedTotal > 0 || updatedTotal > 0) {
        setSelectedProducts(new Map());
      }
    } catch (err: any) {
      const responseDetails = err?.response?.data
        ? ` ${typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)}`
        : '';
      setError('Failed to import products: ' + (err?.message || 'Unknown error') + responseDetails);
    } finally {
      setImporting(false);
    }
  };

  // State declarations must come first
  const [step, setStep] = useState('select-list');
  const [selectedProducts, setSelectedProducts] = useState(new Map());
  const [groupedProducts, setGroupedProducts] = useState<any>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState<string | undefined>();
  const [missingPrices, setMissingPrices] = useState(0);
  type PreviewRow = { name: string; size: string; cat: string; status: 'new' | 'enrich' | 'unchanged' };
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load price lists on mount
  React.useEffect(() => {
    const fetchPriceLists = async () => {
      setLoading(true);
      setError('');
      try {
        const lists = await superPriceListService.getLists();
        setPriceLists(lists);
      } catch (err: any) {
        setError('Failed to load price lists');
      } finally {
        setLoading(false);
      }
    };
    fetchPriceLists();
  }, []);

  // Load WHCC products and group them
  React.useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError('');
      try {
        // 1. Load WHCC catalog
        const catalog = await whccService.getProductCatalog();
        if (!catalog || !Array.isArray(catalog.Categories)) {
          setGroupedProducts({});
          return;
        }
        // 2. Fetch and parse CSV for prices
        let csvData: any[] = [];
        const csvUrl = '/whcc_all_products_full.csv';
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        Papa.parse(csvText, {
          header: true,
          complete: (results) => {
            csvData = results.data;
          },
        });
        // Wait for Papa.parse to finish (it is synchronous in this mode)
        // 3. Group products by category/product/size and match price (improved)
        const grouped: any = {};
        const normalize = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const extractSize = (str: string) => {
          const m = String(str || '').match(/(\d+(?:\.\d+)?x\d+(?:\.\d+)?)/i);
          return m ? m[1].toLowerCase() : '';
        };
        const tokenize = (str: string) => {
          const stop = new Set(['print', 'with', 'styrene', 'backing', 'the', 'and', 'for', 'inch', 'in']);
          return String(str || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]+/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .filter(t => !stop.has(t));
        };
        let localMissingPrices = 0;
        let rowCounter = 0;
        catalog.Categories.forEach((cat: any) => {
          if (!Array.isArray(cat.ProductList)) return;
          if (!grouped[cat.Name]) grouped[cat.Name] = {};
          const catNorm = normalize(cat.Name || '');
          cat.ProductList.forEach((prod: any) => {
            const uid = getUid(prod);
            const name = prod.name || prod.Name || '';
            const sizeMatch = name.match(/(\d+(?:x\d+)+)/i);
            const baseName = sizeMatch ? name.replace(sizeMatch[0], '').trim() : name;
            const size = sizeMatch ? sizeMatch[0] : '';
            if (!grouped[cat.Name][baseName]) grouped[cat.Name][baseName] = {};
            // Price matching from CSV only
            let price = '';
            let csvRow: any = null;
            const productCode = String(prod.ProductCode || prod.productCode || prod.Code || prod.code || '').trim();
            const productSize = extractSize(name);
            const nameNorm = normalize(name);
            const baseNorm = normalize(baseName.replace(/\bprint\b/ig, ''));

            // 1) Strongest: Product code
            if (productCode) {
              csvRow = csvData.find((row: any) => String(row['Product Code'] || '').trim() === productCode);
            }

            // 2) Exact full-name match
            if (!csvRow) {
              csvRow = csvData.find((row: any) => normalize(row['Product Name/Size'] || '') === nameNorm);
            }

            // 3) Size-aware scored match (prevents same-cost collisions)
            if (!csvRow) {
              const candidates = csvData.filter((row: any) => {
                const rowName = String(row['Product Name/Size'] || '');
                if (!rowName) return false;
                const rowSize = extractSize(rowName);
                return productSize ? rowSize === productSize : true;
              });

              let best: any = null;
              let bestScore = -1;
              const pTokens = new Set(tokenize(baseName));
              for (const row of candidates) {
                const rowName = String(row['Product Name/Size'] || '');
                const rowNorm = normalize(rowName);
                const rowBaseNorm = normalize(rowName.replace(/(\d+(?:\.\d+)?x\d+(?:\.\d+)?)/ig, '').replace(/\bprint\b/ig, ''));
                const rowSheetNorm = normalize(String(row['Sheet'] || ''));

                let score = 0;
                if (rowNorm === nameNorm) score += 100;
                if (rowBaseNorm === baseNorm) score += 60;
                if (rowBaseNorm.includes(baseNorm) || baseNorm.includes(rowBaseNorm)) score += 25;
                if (rowSheetNorm && (rowSheetNorm.includes(catNorm) || catNorm.includes(rowSheetNorm))) score += 20;

                const rowTokens = new Set(tokenize(rowName));
                let overlap = 0;
                pTokens.forEach(t => { if (rowTokens.has(t)) overlap += 1; });
                score += overlap * 8;

                if (score > bestScore) {
                  bestScore = score;
                  best = row;
                }
              }
              if (bestScore >= 20) csvRow = best;
            }

            if (csvRow && csvRow['Price']) price = String(csvRow['Price']);
            else localMissingPrices++;

            const csvCode = Number(csvRow?.['Product Code'] || 0);
            const importId = Number(productCode || csvCode || uid || 0);
            const selectionKey = `row-${++rowCounter}-${catNorm}-${normalize(baseName)}-${String(size).toLowerCase()}`;

            grouped[cat.Name][baseName][size] = {
              ...prod,
              productUID: uid,
              importId,
              selectionKey,
              price,
              csvRow,
            };
          });
        });
        setGroupedProducts(grouped);
        setMissingPrices(localMissingPrices);
      } catch (err: any) {
        setError('Failed to load WHCC products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [step]);



  // Load price lists on mount
  React.useEffect(() => {
    const fetchPriceLists = async () => {
      setLoading(true);
      setError('');
      try {
        const lists = await superPriceListService.getLists();
        setPriceLists(lists);
      } catch (err: any) {
        setError('Failed to load price lists');
      } finally {
        setLoading(false);
      }
    };
    fetchPriceLists();
  }, []);

  // Build import preview when entering confirm step
  React.useEffect(() => {
    if (step !== 'confirm' || !selectedPriceListId) return;
    const norm = (s: string) => String(s || '').toLowerCase().trim();
    const buildPreview = async () => {
      setPreviewLoading(true);
      try {
        const existingItems: any[] = await superPriceListService.getItems(Number(selectedPriceListId));
        const existingMap = new Map<string, any>();
        for (const it of existingItems) {
          const k = `${norm(it.product_name)}|${norm(it.size_name)}|${norm(it.product_category)}`;
          existingMap.set(k, it);
        }
        // Build selectionKey → location map
        const locByKey = new Map<string, { cat: string; prod: string; size: string }>();
        Object.keys(groupedProducts).forEach(cat => {
          Object.keys(groupedProducts[cat] || {}).forEach(prod => {
            Object.keys(groupedProducts[cat][prod] || {}).forEach(size => {
              const row = groupedProducts[cat][prod][size];
              const key = String(row?.selectionKey || '');
              if (key) locByKey.set(key, { cat, prod, size });
            });
          });
        });
        const rows: PreviewRow[] = [];
        for (const [selKey, _] of Array.from(selectedProducts.entries())) {
          const loc = locByKey.get(String(selKey));
          if (!loc) continue;
          const { cat, prod, size } = loc;
          const productObj = groupedProducts[cat][prod][size];
          const productName = String(productObj?.name || productObj?.Name || prod || '');
          const lookupKey = `${norm(productName)}|${norm(size)}|${norm(cat)}`;
          const hit = existingMap.get(lookupKey);
          let status: PreviewRow['status'];
          if (!hit) {
            status = 'new';
          } else if (!hit.whccProductUID && !hit.whccProductNodeID) {
            status = 'enrich';
          } else {
            status = 'unchanged';
          }
          rows.push({ name: productName, size, cat, status });
        }
        setPreviewRows(rows);
      } catch (_) {
        setPreviewRows([]);
      } finally {
        setPreviewLoading(false);
      }
    };
    buildPreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedPriceListId]);



  // Select all products
  const handleSelectAll = () => {
    const newSelected = new Map(selectedProducts);
    Object.keys(groupedProducts).forEach((cat) => {
      Object.keys(groupedProducts[cat] || {}).forEach((prod) => {
        Object.keys(groupedProducts[cat][prod] || {}).forEach((size) => {
          const row = groupedProducts[cat][prod][size];
          const selectionKey = String(row?.selectionKey || '');
          if (!selectionKey) return;
          if (!newSelected.has(selectionKey)) {
            newSelected.set(selectionKey, {
              selectionKey,
              importId: Number(row?.importId || row?.productUID || 0),
              useCustomPrice: false,
              customPrice: '',
            });
          }
        });
      });
    });
    setSelectedProducts(newSelected);
  };

  // Deselect all products
  const handleDeselectAll = () => {
    setSelectedProducts(new Map());
  };

  // Update mapping for a product
  const updateMapping = (selectionKey: string, updates: any) => {
    setSelectedProducts((prev) => {
      const newSelected = new Map(prev);
      const current = newSelected.get(selectionKey) || { selectionKey };
      newSelected.set(selectionKey, { ...current, ...updates });
      return newSelected;
    });
  };

  // Collapsible state for categories/products
  const [collapsed, setCollapsed] = useState<any>({});

  const toggleCollapse = (level: string) => {
    setCollapsed((prev: any) => ({ ...prev, [level]: !prev[level] }));
  };

  const handleExpandAll = () => {
    const next: any = {};
    Object.keys(groupedProducts).forEach((cat) => {
      next[`cat-${cat}`] = false;
      Object.keys(groupedProducts[cat] || {}).forEach((prod) => {
        next[`prod-${cat}-${prod}`] = false;
      });
    });
    setCollapsed(next);
  };

  const handleCollapseAll = () => {
    const next: any = {};
    Object.keys(groupedProducts).forEach((cat) => {
      next[`cat-${cat}`] = true;
      Object.keys(groupedProducts[cat] || {}).forEach((prod) => {
        next[`prod-${cat}-${prod}`] = true;
      });
    });
    setCollapsed(next);
  };

  // Multi-level selection handlers
  const isCategorySelected = (cat: string) => {
    const productKeys = getAllProductKeys(groupedProducts, cat);
    return productKeys.every(prod => {
      const sizeKeys = getAllSizeKeys(groupedProducts, cat, prod);
      return sizeKeys.every(size => selectedProducts.has(groupedProducts[cat][prod][size].selectionKey));
    });
  };
  const isProductSelected = (cat: string, prod: string) => {
    const sizeKeys = getAllSizeKeys(groupedProducts, cat, prod);
    return sizeKeys.every(size => selectedProducts.has(groupedProducts[cat][prod][size].selectionKey));
  };
  const isSizeSelected = (cat: string, prod: string, size: string) => {
    return selectedProducts.has(groupedProducts[cat][prod][size].selectionKey);
  };
  const handleCategorySelect = (cat: string, checked: boolean) => {
    const productKeys = getAllProductKeys(groupedProducts, cat);
    let newSelected = new Map(selectedProducts);
    productKeys.forEach(prod => {
      const sizeKeys = getAllSizeKeys(groupedProducts, cat, prod);
      sizeKeys.forEach(size => {
        const row = groupedProducts[cat][prod][size];
        const selectionKey = String(row.selectionKey);
        if (checked) {
          newSelected.set(selectionKey, {
            selectionKey,
            importId: Number(row.importId || row.productUID || 0),
            useCustomPrice: false,
            customPrice: '',
          });
        } else {
          newSelected.delete(selectionKey);
        }
      });
    });
    setSelectedProducts(newSelected);
  };
  const handleProductSelect = (cat: string, prod: string, checked: boolean) => {
    const sizeKeys = getAllSizeKeys(groupedProducts, cat, prod);
    let newSelected = new Map(selectedProducts);
    sizeKeys.forEach(size => {
      const row = groupedProducts[cat][prod][size];
      const selectionKey = String(row.selectionKey);
      if (checked) {
        newSelected.set(selectionKey, {
          selectionKey,
          importId: Number(row.importId || row.productUID || 0),
          useCustomPrice: false,
          customPrice: '',
        });
      } else {
        newSelected.delete(selectionKey);
      }
    });
    setSelectedProducts(newSelected);
  };
  const handleSizeSelect = (cat: string, prod: string, size: string, checked: boolean) => {
    const row = groupedProducts[cat][prod][size];
    const selectionKey = String(row.selectionKey);
    let newSelected = new Map(selectedProducts);
    if (checked) {
      newSelected.set(selectionKey, {
        selectionKey,
        importId: Number(row.importId || row.productUID || 0),
        useCustomPrice: false,
        customPrice: '',
      });
    } else {
      newSelected.delete(selectionKey);
    }
    setSelectedProducts(newSelected);
  };

  // Only one return at the end:
  return (
    <div className="admin-whcc-modal">
          <h2>Import Products from WHCC</h2>
          {error && <div className="info-box-error info-box-error-margin">✗ {error}</div>}
          {info && <div className="info-box info-box-margin">{info}</div>}
          {/* Step 1: Select Price List */}
          {step === 'select-list' && (
            <div className="admin-whcc-step-select-list">
              <label htmlFor="price-list-select" className="admin-whcc-select-label">Select a Price List:</label>
              <select
                id="price-list-select"
                value={selectedPriceListId || ''}
                onChange={e => setSelectedPriceListId(e.target.value)}
                className="admin-whcc-select"
              >
                <option value="" disabled>Select a price list...</option>
                {priceLists.map((pl: any) => (
                  <option key={pl.id} value={pl.id}>{pl.name}</option>
                ))}
              </select>
              <div className="admin-whcc-modal-footer">
                <button
                  className="btn btn-primary"
                  disabled={!selectedPriceListId}
                  onClick={() => setStep('select-products')}
                >
                  Next: Select Products
                </button>
                <button onClick={onClose} className="btn btn-secondary admin-whcc-btn-margin">Cancel</button>
              </div>
            </div>
          )}
          {/* Step 2: Select Products */}
          {step === 'select-products' && (
            <>
              <p className="admin-whcc-desc">Select the WHCC products you want to import. Use the checkboxes to select/deselect.</p>
              {loading ? (
                <div>Loading WHCC products...</div>
              ) : (
                <>
                  {(Object.keys(groupedProducts).length > 0 && missingPrices > 0) && (
                    <div className="admin-whcc-warning">
                      {missingPrices > 0 && <div>Warning: {missingPrices} products are missing prices and will show as <b>No Cost</b>.</div>}
                    </div>
                  )}
                  <div className="admin-whcc-toolbar">
                    <button onClick={handleSelectAll} className="btn btn-secondary admin-whcc-btn-margin">Select All</button>
                    <button onClick={handleDeselectAll} className="btn btn-secondary admin-whcc-btn-margin">Deselect All</button>
                    <button onClick={handleExpandAll} className="btn btn-secondary admin-whcc-btn-margin">Expand All</button>
                    <button onClick={handleCollapseAll} className="btn btn-secondary admin-whcc-btn-margin">Collapse All</button>
                  </div>
                  <div className="admin-whcc-products-list">
                    {Object.keys(groupedProducts).length === 0 ? (
                      <div className="admin-whcc-no-products">No WHCC products available.</div>
                    ) : (
                      getAllCategoryKeys(groupedProducts).map((cat) => (
                        <div key={`cat-${cat}`} className="admin-whcc-category-card">
                          <div className="admin-whcc-category-header" onClick={() => toggleCollapse('cat-' + cat)}>
                            <input
                              type="checkbox"
                              checked={isCategorySelected(cat)}
                              onChange={e => handleCategorySelect(cat, e.target.checked)}
                              onClick={e => e.stopPropagation()}
                              className="admin-whcc-checkbox-space"
                            />
                            {cat} {collapsed['cat-' + cat] ? '▶' : '▼'}
                          </div>
                          {!collapsed['cat-' + cat] && (
                            <div className="admin-whcc-category-children">
                              {getAllProductKeys(groupedProducts, cat).map(prod => (
                                <div key={`prod-${cat}-${prod}`} className="admin-whcc-product-group">
                                  <div className="admin-whcc-product-header" onClick={() => toggleCollapse('prod-' + cat + '-' + prod)}>
                                    <input
                                      type="checkbox"
                                      checked={isProductSelected(cat, prod)}
                                      onChange={e => handleProductSelect(cat, prod, e.target.checked)}
                                      onClick={e => e.stopPropagation()}
                                      className="admin-whcc-checkbox-space"
                                    />
                                    {prod} {collapsed['prod-' + cat + '-' + prod] ? '▶' : '▼'}
                                  </div>
                                  {!collapsed['prod-' + cat + '-' + prod] && (
                                    <div className="admin-whcc-size-list">
                                      {getAllSizeKeys(groupedProducts, cat, prod).map(size => {
                                        const product = groupedProducts[cat][prod][size];
                                        const selected = isSizeSelected(cat, prod, size);
                                        const mapping = selectedProducts.get(product.selectionKey) || {};
                                        return (
                                          <div key={`size-${cat}-${prod}-${size}-${product.productUID}`} className="admin-whcc-product-row admin-whcc-row">
                                            <label className="admin-whcc-row-label">
                                              <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={e => handleSizeSelect(cat, prod, size, e.target.checked)}
                                                className="admin-whcc-checkbox-space"
                                              />
                                              <span className="admin-whcc-size">{size}</span>
                                              <span className="admin-whcc-name">{product.name || product.Name}</span>
                                              <span className={`admin-whcc-price ${product.price ? '' : 'admin-whcc-price-missing'}`}>
                                                {product.price ? `$${product.price}` : 'No Cost'}
                                              </span>
                                            </label>
                                            {selected && (
                                              <div className="admin-whcc-row-actions">
                                                <label className="admin-whcc-custom-label">
                                                  <input
                                                    type="checkbox"
                                                    checked={!!mapping.useCustomPrice}
                                                    onChange={e => updateMapping(product.selectionKey, { useCustomPrice: e.target.checked })}
                                                    className="admin-whcc-checkbox-space"
                                                  />
                                                  Custom Price:
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    value={mapping.customPrice ?? ''}
                                                    onChange={e => updateMapping(product.selectionKey, { customPrice: e.target.value, useCustomPrice: true })}
                                                    className="admin-whcc-custom-input"
                                                    disabled={!mapping.useCustomPrice}
                                                  />
                                                </label>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  {/* Sticky footer for action buttons */}
                  <div className="admin-whcc-modal-footer">
                    <button
                      className="btn btn-primary admin-whcc-btn-margin"
                      disabled={selectedProducts.size === 0}
                      onClick={() => setStep('confirm')}
                    >
                      Next: Confirm Import
                    </button>
                    <button onClick={onClose} className="btn btn-secondary admin-whcc-btn-margin">Cancel</button>
                  </div>
                </>
              )}
            </>
          )}
          {/* Step 3: Confirm Import */}
          {step === 'confirm' && (
            <>
              <p className="admin-whcc-desc">Review what will happen when you import, then click <strong>Import to Price List</strong>.</p>
              {previewLoading ? (
                <div style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Analysing existing list…</div>
              ) : (
                <>
                  {/* Summary badges */}
                  {previewRows.length > 0 && (() => {
                    const newCount = previewRows.filter(r => r.status === 'new').length;
                    const enrichCount = previewRows.filter(r => r.status === 'enrich').length;
                    const unchangedCount = previewRows.filter(r => r.status === 'unchanged').length;
                    return (
                      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        {newCount > 0 && (
                          <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '3px 10px', fontWeight: 600, fontSize: 13 }}>
                            🟢 {newCount} new
                          </span>
                        )}
                        {enrichCount > 0 && (
                          <span style={{ background: '#fef9c3', color: '#713f12', borderRadius: 6, padding: '3px 10px', fontWeight: 600, fontSize: 13 }}>
                            🟡 {enrichCount} enrich (WHCC mapping missing)
                          </span>
                        )}
                        {unchangedCount > 0 && (
                          <span style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', borderRadius: 6, padding: '3px 10px', fontWeight: 600, fontSize: 13, border: '1px solid var(--border-color)' }}>
                            ⚫ {unchangedCount} already up-to-date
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {/* Preview table */}
                  {previewRows.length > 0 && (
                    <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 12 }}>
                      <table className="data-table" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Size</th>
                            <th>Category</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, i) => (
                            <tr key={i} style={{ opacity: row.status === 'unchanged' ? 0.5 : 1 }}>
                              <td>{row.name}</td>
                              <td>{row.size}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{row.cat}</td>
                              <td>
                                {row.status === 'new' && <span style={{ color: '#065f46', fontWeight: 600 }}>Add new</span>}
                                {row.status === 'enrich' && <span style={{ color: '#92400e', fontWeight: 600 }}>Enrich (fill WHCC)</span>}
                                {row.status === 'unchanged' && <span style={{ color: 'var(--text-secondary)' }}>No change</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              <div className="admin-whcc-modal-footer">
                <button onClick={() => setStep('select-products')} className="btn btn-secondary">Back</button>
                <button onClick={handleImport} disabled={importing || previewLoading} className="btn btn-success">{importing ? 'Importing...' : 'Import to Price List'}</button>
                <button onClick={onImportComplete} disabled={importing} className="btn btn-primary">Done &amp; Refresh</button>
                <button onClick={onClose} className="btn btn-secondary admin-whcc-btn-margin">Cancel</button>
              </div>
            </>
          )}
    </div>
  );
}

export default AdminWhccImport;

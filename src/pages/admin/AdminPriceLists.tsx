import React, { useState, useEffect } from 'react';
import { studioService, Studio } from '../../services/studioService';
import { PriceList, Package, PriceListProductSize } from '../../types';
import { priceListAdminService } from '../../services/priceListAdminService';
import { packageService } from '../../services/packageService';
import { parseCSVData, createPriceListFromImport, detectColumnsFromCSV, ColumnSuggestion, ColumnMapping } from '../../services/priceListService';
import { siteConfigService } from '../../services/siteConfigService';
import AdminWhccImport from '../../components/AdminWhccImport';
import AdminMpixImport from '../../components/AdminMpixImport';
import { useAuth } from '../../contexts/AuthContext';


const AdminPriceLists: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showWhccImport, setShowWhccImport] = useState(false);
  const [showMpixImport, setShowMpixImport] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [packageForm, setPackageForm] = useState({
    name: '',
    description: '',
    packagePrice: 0,
    items: [] as { productId: number; productSizeId: number; quantity: number }[],
    isActive: true,
  });
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    description: '',
    category: 'General',
    basePrice: 0,
    cost: 0,
    isDigital: false,
    isActive: true,
    popularity: 0,
  });
  
  // Form states
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [studios, setStudios] = useState<Studio[]>([]);
  const [newListStudioId, setNewListStudioId] = useState<number|null>(null);
    useEffect(() => {
      if (isSuperAdmin) {
        studioService.getAll().then(setStudios).catch(() => setStudios([]));
      }
    }, [isSuperAdmin]);
  
  // Import states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileText, setImportFileText] = useState<string>('');
  const [columnSuggestions, setColumnSuggestions] = useState<ColumnSuggestion | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [importedData, setImportedData] = useState<Array<{ productName: string; items: Array<{ sizeName: string; width?: number; height?: number; price: number; cost?: number }> }>>([]);
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [importTargetPriceListId, setImportTargetPriceListId] = useState<number | null>(null);
  const [combineImportVariants, setCombineImportVariants] = useState(true);
  // ...existing code...

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedPriceList) {
      loadPackages(selectedPriceList.id);
    } else {
      setPackages([]);
    }
  }, [selectedPriceList]);

  const loadData = async () => {
    try {
      const lists = await priceListAdminService.getAll();
      setPriceLists(lists);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPackages = async (priceListId: number) => {
    setPackagesLoading(true);
    try {
      const pkgData = await packageService.getAll(priceListId);
      setPackages(pkgData);
    } catch (error) {
      console.error('Failed to load packages:', error);
    } finally {
      setPackagesLoading(false);
    }
  };

  const handleCreatePriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    try {
      const newList = await priceListAdminService.create({
        name: newListName,
        description: newListDesc,
        products: [],
        studioId: newListStudioId ?? null,
      });
      setPriceLists([...priceLists, newList]);
      setNewListName('');
      setNewListDesc('');
      setNewListStudioId(null);
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create price list:', error);
    }
  };

  const handleDeletePriceList = async (id: number) => {
    if (confirm('Are you sure you want to delete this price list?')) {
      try {
        await priceListAdminService.delete(id);
        setPriceLists(priceLists.filter(pl => pl.id !== id));
        if (selectedPriceList?.id === id) {
          setSelectedPriceList(null);
        }
      } catch (error) {
        console.error('Failed to delete price list:', error);
      }
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await priceListAdminService.setDefault(id);
      const updated = await priceListAdminService.getAll();
      setPriceLists(updated);
      if (selectedPriceList) {
        const refreshed = updated.find(pl => pl.id === selectedPriceList.id);
        setSelectedPriceList(refreshed || null);
      }
    } catch (error) {
      console.error('Failed to set default price list:', error);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportError('');
      // Read file and show mapping step
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          setImportFileText(text);
          const suggestions = detectColumnsFromCSV(text);
          setColumnSuggestions(suggestions);
          setColumnMapping(suggestions);
          setImportStep('mapping');
        } catch (error) {
          setImportError(error instanceof Error ? error.message : 'Failed to read file');
        }
      };
      reader.readAsText(file);
    }
  };

  const closeImportDialog = () => {
    setShowImportDialog(false);
    setImportStep('upload');
    setImportedData([]);
    setImportFile(null);
    setImportFileText('');
    setImportName('');
    setImportDesc('');
    setImportError('');
    setColumnSuggestions(null);
    setColumnMapping(null);
    setImportTargetPriceListId(null);
  };

  const handleParseImport = async () => {
    if (!importFileText || !columnMapping) return;

    setImportLoading(true);
    try {
      const parsedData = parseCSVData(importFileText, columnMapping);
      
      // Group by product name
      const grouped = new Map<string, typeof parsedData>();
      parsedData.forEach(item => {
        const key = item.productName.toLowerCase();
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(item);
      });
      
      // Convert to mappings
      const mappings = Array.from(grouped.entries()).map(([productName, items]) => ({
        productName,
        items: items.map(item => ({
          sizeName: item.sizeName,
          width: item.width,
          height: item.height,
          price: item.price,
          cost: item.cost,
        })),
      }));
      
      setImportedData(mappings);
      setImportName(`Imported - ${importFile?.name.replace(/\.[^/.]+$/, '') || 'Pricing'}`);
      setImportStep('preview');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to parse CSV');
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importedData.length || (importTargetPriceListId === null && !importName.trim())) return;

    setImportLoading(true);
    try {
      let targetPriceListId = importTargetPriceListId;
      // If creating new price list
      if (targetPriceListId === null) {
        const newPriceList = await createPriceListFromImport(importName, importDesc);
        targetPriceListId = newPriceList.id;
      }

      // Check existing product names for selected target list
      const targetPriceList = await priceListAdminService.getById(targetPriceListId);
      const existingProductNames = new Set(targetPriceList?.products?.map(p => p.name.toLowerCase()) || []);

      const getBaseName = (name: string) => {
        const raw = String(name || '').trim();
        if (!raw) return raw;

        const normalized = raw.replace(/\s+/g, ' ').trim();
        const withParenVariant = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/i);
        if (withParenVariant?.[1]) {
          return withParenVariant[1].trim();
        }

        const trailingVariantPatterns = [
          /^(.*?)\s+(\d+(?:\.\d+)?\s?(?:oz|ml|l|gb|tb|mm|cm|in|"|inch|inches))$/i,
          /^(.*?)\s+((?:iphone|ipad|ipod)\s*[a-z0-9+\-\s]+)$/i,
          /^(.*?)\s+((?:galaxy|pixel)\s*[a-z0-9+\-\s]+)$/i,
          /^(.*?)\s+((?:small|medium|large|xl|xxl))$/i,
        ];

        for (const pattern of trailingVariantPatterns) {
          const match = normalized.match(pattern);
          if (match?.[1]) {
            return match[1].trim();
          }
        }

        const cleaned = normalized
          .replace(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        return cleaned || normalized;
      };

      const getVariantSizeName = (name: string) => {
        const raw = String(name || '').trim();
        if (!raw) return null;

        const normalized = raw.replace(/\s+/g, ' ').trim();
        const withParenVariant = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/i);
        if (withParenVariant?.[2]) {
          return withParenVariant[2].trim();
        }

        const trailingVariantPatterns = [
          /^(.*?)\s+(\d+(?:\.\d+)?\s?(?:oz|ml|l|gb|tb|mm|cm|in|"|inch|inches))$/i,
          /^(.*?)\s+((?:iphone|ipad|ipod)\s*[a-z0-9+\-\s]+)$/i,
          /^(.*?)\s+((?:galaxy|pixel)\s*[a-z0-9+\-\s]+)$/i,
          /^(.*?)\s+((?:small|medium|large|xl|xxl))$/i,
        ];

        for (const pattern of trailingVariantPatterns) {
          const match = normalized.match(pattern);
          if (match?.[2]) {
            return match[2].trim();
          }
        }

        return null;
      };

      // Group imported rows by base product name and merge sizes
      const groupedByBase = new Map<string, Array<{ sizeName: string; width?: number; height?: number; price: number; cost?: number }>>();
      importedData.forEach((group) => {
        const baseName = combineImportVariants ? getBaseName(group.productName) : group.productName;
        const variantSizeName = combineImportVariants ? getVariantSizeName(group.productName) : null;
        if (!groupedByBase.has(baseName)) {
          groupedByBase.set(baseName, []);
        }

        const mappedItems = group.items.map((item) => {
          const currentSize = String(item.sizeName || '').trim();
          const hasMeaningfulSize = currentSize && currentSize.toLowerCase() !== 'default';
          return {
            ...item,
            sizeName: hasMeaningfulSize ? currentSize : (variantSizeName || currentSize || 'Default'),
          };
        });

        groupedByBase.get(baseName)!.push(...mappedItems);
      });

      const skippedDuplicates: string[] = [];
      const items: Array<{ productName: string; sizes: Array<{ sizeName: string; width?: number; height?: number; price: number; cost?: number }> }> = [];

      groupedByBase.forEach((sizeItems, productName) => {
        if (existingProductNames.has(productName.toLowerCase())) {
          skippedDuplicates.push(productName);
          return;
        }

        // Dedupe size rows by dimensions + size name
        const seenSizes = new Set<string>();
        const uniqueSizes = sizeItems.filter((item) => {
          const key = `${item.width ?? ''}x${item.height ?? ''}|${item.sizeName.toLowerCase()}`;
          if (seenSizes.has(key)) return false;
          seenSizes.add(key);
          return true;
        });

        items.push({
          productName,
          sizes: uniqueSizes.map((item) => ({
            sizeName: item.sizeName,
            width: item.width,
            height: item.height,
            price: item.price,
            cost: item.cost,
          })),
        });
      });

      if (items.length === 0) {
        setImportError('All imported products already exist in this price list');
        setImportLoading(false);
        return;
      }

      // Add items to the selected or new price list
      await priceListAdminService.addItemsToPriceList(targetPriceListId, items);

      if (skippedDuplicates.length > 0) {
        alert(`Imported ${items.length} product group(s). Skipped ${skippedDuplicates.length} duplicate product(s).`);
      }

      await loadData();
      closeImportDialog();
    } catch (error) {
      console.error('Failed to import price list items:', error);
      setImportError('Failed to import price list items');
    } finally {
      setImportLoading(false);
    }
  };

  const resetAddProductForm = () => {
    setNewProductForm({
      name: '',
      description: '',
      category: 'General',
      basePrice: 0,
      cost: 0,
      isDigital: false,
      isActive: true,
      popularity: 0,
    });
  };

  const refreshSelectedPriceList = async (priceListId: number) => {
    const refreshed = await priceListAdminService.getById(priceListId);
    if (refreshed) {
      setSelectedPriceList(refreshed);
      setPriceLists((prev) => prev.map((pl) => (pl.id === refreshed.id ? { ...pl, ...refreshed } : pl)));
    }
  };

  const handleOpenAddProduct = () => {
    if (!selectedPriceList) return;
    resetAddProductForm();
    setShowAddProductModal(true);
  };

  const handleSubmitAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPriceList || !newProductForm.name.trim()) return;

    setProductSubmitting(true);
    try {
      await priceListAdminService.addProduct(selectedPriceList.id, {
        ...newProductForm,
        name: newProductForm.name.trim(),
      });
      setShowAddProductModal(false);
      resetAddProductForm();
      await refreshSelectedPriceList(selectedPriceList.id);
    } catch (error) {
      console.error('Failed to add product:', error);
      alert('Failed to add product');
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleRemoveProduct = async (priceListId: number, productId: number) => {
    if (!confirm('Delete this product from this price list?')) return;

    try {
      await priceListAdminService.removeProduct(priceListId, productId);
      await refreshSelectedPriceList(priceListId);
    } catch (error) {
      console.error('Failed to remove product:', error);
      alert('Failed to remove product');
    }
  };

  const handleRemoveProductSize = async (priceListId: number, productId: number, size: PriceListProductSize) => {
    if (!confirm(`Delete size "${size.name}"?`)) return;

    try {
      await priceListAdminService.removeProductSize(priceListId, productId, size.id);
      await refreshSelectedPriceList(priceListId);
    } catch (error) {
      console.error('Failed to remove product size:', error);
      alert('Failed to remove size');
    }
  };

  // Package management
  const handleCreatePackage = () => {
    setEditingPackage(null);
    setPackageForm({
      name: '',
      description: '',
      packagePrice: 0,
      items: [],
      isActive: true,
    });
    setShowPackageModal(true);
  };

  const handleEditPackage = (pkg: Package) => {
    setEditingPackage(pkg);
    setPackageForm({
      name: pkg.name,
      description: pkg.description,
      packagePrice: pkg.packagePrice,
      items: pkg.items,
      isActive: pkg.isActive,
    });
    setShowPackageModal(true);
  };

  const handleDeletePackage = async (id: number) => {
    if (!selectedPriceList) return;
    if (confirm('Are you sure you want to delete this package?')) {
      try {
        await packageService.delete(id);
        loadPackages(selectedPriceList.id);
      } catch (error) {
        console.error('Failed to delete package:', error);
      }
    }
  };

  const addPackageItem = () => {
    if (!selectedPriceList || selectedPriceList.products.length === 0) return;
    const firstProduct = selectedPriceList.products[0];
    const firstSize = firstProduct.sizes[0];
    if (!firstSize) return;
    setPackageForm({
      ...packageForm,
      items: [...packageForm.items, { productId: firstProduct.id, productSizeId: firstSize.id, quantity: 1 }],
    });
  };

  const removePackageItem = (index: number) => {
    setPackageForm({
      ...packageForm,
      items: packageForm.items.filter((_, i) => i !== index),
    });
  };

  const updatePackageItem = (index: number, field: string, value: any) => {
    const newItems = [...packageForm.items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'productId' && selectedPriceList) {
      const product = selectedPriceList.products.find(p => p.id === value);
      if (product && product.sizes.length > 0) {
        newItems[index].productSizeId = product.sizes[0].id;
      }
    }

    setPackageForm({ ...packageForm, items: newItems });
  };

  const handleSubmitPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPriceList) return;
    try {
      if (editingPackage) {
        await packageService.update(editingPackage.id, {
          ...packageForm,
          priceListId: selectedPriceList.id,
        });
      } else {
        await packageService.create({
          ...packageForm,
          priceListId: selectedPriceList.id,
        });
      }
      setShowPackageModal(false);
      loadPackages(selectedPriceList.id);
    } catch (error) {
      console.error('Failed to save package:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="admin-page">
        <div className="page-header">
          <h1>Price Lists</h1>
        </div>
        <div className="info-box" style={{ border: '1px solid var(--border-color)' }}>
          Price list management is available to super admins only.
        </div>
      </div>
    );
  }

  // Fetch latest price list details (with products) when selected
  const handleSelectPriceList = async (priceListId: number) => {
    setLoading(true);
    try {
      const pl = await priceListAdminService.getById(priceListId);
      setSelectedPriceList(pl);
    } catch (error) {
      console.error('Failed to fetch price list details:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Price Lists</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => setShowCreateForm(true)} className="btn btn-primary">
            + Create Price List
          </button>
          <button onClick={() => setShowImportDialog(true)} className="btn btn-secondary">
            📥 Import from CSV
          </button>
          <button onClick={() => setShowWhccImport(true)} className="btn btn-secondary" title="Import products from WHCC">
            📦 Import from WHCC
          </button>
          {siteConfigService.isSiteEnabled('mpix') && (
            <button onClick={() => setShowMpixImport(true)} className="btn btn-secondary" title="Import products from Mpix">
              📸 Import from Mpix
            </button>
          )}
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="modal-overlay">
          <div className="modal-content admin-modal-content" style={{ padding: '2rem' }}>
            <h2>Create Price List</h2>
            <form onSubmit={handleCreatePriceList}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  placeholder="e.g., Summer Sale 2026"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newListDesc}
                  onChange={e => setNewListDesc(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Studio</label>
                <select
                  value={newListStudioId === null ? '' : newListStudioId}
                  onChange={e => setNewListStudioId(e.target.value === '' ? null : Number(e.target.value))}
                  required={false}
                >
                  <option value="">Global (All Studios)</option>
                  {studios.map(studio => (
                    <option key={studio.id} value={studio.id}>{studio.name}</option>
                  ))}
                </select>
                <div className="muted-text" style={{ fontSize: '0.85rem' }}>
                  If you select a studio, only that studio can use this price list. Leave as Global to make available to all studios.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateForm(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Dialog Modal */}
      {showImportDialog && (
        <div className="modal-overlay" onClick={closeImportDialog}>
          <div className="modal-content admin-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
            <button
              type="button"
              onClick={closeImportDialog}
              className="btn-close"
              aria-label="Close import dialog"
              style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}
            >
              ×
            </button>
            <h2>Import Price List from CSV</h2>
            
            {importStep === 'upload' && (
              <>
                <p className="muted-text" style={{ marginBottom: '1rem' }}>
                  Upload a CSV file. We'll help you map the columns.
                </p>
                <div className="form-group">
                  <label>CSV File</label>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    disabled={importLoading}
                  />
                </div>
                
                {importError && (
                  <div className="info-box-error" style={{ marginBottom: '1rem' }}>
                    {importError}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={closeImportDialog}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {importStep === 'mapping' && columnSuggestions && columnMapping && (
              <>
                <h3>Map CSV Columns</h3>
                <p className="muted-text" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  We detected your CSV columns. Adjust the mapping if needed, then proceed to preview.
                </p>

                <div className="form-row" style={{ marginBottom: '1.5rem' }}>
                  <div className="form-group">
                    <label>Product Column *</label>
                    <select
                      value={columnMapping.productIdx}
                      onChange={e => setColumnMapping({ ...columnMapping, productIdx: parseInt(e.target.value) })}
                    >
                      {columnSuggestions.headers.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Price Column *</label>
                    <select
                      value={columnMapping.priceIdx}
                      onChange={e => setColumnMapping({ ...columnMapping, priceIdx: parseInt(e.target.value) })}
                    >
                      {columnSuggestions.headers.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Size Column</label>
                    <select
                      value={columnMapping.sizeIdx}
                      onChange={e => setColumnMapping({ ...columnMapping, sizeIdx: parseInt(e.target.value) })}
                    >
                      <option value={-1}>— Not used —</option>
                      {columnSuggestions.headers.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Cost Column</label>
                    <select
                      value={columnMapping.costIdx}
                      onChange={e => setColumnMapping({ ...columnMapping, costIdx: parseInt(e.target.value) })}
                    >
                      <option value={-1}>— Not used —</option>
                      {columnSuggestions.headers.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Width Column</label>
                    <select
                      value={columnMapping.widthIdx}
                      onChange={e => setColumnMapping({ ...columnMapping, widthIdx: parseInt(e.target.value) })}
                    >
                      <option value={-1}>— Not used —</option>
                      {columnSuggestions.headers.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Height Column</label>
                    <select
                      value={columnMapping.heightIdx}
                      onChange={e => setColumnMapping({ ...columnMapping, heightIdx: parseInt(e.target.value) })}
                    >
                      <option value={-1}>— Not used —</option>
                      {columnSuggestions.headers.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Description Column</label>
                    <select
                      value={columnMapping.descriptionIdx}
                      onChange={e => setColumnMapping({ ...columnMapping, descriptionIdx: parseInt(e.target.value) })}
                    >
                      <option value={-1}>— Not used —</option>
                      {columnSuggestions.headers.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {importError && (
                  <div className="info-box-error" style={{ marginBottom: '1rem' }}>
                    {importError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setImportStep('upload');
                      setImportFile(null);
                      setColumnSuggestions(null);
                      setColumnMapping(null);
                      setImportError('');
                    }}
                    className="btn btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={closeImportDialog}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleParseImport}
                    disabled={importLoading || columnMapping.productIdx === -1 || columnMapping.priceIdx === -1}
                    className="btn btn-primary"
                  >
                    {importLoading ? 'Parsing...' : 'Preview Data'}
                  </button>
                </div>
              </>
            )}

            {importStep === 'preview' && importedData.length > 0 && (
              <>
                <h3>Review Grouped Products</h3>
                <p className="muted-text" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {importedData.length} product group(s) found.
                </p>

                <div className="import-scroll-panel" style={{ marginBottom: '1.5rem', maxHeight: '300px' }}>
                  {importedData.map((mapping, idx) => (
                    <div
                      key={idx}
                      className="import-product-card"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <strong>{mapping.productName}</strong>
                          <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                            Sizes: {mapping.items.map(i => `${i.sizeName} ($${i.price.toFixed(2)}${i.cost ? `, Cost: $${i.cost.toFixed(2)}` : ''})`).join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label>Import into Price List</label>
                  <select
                    value={importTargetPriceListId ?? ''}
                    onChange={e => setImportTargetPriceListId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Create New Price List</option>
                    {priceLists.map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={combineImportVariants}
                      onChange={(e) => setCombineImportVariants(e.target.checked)}
                    />
                    Combine variant product names into one product (use suffix as size)
                  </label>
                  <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                    Example: “Photo Mug 11oz” + “Photo Mug 15oz” → product “Photo Mug” with sizes “11oz” and “15oz”.
                  </div>
                </div>
                {importTargetPriceListId === null && (
                  <>
                    <div className="form-group">
                      <label>Price List Name *</label>
                      <input
                        type="text"
                        value={importName}
                        onChange={e => setImportName(e.target.value)}
                        placeholder="e.g., Q1 2026 Pricing"
                      />
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <textarea
                        value={importDesc}
                        onChange={e => setImportDesc(e.target.value)}
                        placeholder="Optional"
                        rows={2}
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setImportStep('mapping');
                      setImportedData([]);
                    }}
                    className="btn btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={closeImportDialog}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={!importName.trim() || importLoading}
                    className="btn btn-primary"
                  >
                    {importLoading ? 'Importing...' : 'Import Price List'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Price Lists Grid */}
      <div className="selection-grid">
        {priceLists.map(priceList => {
          let studioName = 'Global';
          if ((priceList as any).studioId) {
            const studio = studios.find(s => s.id === (priceList as any).studioId);
            if (studio) studioName = studio.name;
            else studioName = `Studio #${(priceList as any).studioId}`;
          }
          return (
            <div
              key={priceList.id}
              className={`selection-card ${selectedPriceList?.id === priceList.id ? 'active' : ''}`}
              onClick={() => handleSelectPriceList(priceList.id)}
            >
              <h3 className="selection-card-title">{priceList.name}</h3>
              <p className="muted-text" style={{ fontSize: '0.9rem', margin: '0.5rem 0' }}>
                {priceList.description || 'No description'}
              </p>
              <p className="muted-text" style={{ fontSize: '0.85rem', margin: '0.5rem 0' }}>
                {(typeof priceList.productCount === 'number'
                  ? priceList.productCount
                  : (Array.isArray(priceList.products) ? priceList.products.length : 0))} product(s)
              </p>
              <p className="muted-text" style={{ fontSize: '0.85rem', margin: '0.5rem 0' }}>
                <strong>Studio:</strong> {studioName}
              </p>
              {priceList.isDefault && (
                <span className="status-badge status-active" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                  Default
                </span>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleSetDefault(priceList.id);
                  }}
                  className="btn btn-sm"
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                  disabled={priceList.isDefault}
                >
                  {priceList.isDefault ? 'Default' : 'Set Default'}
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleDeletePriceList(priceList.id);
                  }}
                  className="btn btn-sm"
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Details Panel */}
      {selectedPriceList && (
        <div className="detail-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>{selectedPriceList.name} - Details</h2>
            <button onClick={handleOpenAddProduct} className="btn btn-primary">
              + Add Product
            </button>
          </div>
          <p className="muted-text" style={{ marginBottom: '1rem', marginTop: '0.5rem' }}>
            {(Array.isArray(selectedPriceList.products) ? selectedPriceList.products.length : 0)} product(s)
          </p>

          <div className="analytics-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Size</th>
                  <th style={{ textAlign: 'right' }}>Lab Cost</th>
                  <th style={{ textAlign: 'right' }}>Price (Base)</th>
                  <th style={{ textAlign: 'right' }}>Profit</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(selectedPriceList.products) && selectedPriceList.products.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="muted-text" style={{ padding: '1rem', textAlign: 'center' }}>
                      No products yet. Click “Add Product” to create one.
                    </td>
                  </tr>
                ) : (
                  (Array.isArray(selectedPriceList.products) ? selectedPriceList.products : []).flatMap(product => {
                    // Defensive: accept any product shape
                    const sizes = Array.isArray(product.sizes) && product.sizes.length > 0
                      ? product.sizes
                      : (Array.isArray(product.sizes) ? product.sizes : []);
                    if (sizes.length > 0) {
                      return sizes.map((size, idx) => (
                        <tr key={String(product.id) + '-' + String(size.id)}>
                          <td>
                            {idx === 0 ? (
                              <>
                                <strong>{product.name || 'Unnamed Product'}</strong>
                                <div className="muted-text" style={{ fontSize: '0.8rem' }}>{product.isDigital ? 'Digital' : 'Physical'}</div>
                              </>
                            ) : null}
                          </td>
                          <td>{size.name || ''}</td>
                          <td style={{ textAlign: 'right' }}>
                            {typeof size.cost === 'number' ? `$${size.cost.toFixed(2)}` : '$0.00'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {typeof (size.basePrice ?? size.price) === 'number' ? `$${Number(size.basePrice ?? size.price).toFixed(2)}` : ''}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              color: Number((size.basePrice ?? size.price) || 0) - Number(size.cost || 0) >= 0 ? '#10b981' : '#ef4444',
                              fontWeight: 600,
                            }}
                          >
                            ${(
                              Number(size.basePrice ?? size.price) - Number(size.cost || 0)
                            ).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleRemoveProductSize(selectedPriceList.id, product.id, size)}
                                className="btn btn-sm"
                              >
                                Remove Size
                              </button>
                              {idx === 0 ? (
                                <button
                                  onClick={() => handleRemoveProduct(selectedPriceList.id, product.id)}
                                  className="btn btn-danger btn-sm"
                                >
                                  Remove Product
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ));
                    } else {
                      return [
                        <tr key={String(product.id) + '-no-sizes'}>
                          <td>
                            <strong>{product.name || 'Unnamed Product'}</strong>
                            <div className="muted-text" style={{ fontSize: '0.8rem' }}>{product.isDigital ? 'Digital' : 'Physical'}</div>
                          </td>
                          <td colSpan={4}>
                            <span className="muted-text">No sizes</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleRemoveProduct(selectedPriceList.id, product.id)}
                              className="btn btn-danger btn-sm"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ];
                    }
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Packages Section */}
          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>Packages for this price list</h3>
              <button onClick={handleCreatePackage} className="btn btn-primary" disabled={packagesLoading}>
                + Create Package
              </button>
            </div>
            {packagesLoading ? (
              <div className="loading">Loading packages...</div>
            ) : packages.length === 0 ? (
              <p className="muted-text" style={{ fontStyle: 'italic' }}>No packages yet for this price list.</p>
            ) : (
              <div className="table-container" style={{ marginTop: '0.5rem' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Items</th>
                      <th>Retail Value</th>
                      <th>Package Price</th>
                      <th>Savings</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map(pkg => {
                      const retailValue = pkg.items.reduce((total, item) => {
                        const product = selectedPriceList.products.find(p => p.id === item.productId);
                        const size = product?.sizes.find(s => s.id === item.productSizeId);
                        const price = size?.price ?? 0;
                        return total + price * item.quantity;
                      }, 0);
                      const savings = retailValue - pkg.packagePrice;
                      const savingsPercent = retailValue > 0 ? ((savings / retailValue) * 100).toFixed(0) : '0';

                      return (
                        <tr key={pkg.id}>
                          <td><strong>{pkg.name}</strong></td>
                          <td>{pkg.description}</td>
                          <td>
                            {pkg.items.map((item, idx) => {
                              const product = selectedPriceList.products.find(p => p.id === item.productId);
                              return (
                                <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                   {item.quantity}x {product?.name || 'Unknown'}
                                </div>
                              );
                            })}
                          </td>
                          <td>${retailValue.toFixed(2)}</td>
                          <td><strong>${pkg.packagePrice.toFixed(2)}</strong></td>
                          <td className="success-text">
                            ${savings.toFixed(2)} ({savingsPercent}%)
                          </td>
                          <td>
                            <span className={`status-badge ${pkg.isActive ? 'status-active' : 'status-inactive'}`}>
                              {pkg.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button onClick={() => handleEditPackage(pkg)} className="btn-icon">✏️</button>
                              <button onClick={() => handleDeletePackage(pkg.id)} className="btn-icon">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Package Modal */}
      {showPackageModal && selectedPriceList && (
        <div className="modal-overlay" onClick={() => setShowPackageModal(false)}>
          <div className="modal-content admin-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="modal-header admin-modal-header">
              <h2>{editingPackage ? 'Edit Package' : 'Create Package'}</h2>
              <button onClick={() => setShowPackageModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmitPackage} className="modal-body admin-modal-body">
              <div className="form-group">
                <label>Package Name</label>
                <input
                  type="text"
                  value={packageForm.name}
                  onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                  required
                  placeholder="e.g., Family Package"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={packageForm.description}
                  onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description"
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ margin: 0 }}>Package Items</label>
                  <button type="button" onClick={addPackageItem} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.25rem 0.75rem' }}>
                    + Add Item
                  </button>
                </div>
                {packageForm.items.length === 0 ? (
                  <p className="muted-text" style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                    No items yet. Add at least one product/size.
                  </p>
                ) : (
                  <div className="compact-item-list">
                    {packageForm.items.map((item, index) => {
                      const product = selectedPriceList.products.find(p => p.id === item.productId);
                      return (
                        <div key={index} className="compact-item-row">
                          <select
                            value={item.productId}
                            onChange={(e) => updatePackageItem(index, 'productId', parseInt(e.target.value))}
                            style={{ flex: 2 }}
                          >
                            {selectedPriceList.products.map(product => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                          <select
                            value={item.productSizeId}
                            onChange={(e) => updatePackageItem(index, 'productSizeId', parseInt(e.target.value))}
                            style={{ flex: 2 }}
                          >
                            {product?.sizes.map(size => (
                              <option key={size.id} value={size.id}>{size.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updatePackageItem(index, 'quantity', parseInt(e.target.value))}
                            style={{ width: '80px' }}
                          />
                          <button type="button" onClick={() => removePackageItem(index)} className="btn-icon" title="Remove">
                            🗑️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Package Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={packageForm.packagePrice}
                    onChange={(e) => setPackageForm({ ...packageForm, packagePrice: parseFloat(e.target.value) })}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.6rem' }}>
                  <input
                    id="package-active"
                    type="checkbox"
                    checked={packageForm.isActive}
                    onChange={(e) => setPackageForm({ ...packageForm, isActive: e.target.checked })}
                  />
                  <label htmlFor="package-active" style={{ margin: 0 }}>Active</label>
                </div>
              </div>

              <div className="modal-actions admin-modal-actions">
                <button type="button" onClick={() => setShowPackageModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingPackage ? 'Update Package' : 'Create Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProductModal && selectedPriceList && (
        <div className="modal-overlay" onClick={() => setShowAddProductModal(false)}>
          <div className="modal-content admin-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header admin-modal-header">
              <h2>Add Product to {selectedPriceList.name}</h2>
              <button onClick={() => setShowAddProductModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmitAddProduct} className="modal-body admin-modal-body">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={newProductForm.name}
                  onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                  required
                  placeholder="e.g., Print"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={2}
                  value={newProductForm.description}
                  onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <input
                    type="text"
                    value={newProductForm.category}
                    onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                    placeholder="General"
                  />
                </div>
                <div className="form-group">
                  <label>Popularity</label>
                  <input
                    type="number"
                    min={0}
                    value={newProductForm.popularity}
                    onChange={(e) => setNewProductForm({ ...newProductForm, popularity: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Base Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={newProductForm.basePrice}
                    onChange={(e) => setNewProductForm({ ...newProductForm, basePrice: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label>Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={newProductForm.cost}
                    onChange={(e) => setNewProductForm({ ...newProductForm, cost: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="form-row" style={{ gap: '1.5rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={newProductForm.isDigital}
                    onChange={(e) => setNewProductForm({ ...newProductForm, isDigital: e.target.checked })}
                  />
                  Digital product
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={newProductForm.isActive}
                    onChange={(e) => setNewProductForm({ ...newProductForm, isActive: e.target.checked })}
                  />
                  Active
                </label>
              </div>

              <div className="modal-actions admin-modal-actions">
                <button type="button" onClick={() => setShowAddProductModal(false)} className="btn btn-secondary" disabled={productSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={productSubmitting || !newProductForm.name.trim()}>
                  {productSubmitting ? 'Adding...' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WHCC Import Modal */}
      {showWhccImport && (
        <AdminWhccImport
          onClose={() => setShowWhccImport(false)}
          onImportComplete={() => {
            setShowWhccImport(false);
            loadData(); // Refresh the price lists
          }}
        />
      )}

      {/* Mpix Import Modal */}
      {showMpixImport && (
        <AdminMpixImport
          onClose={() => setShowMpixImport(false)}
          onImportComplete={() => {
            setShowMpixImport(false);
            loadData(); // Refresh the price lists
          }}
        />
      )}
    </>
  );
};

export default AdminPriceLists;

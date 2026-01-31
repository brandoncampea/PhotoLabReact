import React, { useState, useEffect } from 'react';
import { PriceList, Package } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';
import { priceListAdminService } from '../../services/priceListAdminService';
import { packageService } from '../../services/packageService';
import { parseCSVData, createPriceListFromImport, detectColumnsFromCSV, ColumnSuggestion, ColumnMapping } from '../../services/priceListService';
import { siteConfigService } from '../../services/siteConfigService';
import { isUseMockApi } from '../../utils/mockApiConfig';
import AdminWhccImport from '../../components/AdminWhccImport';
import AdminMpixImport from '../../components/AdminMpixImport';

const AdminPriceLists: React.FC = () => {
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
  
  // Form states
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  
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
      const lists = isUseMockApi()
        ? await adminMockApi.priceLists.getAll()
        : await priceListAdminService.getAll();
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
      const pkgData = isUseMockApi()
        ? await adminMockApi.packages.getAll(priceListId)
        : await packageService.getAll(priceListId);
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
      const newList = isUseMockApi()
        ? await adminMockApi.priceLists.create({
            name: newListName,
            description: newListDesc,
            products: [],
          })
        : await priceListAdminService.create({
            name: newListName,
            description: newListDesc,
            products: [],
          });
      setPriceLists([...priceLists, newList]);
      setNewListName('');
      setNewListDesc('');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create price list:', error);
    }
  };

  const handleDeletePriceList = async (id: number) => {
    if (confirm('Are you sure you want to delete this price list?')) {
      try {
        isUseMockApi()
          ? await adminMockApi.priceLists.delete(id)
          : await priceListAdminService.delete(id);
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
      isUseMockApi()
        ? await adminMockApi.priceLists.setDefault(id)
        : await priceListAdminService.setDefault(id);
      const updated = isUseMockApi()
        ? await adminMockApi.priceLists.getAll()
        : await priceListAdminService.getAll();
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
    if (!importedData.length || !importName.trim()) return;

    setImportLoading(true);
    try {
      await createPriceListFromImport(importName, importDesc);
      await loadData();
      setShowImportDialog(false);
      setImportStep('upload');
      setImportedData([]);
      setImportFile(null);
      setImportName('');
      setImportDesc('');
      setColumnSuggestions(null);
      setColumnMapping(null);
    } catch (error) {
      console.error('Failed to create imported price list:', error);
      setImportError('Failed to create price list from import');
    } finally {
      setImportLoading(false);
    }
  };

  const handleRemoveProduct = async (priceListId: number, productId: number) => {
    try {
      await adminMockApi.priceLists.removeProduct(priceListId, productId);
      const updated = priceLists.map(pl =>
        pl.id === priceListId
          ? { ...pl, products: pl.products.filter(p => p.id !== productId) }
          : pl
      );
      setPriceLists(updated);
      if (selectedPriceList?.id === priceListId) {
        setSelectedPriceList(updated.find(pl => pl.id === priceListId) || null);
      }
    } catch (error) {
      console.error('Failed to remove product:', error);
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
        isUseMockApi()
          ? await adminMockApi.packages.delete(id)
          : await packageService.delete(id);
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
        await adminMockApi.packages.update(editingPackage.id, {
          ...packageForm,
          priceListId: selectedPriceList.id,
        });
      } else {
        await adminMockApi.packages.create({
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

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Price Lists</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => setShowCreateForm(true)} className="btn btn-primary">
            + Create Price List
          </button>
          <button onClick={() => setShowImportDialog(true)} className="btn btn-secondary">
            📥 Import from CSV
          </button>
          {siteConfigService.isSiteEnabled('whcc') && (
            <button onClick={() => setShowWhccImport(true)} className="btn btn-secondary" title="Import products from WHCC">
              📦 Import from WHCC
            </button>
          )}
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
          <div className="modal-content">
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
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>Import Price List from CSV</h2>
            
            {importStep === 'upload' && (
              <>
                <p style={{ color: '#666', marginBottom: '1rem' }}>
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
                  <div style={{ color: '#dc3545', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
                    {importError}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportFile(null);
                      setImportError('');
                    }}
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
                <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  We detected your CSV columns. Adjust the mapping if needed, then proceed to preview.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
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
                  <div style={{ color: '#dc3545', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
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
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportStep('upload');
                      setImportFile(null);
                      setColumnSuggestions(null);
                      setImportError('');
                    }}
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
                <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {importedData.length} product group(s) found.
                </p>

                <div style={{ marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                  {importedData.map((mapping, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '6px',
                        marginBottom: '0.5rem',
                        border: '1px solid #e9ecef',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <strong>{mapping.productName}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '0.5rem' }}>
                            Sizes: {mapping.items.map(i => `${i.sizeName} ($${i.price.toFixed(2)}${i.cost ? `, Cost: $${i.cost.toFixed(2)}` : ''})`).join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

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
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportStep('upload');
                      setImportedData([]);
                      setImportFile(null);
                    }}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {priceLists.map(priceList => (
          <div
            key={priceList.id}
            style={{
              padding: '1.5rem',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              backgroundColor: selectedPriceList?.id === priceList.id ? '#e7f3ff' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => setSelectedPriceList(priceList)}
          >
            <h3 style={{ margin: '0 0 0.5rem 0' }}>{priceList.name}</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
              {priceList.description || 'No description'}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#999', margin: '0.5rem 0' }}>
              {Array.isArray(priceList.products) ? priceList.products.length : 0} product(s)
            </p>
            {priceList.isDefault && (
              <span className="status-badge active" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
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
        ))}
      </div>

      {/* Details Panel */}
      {selectedPriceList && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h2>{selectedPriceList.name} - Details</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            {selectedPriceList.products.length} product(s)
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.9rem',
            }}>
              <thead>
                <tr style={{ backgroundColor: '#e9ecef', borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Product</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Size</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedPriceList.products.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
                      No products yet. Use Products page to add them.
                    </td>
                  </tr>
                ) : (
                  selectedPriceList.products.map(product => (
                    <tr key={product.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '0.75rem' }}>{product.name}</td>
                      <td style={{ padding: '0.75rem' }}>{product.isDigital ? 'Digital' : 'Physical'}</td>
                      <td style={{ padding: '0.75rem' }}>{product.sizes.length} size(s)</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleRemoveProduct(selectedPriceList.id, product.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.8rem',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
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
              <p style={{ color: '#666', fontStyle: 'italic' }}>No packages yet for this price list.</p>
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
                              const size = product?.sizes.find(s => s.id === item.productSizeId);
                              return (
                                <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                  {item.quantity}x {product?.name || 'Unknown'} ({size?.name || 'Size'})
                                </div>
                              );
                            })}
                          </td>
                          <td>${retailValue.toFixed(2)}</td>
                          <td><strong>${pkg.packagePrice.toFixed(2)}</strong></td>
                          <td style={{ color: '#4caf50' }}>
                            ${savings.toFixed(2)} ({savingsPercent}%)
                          </td>
                          <td>
                            <span className={`status-badge ${pkg.isActive ? 'active' : 'inactive'}`}>
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <h2>{editingPackage ? 'Edit Package' : 'Create Package'}</h2>
              <button onClick={() => setShowPackageModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmitPackage} className="modal-body">
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
                  <p style={{ color: '#666', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    No items yet. Add at least one product/size.
                  </p>
                ) : (
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem' }}>
                    {packageForm.items.map((item, index) => {
                      const product = selectedPriceList.products.find(p => p.id === item.productId);
                      return (
                        <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
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

              <div className="modal-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
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

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          backgroundColor: rgba(0, 0, 0, 0.5);
          display: flex;
          alignItems: center;
          justifyContent: center;
          zIndex: 1000;
        }

        .modal-content {
          backgroundColor: white;
          borderRadius: 8px;
          padding: 2rem;
          maxWidth: 500px;
          width: 90%;
          boxShadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .form-group {
          marginBottom: 1rem;
        }

        .form-group label {
          display: block;
          marginBottom: 0.5rem;
          fontWeight: 500;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #ddd;
          borderRadius: 4px;
          fontFamily: inherit;
        }

        .btn-sm {
          padding: 0.5rem 1rem;
          fontSize: 0.85rem;
        }
      `}</style>

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
    </div>
  );
};

export default AdminPriceLists;

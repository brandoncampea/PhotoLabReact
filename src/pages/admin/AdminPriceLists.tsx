import React, { useState, useEffect } from 'react';
import { PriceList } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';
import { parseCSVData, createPriceListFromImport, detectColumnsFromCSV, ColumnSuggestion, ColumnMapping } from '../../services/priceListService';

const AdminPriceLists: React.FC = () => {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null);
  
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

  const loadData = async () => {
    try {
      const lists = await adminMockApi.priceLists.getAll();
      setPriceLists(lists);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    try {
      const newList = await adminMockApi.priceLists.create({
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
        await adminMockApi.priceLists.delete(id);
        setPriceLists(priceLists.filter(pl => pl.id !== id));
        if (selectedPriceList?.id === id) {
          setSelectedPriceList(null);
        }
      } catch (error) {
        console.error('Failed to delete price list:', error);
      }
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
      await createPriceListFromImport(importName, importDesc, importedData);
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
              {priceList.products.length} product(s)
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
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
    </div>
  );
};

export default AdminPriceLists;

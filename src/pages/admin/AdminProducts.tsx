import React, { useEffect, useState } from 'react';
import { PriceList, PriceListProduct, PriceListProductSize } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';

const AdminProducts: React.FC = () => {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PriceListProduct | null>(null);
  const [editingSize, setEditingSize] = useState<{ productId: number; size: PriceListProductSize } | null>(null);
  
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    isDigital: false,
  });

  const [sizeForm, setSizeForm] = useState({
    name: '',
    width: 0,
    height: 0,
    price: 0,
    cost: 0,
  });

  useEffect(() => {
    loadPriceLists();
  }, []);

  const loadPriceLists = async () => {
    try {
      const data = await adminMockApi.priceLists.getAll();
      setPriceLists(data);
      if (data.length > 0) {
        setSelectedPriceList(data[0]);
      }
    } catch (error) {
      console.error('Failed to load price lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = () => {
    setEditingProduct(null);
    setProductForm({ name: '', description: '', isDigital: false });
    setShowProductModal(true);
  };

  const handleEditProduct = (product: PriceListProduct) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description || '',
      isDigital: product.isDigital,
    });
    setShowProductModal(true);
  };

  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPriceList) return;

    try {
      if (editingProduct) {
        await adminMockApi.priceLists.updateProduct(selectedPriceList.id, editingProduct.id, productForm);
      } else {
        await adminMockApi.priceLists.addProduct(selectedPriceList.id, productForm);
      }
      setShowProductModal(false);
      await loadPriceLists();
      const updated = await adminMockApi.priceLists.getById(selectedPriceList.id);
      setSelectedPriceList(updated);
    } catch (error) {
      console.error('Failed to save product:', error);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!selectedPriceList || !confirm('Delete this product?')) return;

    try {
      await adminMockApi.priceLists.removeProduct(selectedPriceList.id, productId);
      const updated = await adminMockApi.priceLists.getById(selectedPriceList.id);
      setSelectedPriceList(updated);
    } catch (error) {
      console.error('Failed to delete product:', error);
    }
  };

  const handleCreateSize = (product: PriceListProduct) => {
    setEditingSize(null);
    setEditingProduct(product);
    setSizeForm({ name: '', width: 0, height: 0, price: 0, cost: 0 });
    setShowSizeModal(true);
  };

  const handleEditSize = (product: PriceListProduct, size: PriceListProductSize) => {
    setEditingProduct(product);
    setEditingSize({ productId: product.id, size });
    setSizeForm({ name: size.name, width: size.width, height: size.height, price: size.price, cost: size.cost });
    setShowSizeModal(true);
  };

  const handleSubmitSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPriceList || !editingProduct) return;

    try {
      if (editingSize) {
        await adminMockApi.priceLists.updateSize(selectedPriceList.id, editingProduct.id, editingSize.size.id, sizeForm);
      } else {
        await adminMockApi.priceLists.addSize(selectedPriceList.id, editingProduct.id, sizeForm);
      }
      setShowSizeModal(false);
      const updated = await adminMockApi.priceLists.getById(selectedPriceList.id);
      setSelectedPriceList(updated);
    } catch (error) {
      console.error('Failed to save size:', error);
    }
  };

  const handleDeleteSize = async (productId: number, sizeId: number) => {
    if (!selectedPriceList || !confirm('Delete this size?')) return;

    try {
      await adminMockApi.priceLists.removeSize(selectedPriceList.id, productId, sizeId);
      const updated = await adminMockApi.priceLists.getById(selectedPriceList.id);
      setSelectedPriceList(updated);
    } catch (error) {
      console.error('Failed to delete size:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (priceLists.length === 0) {
    return (
      <div className="admin-page">
        <div className="page-header">
          <h1>Products</h1>
        </div>
        <div className="empty-state">
          <p>No price lists found. Create a price list first to manage products.</p>
          <a href="/admin/price-lists" className="btn btn-primary">Go to Price Lists</a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Products</h1>
        <button onClick={handleCreateProduct} className="btn btn-primary">
          + Add Product
        </button>
      </div>

      {/* Price List Selector */}
      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          Select Price List:
        </label>
        <select
          value={selectedPriceList?.id || ''}
          onChange={e => {
            const selected = priceLists.find(pl => pl.id === parseInt(e.target.value));
            setSelectedPriceList(selected || null);
          }}
          style={{
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ddd',
            minWidth: '300px',
          }}
        >
          {priceLists.map(pl => (
            <option key={pl.id} value={pl.id}>
              {pl.name}
            </option>
          ))}
        </select>
      </div>

      {/* Products List */}
      {selectedPriceList && (
        <div>
          <h2 style={{ marginBottom: '1.5rem' }}>{selectedPriceList.name} - Products</h2>
          
          {selectedPriceList.products.length === 0 ? (
            <div className="empty-state">
              <p>No products in this price list</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
              {selectedPriceList.products.map(product => (
                <div
                  key={product.id}
                  style={{
                    padding: '1.5rem',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0' }}>{product.name}</h3>
                      <p style={{ fontSize: '0.9rem', color: '#666', margin: 0 }}>
                        {product.isDigital ? '🖥️ Digital' : '🖨️ Physical'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleEditProduct(product)}
                        className="btn-icon"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="btn-icon"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {product.description && (
                    <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1rem', fontStyle: 'italic' }}>
                      {product.description}
                    </p>
                  )}

                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <strong style={{ fontSize: '0.9rem' }}>Sizes ({product.sizes.length})</strong>
                      <button
                        onClick={() => handleCreateSize(product)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        + Add
                      </button>
                    </div>

                    {product.sizes.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: '#999', margin: '0.75rem 0' }}>
                        No sizes defined
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {product.sizes.map(size => (
                          <div
                            key={size.id}
                            style={{
                              padding: '0.75rem',
                              backgroundColor: '#f5f5f5',
                              borderRadius: '4px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div style={{ fontSize: '0.85rem' }}>
                              <strong>{size.name}</strong>
                              {size.width > 0 && ` (${size.width}x${size.height})`}
                              <div style={{ color: '#666', fontSize: '0.8rem' }}>
                                ${size.price.toFixed(2)}
                                {size.cost > 0 && (
                                  <>
                                    {' | Cost: $'}{size.cost.toFixed(2)}{' | '}
                                    <span style={{ color: size.price > size.cost ? '#28a745' : '#dc3545' }}>
                                      Profit: ${(size.price - size.cost).toFixed(2)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                onClick={() => handleEditSize(product, size)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  backgroundColor: '#007bff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                }}
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteSize(product.id, size.id)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  backgroundColor: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product Modal */}
      {showProductModal && (
        <div className="modal-overlay" onClick={() => setShowProductModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => setShowProductModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmitProduct} className="modal-body">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={productForm.description}
                  onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={productForm.isDigital}
                    onChange={e => setProductForm({ ...productForm, isDigital: e.target.checked })}
                  />
                  {' '}Digital Product
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowProductModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProduct ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Size Modal */}
      {showSizeModal && (
        <div className="modal-overlay" onClick={() => setShowSizeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSize ? 'Edit Size' : 'Add Size'}</h2>
              <button onClick={() => setShowSizeModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmitSize} className="modal-body">
              <div className="form-group">
                <label>Size Name *</label>
                <input
                  type="text"
                  value={sizeForm.name}
                  onChange={e => setSizeForm({ ...sizeForm, name: e.target.value })}
                  placeholder="e.g., 4x6, A4, Original"
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Width</label>
                  <input
                    type="number"
                    value={sizeForm.width}
                    onChange={e => setSizeForm({ ...sizeForm, width: parseFloat(e.target.value) || 0 })}
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Height</label>
                  <input
                    type="number"
                    value={sizeForm.height}
                    onChange={e => setSizeForm({ ...sizeForm, height: parseFloat(e.target.value) || 0 })}
                    step="0.01"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Price *</label>
                <input
                  type="number"
                  value={sizeForm.price}
                  onChange={e => setSizeForm({ ...sizeForm, price: parseFloat(e.target.value) || 0 })}
                  step="0.01"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>Cost (Internal - Not shown to customers)</label>
                <input
                  type="number"
                  value={sizeForm.cost}
                  onChange={e => setSizeForm({ ...sizeForm, cost: parseFloat(e.target.value) || 0 })}
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowSizeModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingSize ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;

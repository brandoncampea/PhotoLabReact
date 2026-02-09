import React, { useEffect, useState } from 'react';
import { PriceList, PriceListProduct, PriceListProductSize, Package } from '../../types';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const AdminProducts: React.FC = () => {
  const { user } = useAuth();
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PriceListProduct | null>(null);
  const [editingSize, setEditingSize] = useState<{ productId: number; size: PriceListProductSize } | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [studioFees, setStudioFees] = useState<{ feeType: string; feeValue: number } | null>(null);
  
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

  const [packageForm, setPackageForm] = useState({
    name: '',
    description: '',
    packagePrice: 0,
    items: [] as { productId: number; productSizeId: number; quantity: number }[],
    isActive: true,
  });

  useEffect(() => {
    loadPriceLists();
    loadStudioFees();
  }, []);

  useEffect(() => {
    if (selectedPriceList) {
      loadPackages(selectedPriceList.id);
    } else {
      setPackages([]);
    }
  }, [selectedPriceList]);

  const loadPriceLists = async () => {
    try {
      const response = await api.get('/price-lists');
      const data = response.data;
      setPriceLists(data);
      if (data.length > 0) {
        // Fetch full details for the first price list (with products)
        const full = await api.get(`/price-lists/${data[0].id}`);
        setSelectedPriceList(full.data);
      }
    } catch (error) {
      console.error('Failed to load price lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPackages = async (priceListId: number) => {
    setPackagesLoading(true);
    try {
      const response = await api.get(`/packages?priceListId=${priceListId}`);
      setPackages(response.data);
    } catch (error) {
      console.error('Failed to load packages:', error);
    } finally {
      setPackagesLoading(false);
    }
  };

  const loadStudioFees = async () => {
    try {
      if (user?.studioId) {
        const response = await api.get(`/studios/${user.studioId}/fees`);
        setStudioFees(response.data);
      }
    } catch (error) {
      console.error('Failed to load studio fees:', error);
    }
  };

  const calculatePriceWithFees = (basePrice: number): number => {
    if (!studioFees || studioFees.feeValue === 0) return basePrice;
    
    if (studioFees.feeType === 'percentage') {
      return basePrice + (basePrice * studioFees.feeValue) / 100;
    } else {
      return basePrice + studioFees.feeValue;
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
        await api.put(`/price-lists/${selectedPriceList.id}/products/${editingProduct.id}`, productForm);
      } else {
        await api.post(`/price-lists/${selectedPriceList.id}/products`, productForm);
      }
      setShowProductModal(false);
      await loadPriceLists();
      const updated = await api.get(`/price-lists/${selectedPriceList.id}`);
      setSelectedPriceList(updated.data);
    } catch (error) {
      console.error('Failed to save product:', error);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!selectedPriceList || !confirm('Delete this product?')) return;

    try {
      await api.delete(`/price-lists/${selectedPriceList.id}/products/${productId}`);
      const updated = await api.get(`/price-lists/${selectedPriceList.id}`);
      setSelectedPriceList(updated.data);
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
        await api.put(`/price-lists/${selectedPriceList.id}/products/${editingProduct.id}/sizes/${editingSize.size.id}`, sizeForm);
      } else {
        await api.post(`/price-lists/${selectedPriceList.id}/products/${editingProduct.id}/sizes`, sizeForm);
      }
      setShowSizeModal(false);
      const updated = await api.get(`/price-lists/${selectedPriceList.id}`);
      setSelectedPriceList(updated.data);
    } catch (error) {
      console.error('Failed to save size:', error);
    }
  };

  const handleDeleteSize = async (productId: number, sizeId: number) => {
    if (!selectedPriceList || !confirm('Delete this size?')) return;

    try {
      await api.delete(`/price-lists/${selectedPriceList.id}/products/${productId}/sizes/${sizeId}`);
      const updated = await api.get(`/price-lists/${selectedPriceList.id}`);
      setSelectedPriceList(updated.data);
    } catch (error) {
      console.error('Failed to delete size:', error);
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
    if (confirm('Delete this package?')) {
      try {
        await api.delete(`/packages/${id}`);
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
        await api.put(`/packages/${editingPackage.id}`, { ...packageForm, priceListId: selectedPriceList.id });
      } else {
        await api.post(`/packages`, { ...packageForm, priceListId: selectedPriceList.id });
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
          onChange={async e => {
            const selectedId = parseInt(e.target.value);
            const full = await api.get(`/price-lists/${selectedId}`);
            setSelectedPriceList(full.data);
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

      {/* Studio Fees Info Banner */}
      {studioFees && studioFees.feeValue > 0 && (
        <div style={{
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: '#fff3cd',
          border: '1px solid #ff9800',
          borderRadius: '8px'
        }}>
          <strong style={{ color: '#856404' }}>💰 Product Fee Applied:</strong>
          <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
            A <strong>
              {studioFees.feeType === 'percentage'
                ? `${studioFees.feeValue}%`
                : `$${studioFees.feeValue.toFixed(2)}`
              }
            </strong> fee is automatically added to each product price. 
            Customers will see the adjusted "Customer Price" shown below.
          </p>
        </div>
      )}

      {/* Products List */}
      {selectedPriceList && (
        <div>
          <h2 style={{ marginBottom: '1.5rem' }}>{selectedPriceList.name} - Products</h2>
          
          {(selectedPriceList.products?.length ?? 0) === 0 ? (
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
                                Base: ${size.price.toFixed(2)}
                                {studioFees && studioFees.feeValue > 0 && (
                                  <span style={{ color: '#ff9800', fontWeight: 'bold' }}>
                                    {' → Customer Price: $'}{calculatePriceWithFees(size.price).toFixed(2)}
                                  </span>
                                )}
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


                            {/* Packages for this price list */}
                            <div style={{ marginTop: '2.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h2 style={{ margin: 0 }}>Packages</h2>
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
                                          const product = selectedPriceList?.products.find(p => p.id === item.productId);
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
                                                const product = selectedPriceList?.products.find(p => p.id === item.productId);
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

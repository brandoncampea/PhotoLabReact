import React, { useState, useEffect } from 'react';
import { Package, Product } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';

const AdminPackages: React.FC = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    packagePrice: 0,
    items: [] as { productId: number; productSizeId: number; quantity: number }[],
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [packagesData, productsData] = await Promise.all([
        adminMockApi.packages.getAll(),
        adminMockApi.products.getAll(),
      ]);
      setPackages(packagesData);
      setProducts(productsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPackage(null);
    setFormData({
      name: '',
      description: '',
      packagePrice: 0,
      items: [],
      isActive: true,
    });
    setShowModal(true);
  };

  const handleEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description,
      packagePrice: pkg.packagePrice,
      items: pkg.items,
      isActive: pkg.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPackage) {
        await adminMockApi.packages.update(editingPackage.id, formData);
      } else {
        await adminMockApi.packages.create(formData);
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to save package:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this package?')) {
      try {
        await adminMockApi.packages.delete(id);
        loadData();
      } catch (error) {
        console.error('Failed to delete package:', error);
      }
    }
  };

  const addPackageItem = () => {
    const firstProduct = products[0];
    const firstSize = firstProduct?.sizes[0];
    if (firstProduct && firstSize) {
      setFormData({
        ...formData,
        items: [
          ...formData.items,
          { productId: firstProduct.id, productSizeId: firstSize.id, quantity: 1 },
        ],
      });
    }
  };

  const removePackageItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const updatePackageItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // If product changed, reset size to first available
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product && product.sizes.length > 0) {
        newItems[index].productSizeId = product.sizes[0].id;
      }
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const calculateRetailValue = (items: typeof formData.items) => {
    let total = 0;
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      const size = product?.sizes.find(s => s.id === item.productSizeId);
      if (product && size) {
        const itemPrice = size.price;
        total += itemPrice * item.quantity;
      }
    });
    return total;
  };

  if (loading) {
    return <div className="loading">Loading packages...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>📦 Packages</h1>
        <button onClick={handleCreate} className="btn btn-primary">
          + Create Package
        </button>
      </div>

      <div className="table-container">
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
            {packages.map((pkg) => {
              const retailValue = calculateRetailValue(pkg.items);
              const savings = retailValue - pkg.packagePrice;
              const savingsPercent = retailValue > 0 ? ((savings / retailValue) * 100).toFixed(0) : '0';
              
              return (
                <tr key={pkg.id}>
                  <td><strong>{pkg.name}</strong></td>
                  <td>{pkg.description}</td>
                  <td>
                    {pkg.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        {item.quantity}x {item.product?.name} ({item.productSize?.name})
                      </div>
                    ))}
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
                      <button onClick={() => handleEdit(pkg)} className="btn-icon">✏️</button>
                      <button onClick={() => handleDelete(pkg.id)} className="btn-icon">🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2>{editingPackage ? 'Edit Package' : 'Create Package'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>Package Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Family Package"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description of what's included"
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ margin: 0 }}>Package Items</label>
                  <button type="button" onClick={addPackageItem} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.25rem 0.75rem' }}>
                    + Add Item
                  </button>
                </div>
                
                {formData.items.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    No items added yet. Click "Add Item" to start building your package.
                  </p>
                ) : (
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem' }}>
                    {formData.items.map((item, index) => {
                      const selectedProduct = products.find(p => p.id === item.productId);
                      return (
                        <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                          <select
                            value={item.productId}
                            onChange={(e) => updatePackageItem(index, 'productId', parseInt(e.target.value))}
                            style={{ flex: 2 }}
                          >
                            {products.map(product => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                          <select
                            value={item.productSizeId}
                            onChange={(e) => updatePackageItem(index, 'productSizeId', parseInt(e.target.value))}
                            style={{ flex: 1 }}
                          >
                            {selectedProduct?.sizes.map(size => (
                              <option key={size.id} value={size.id}>{size.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updatePackageItem(index, 'quantity', parseInt(e.target.value))}
                            min="1"
                            style={{ width: '70px' }}
                            placeholder="Qty"
                          />
                          <button type="button" onClick={() => removePackageItem(index)} className="btn-icon" style={{ fontSize: '1.2rem' }}>
                            🗑️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Retail Value:</span>
                  <strong>${calculateRetailValue(formData.items).toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Package Price:</span>
                  <strong style={{ color: '#4caf50' }}>${formData.packagePrice.toFixed(2)}</strong>
                </div>
                {formData.packagePrice > 0 && calculateRetailValue(formData.items) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #ddd' }}>
                    <span>Customer Savings:</span>
                    <strong style={{ color: '#4caf50' }}>
                      ${(calculateRetailValue(formData.items) - formData.packagePrice).toFixed(2)} 
                      ({(((calculateRetailValue(formData.items) - formData.packagePrice) / calculateRetailValue(formData.items)) * 100).toFixed(0)}%)
                    </strong>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Package Price ($)</label>
                <input
                  type="number"
                  value={formData.packagePrice}
                  onChange={(e) => setFormData({ ...formData, packagePrice: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  required
                  placeholder="Package price"
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  {' '}Active (visible to customers)
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
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
    </div>
  );
};

export default AdminPackages;

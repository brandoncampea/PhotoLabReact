import React, { useState, useEffect } from 'react';
import { DiscountCode, Product } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';

const AdminDiscountCodes: React.FC = () => {
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 0,
    applicationType: 'entire-order' as 'entire-order' | 'specific-products',
    applicableProductIds: [] as number[],
    expirationDate: '',
    isOneTimeUse: false,
    maxUsages: undefined as number | undefined,
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [codesData, productsData] = await Promise.all([
        adminMockApi.discountCodes.getAll(),
        adminMockApi.products.getAll(),
      ]);
      setDiscountCodes(codesData);
      setProducts(productsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCode(null);
    const defaultExpiration = new Date();
    defaultExpiration.setMonth(defaultExpiration.getMonth() + 1);
    setFormData({
      code: '',
      description: '',
      discountType: 'percentage',
      discountValue: 0,
      applicationType: 'entire-order',
      applicableProductIds: [],
      expirationDate: defaultExpiration.toISOString().split('T')[0],
      isOneTimeUse: false,
      maxUsages: undefined,
      isActive: true,
    });
    setShowModal(true);
  };

  const handleEdit = (code: DiscountCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      description: code.description,
      discountType: code.discountType,
      discountValue: code.discountValue,
      applicationType: code.applicationType,
      applicableProductIds: code.applicableProductIds,
      expirationDate: code.expirationDate.split('T')[0],
      isOneTimeUse: code.isOneTimeUse,
      maxUsages: code.maxUsages,
      isActive: code.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData = {
        ...formData,
        expirationDate: new Date(formData.expirationDate).toISOString(),
      };
      
      if (editingCode) {
        await adminMockApi.discountCodes.update(editingCode.id, submitData);
      } else {
        await adminMockApi.discountCodes.create(submitData);
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to save discount code:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this discount code?')) {
      try {
        await adminMockApi.discountCodes.delete(id);
        loadData();
      } catch (error) {
        console.error('Failed to delete discount code:', error);
      }
    }
  };

  const toggleProductSelection = (productId: number) => {
    const newSelection = formData.applicableProductIds.includes(productId)
      ? formData.applicableProductIds.filter(id => id !== productId)
      : [...formData.applicableProductIds, productId];
    setFormData({ ...formData, applicableProductIds: newSelection });
  };

  const isExpired = (expirationDate: string) => {
    return new Date(expirationDate) < new Date();
  };

  const isMaxedOut = (code: DiscountCode) => {
    return code.maxUsages !== undefined && code.usageCount >= code.maxUsages;
  };

  if (loading) {
    return <div className="loading">Loading discount codes...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Manage Discount Codes</h1>
        <button onClick={handleCreate} className="btn btn-primary">
          + Create Discount Code
        </button>
      </div>

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Discount</th>
              <th>Applies To</th>
              <th>Expiration</th>
              <th>Usage</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {discountCodes.map((code) => (
              <tr key={code.id} style={{ opacity: !code.isActive || isExpired(code.expirationDate) ? 0.6 : 1 }}>
                <td><strong style={{ fontFamily: 'monospace' }}>{code.code}</strong></td>
                <td>{code.description}</td>
                <td>
                  {code.discountType === 'percentage' ? (
                    <span>{code.discountValue}% off</span>
                  ) : (
                    <span>${code.discountValue.toFixed(2)} off</span>
                  )}
                </td>
                <td>
                  {code.applicationType === 'entire-order' ? (
                    <span>Entire Order</span>
                  ) : (
                    <span>{code.applicableProductIds.length} product(s)</span>
                  )}
                </td>
                <td>
                  {new Date(code.expirationDate).toLocaleDateString()}
                  {isExpired(code.expirationDate) && (
                    <span style={{ color: '#d32f2f', fontSize: '0.85rem', display: 'block' }}>Expired</span>
                  )}
                </td>
                <td>
                  <div>
                    {code.usageCount}{code.maxUsages ? ` / ${code.maxUsages}` : ''}
                  </div>
                  {code.isOneTimeUse && (
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>One-time</span>
                  )}
                  {isMaxedOut(code) && (
                    <span style={{ color: '#d32f2f', fontSize: '0.85rem', display: 'block' }}>Max reached</span>
                  )}
                </td>
                <td>
                  <span className={`status-badge ${code.isActive && !isExpired(code.expirationDate) && !isMaxedOut(code) ? 'active' : 'inactive'}`}>
                    {code.isActive && !isExpired(code.expirationDate) && !isMaxedOut(code) ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleEdit(code)} className="btn-icon">✏️</button>
                    <button onClick={() => handleDelete(code.id)} className="btn-icon">🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{editingCode ? 'Edit Discount Code' : 'Create Discount Code'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  required
                  placeholder="e.g., SUMMER25"
                  style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Internal description"
                />
              </div>

              <div className="form-group">
                <label>Discount Type</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      value="percentage"
                      checked={formData.discountType === 'percentage'}
                      onChange={(e) => setFormData({ ...formData, discountType: 'percentage' })}
                    />
                    Percentage
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      value="fixed"
                      checked={formData.discountType === 'fixed'}
                      onChange={(e) => setFormData({ ...formData, discountType: 'fixed' })}
                    />
                    Fixed Amount
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>
                  {formData.discountType === 'percentage' ? 'Discount Percentage' : 'Discount Amount ($)'}
                </label>
                <input
                  type="number"
                  value={formData.discountValue}
                  onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                  min="0"
                  max={formData.discountType === 'percentage' ? 100 : undefined}
                  step={formData.discountType === 'percentage' ? 1 : 0.01}
                  required
                  placeholder={formData.discountType === 'percentage' ? '10' : '5.00'}
                />
              </div>

              <div className="form-group">
                <label>Applies To</label>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      value="entire-order"
                      checked={formData.applicationType === 'entire-order'}
                      onChange={(e) => setFormData({ ...formData, applicationType: 'entire-order', applicableProductIds: [] })}
                    />
                    Entire Order
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      value="specific-products"
                      checked={formData.applicationType === 'specific-products'}
                      onChange={(e) => setFormData({ ...formData, applicationType: 'specific-products' })}
                    />
                    Specific Products
                  </label>
                </div>
                
                {formData.applicationType === 'specific-products' && (
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '0.75rem', marginTop: '0.5rem' }}>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Select Products:</p>
                    {products.map(product => (
                      <label key={product.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <input
                          type="checkbox"
                          checked={formData.applicableProductIds.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                        />
                        {product.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Expiration Date</label>
                <input
                  type="date"
                  value={formData.expirationDate}
                  onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isOneTimeUse}
                    onChange={(e) => setFormData({ ...formData, isOneTimeUse: e.target.checked, maxUsages: e.target.checked ? 1 : formData.maxUsages })}
                  />
                  {' '}One-time use only (can only be used once per customer)
                </label>
              </div>

              {!formData.isOneTimeUse && (
                <div className="form-group">
                  <label>Max Total Usages (optional)</label>
                  <input
                    type="number"
                    value={formData.maxUsages || ''}
                    onChange={(e) => setFormData({ ...formData, maxUsages: e.target.value ? parseInt(e.target.value) : undefined })}
                    min="1"
                    placeholder="Leave empty for unlimited"
                  />
                  <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                    Limit total number of times this code can be used across all customers
                  </p>
                </div>
              )}

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  {' '}Active (customers can use this code)
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCode ? 'Update Code' : 'Create Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDiscountCodes;

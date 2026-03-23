  // Placeholder for handleCreate to prevent ReferenceError
  const handleCreate = () => {
    // TODO: Implement create discount code logic
    alert('Create Discount Code clicked');
  };

import React, { useState } from 'react';

const AdminDiscountCodes: React.FC = () => {
    const [showModal, setShowModal] = useState(false);
    const [editingCode, setEditingCode] = useState<any>(null); // TODO: Replace any with DiscountCode if type is available
  const [loading, setLoading] = useState(false);
  const [discountCodes, setDiscountCodes] = useState<any[]>([]); // TODO: Replace any with DiscountCode[] if type is available
  // ...all hooks, state, and logic here...
  // (move all logic and handlers inside this function)

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

  // ...other handlers and logic (handleCreate, handleEdit, handleSubmit, handleDelete, etc.)...

  if (loading) {
    return <div className="loading">Loading discount codes...</div>;
  }

  return (
    <>
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
                <td><strong>{code.code}</strong></td>
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
                    <span className="danger-text" style={{ fontSize: '0.85rem', display: 'block' }}>Expired</span>
                  )}
                </td>
                <td>
                  <div>
                    {code.usageCount}{code.maxUsages ? ` / ${code.maxUsages}` : ''}
                  </div>
                  {code.isOneTimeUse && (
                    <span className="muted-text" style={{ fontSize: '0.85rem' }}>One-time</span>
                  )}
                  {isMaxedOut(code) && (
                    <span className="danger-text" style={{ fontSize: '0.85rem', display: 'block' }}>Max reached</span>
                  )}
                </td>
                <td>
                  <span className={`status-badge ${code.isActive && !isExpired(code.expirationDate) && !isMaxedOut(code) ? 'status-active' : 'status-inactive'}`}>
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
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingCode ? 'Edit Discount Code' : 'Create Discount Code'}</h2>
            <form onSubmit={handleSubmit}>
              {/* ...existing code for modal form... */}
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminDiscountCodes;

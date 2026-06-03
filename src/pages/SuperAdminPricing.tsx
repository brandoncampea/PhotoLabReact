

import { Fragment, useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../services/api';
import { superPriceListService } from '../services/superPriceListService';


type PricingItem = {
  id: string;
  productName: string;
  price: string;
  productUid?: number; // for WHCC attribute lookup
};

type WhccAttributes = {
  required: Array<{ name: string; description?: string }>;
  optional: Array<{ name: string; description?: string }>;
  whccCost?: string;
};


const fetchPricing = async (): Promise<PricingItem[]> => {
  const response = await api.get<PricingItem[]>('/price-lists');
  return response.data;
};

const updatePricing = async (id: string, price: string): Promise<void> => {
  await api.put(`/price-lists/${id}`, { price });
};

const SuperAdminPricing = () => {
  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editValue, setEditValue] = useState<string>('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [whccAttrs, setWhccAttrs] = useState<Record<number, WhccAttributes | null>>({});
  const [whccLoading, setWhccLoading] = useState<Record<number, boolean>>({});
  const handleToggleWhccAttrs = async (index: number, productUid?: number) => {
    if (expandedIndex === index) {
      setExpandedIndex(null);
      return;
    }
    if (!productUid) {
      setExpandedIndex(index);
      return;
    }
    setExpandedIndex(index);
    if (!whccAttrs[productUid]) {
      setWhccLoading((prev) => ({ ...prev, [productUid]: true }));
      try {
        const attrs = await superPriceListService.getWhccProductAttributes(productUid);
        setWhccAttrs((prev) => ({ ...prev, [productUid]: attrs }));
      } catch (e) {
        setWhccAttrs((prev) => ({ ...prev, [productUid]: null }));
      } finally {
        setWhccLoading((prev) => ({ ...prev, [productUid]: false }));
      }
    }
  };

  useEffect(() => {
    fetchPricing()
      .then((data) => {
        setPricing(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load pricing');
        setLoading(false);
      });
  }, []);

  const handleEdit = (index: number) => {
    setEditIndex(index);
    setEditValue(pricing[index].price);
  };

  const handleSave = async (index: number) => {
    try {
      const item = pricing[index];
      await updatePricing(item.id, editValue);
      const updated = [...pricing];
      updated[index] = { ...updated[index], price: editValue };
      setPricing(updated);
      setEditIndex(-1);
      setEditValue('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update pricing');
    }
  };

  const handleCancel = () => {
    setEditIndex(-1);
    setEditValue('');
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="admin-content">
          <h2>Super Admin Pricing</h2>
          <p>Loading...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="admin-content">
          <h2>Super Admin Pricing</h2>
          <p className="error">{error}</p>
        </div>
      </AdminLayout>
    );
  }


  return (
    <AdminLayout>
      <div className="admin-content">
        <h2>Super Admin Pricing</h2>
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Actions</th>
              <th>WHCC Attributes</th>
            </tr>
          </thead>
          <tbody>
            {pricing.map((item, index) => (
              <Fragment key={item.id}>
                <tr key={item.id}>
                  <td>{item.productName}</td>
                  <td>
                    {editIndex === index ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                      />
                    ) : (
                      item.price
                    )}
                  </td>
                  <td>
                    {editIndex === index ? (
                      <>
                        <button onClick={() => handleSave(index)}>Save</button>
                        <button onClick={handleCancel}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => handleEdit(index)}>Edit</button>
                    )}
                  </td>
                  <td>
                    {item.productUid ? (
                      <button onClick={() => handleToggleWhccAttrs(index, item.productUid)}>
                        {expandedIndex === index ? 'Hide' : 'Show'}
                      </button>
                    ) : (
                      <span style={{ color: '#aaa' }}>N/A</span>
                    )}
                  </td>
                </tr>
                {expandedIndex === index && item.productUid && (
                  <tr>
                    <td colSpan={4}>
                      {whccLoading[item.productUid] ? (
                        <span>Loading WHCC attributes...</span>
                      ) : whccAttrs[item.productUid] ? (
                        <div style={{ display: 'flex', gap: '2rem' }}>
                          {(() => {
                            const attrs = whccAttrs[item.productUid!];
                            if (!attrs) return null;
                            return (
                              <>
                          <div>
                            <strong>Required Attributes:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 4 }}>
                              {attrs.required.length === 0 && <span>None</span>}
                              {attrs.required.map((attr) => (
                                <span key={attr.name} style={{ background: '#e0e0e0', borderRadius: 8, padding: '2px 8px' }}>{attr.name}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <strong>Optional Attributes:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 4 }}>
                              {attrs.optional.length === 0 && <span>None</span>}
                              {attrs.optional.map((attr) => (
                                <span key={attr.name} style={{ background: '#f5f5f5', borderRadius: 8, padding: '2px 8px' }}>{attr.name}</span>
                              ))}
                            </div>
                          </div>
                          {attrs.whccCost && (
                            <div>
                              <strong>WHCC Cost:</strong> ${attrs.whccCost}
                            </div>
                          )}
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <span style={{ color: 'red' }}>Failed to load WHCC attributes.</span>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

export default SuperAdminPricing;
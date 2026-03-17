
import { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../services/api';

type PricingItem = {
  id: string;
  productName: string;
  price: string;
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
            </tr>
          </thead>
          <tbody>
            {pricing.map((item, index) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

export default SuperAdminPricing;
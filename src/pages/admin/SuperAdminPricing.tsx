
import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import '../../PhotoLabStyles.css';

interface PriceList {
  id: number;
  name: string;
  labName: string;
  productCount: number;
  lastUpdated: string;
  isActive: boolean;
}

const SuperAdminPricing: React.FC = () => {
  const { user } = useAuth();
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPriceLists = async () => {
      try {
        const response = await api.get('/price-lists');
        setPriceLists(response.data || []);
        setError('');
      } catch (err) {
        setError('Failed to load price lists');
      } finally {
        setLoading(false);
      }
    };
    loadPriceLists();
  }, [user]);

  return (
    <AdminLayout>
      <div className="admin-page">
        <div className="page-header">
          <h1>💸 Super Admin Pricing</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Manage and review all lab price lists, product pricing, and global pricing analytics.
          </p>
        </div>

        {loading ? (
          <div className="loading">Loading price lists...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <div className="dashboard-widget">
            <h2><span>🏷️</span> Lab Price Lists</h2>
            {priceLists.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                No price lists found. Labs must upload price lists to activate products.
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lab</th>
                    <th>Price List</th>
                    <th>Products</th>
                    <th>Last Updated</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {priceLists.map((list) => (
                    <tr key={list.id}>
                      <td>{list.labName}</td>
                      <td>{list.name}</td>
                      <td>{list.productCount}</td>
                      <td>{new Date(list.lastUpdated).toLocaleString()}</td>
                      <td>{list.isActive ? <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span> : <span style={{ color: 'var(--error-color)', fontWeight: 600 }}>Inactive</span>}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => {/* TODO: View/Edit price list */}}>
                          View/Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default SuperAdminPricing;

import '../../PhotoLabStyles.css';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';

interface StripeProduct {
  id: string;
  name: string;
  priceId: string;
  subscriptionLevel: string | null;
}

const AdminSubscriptionGateway: React.FC = () => {
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/subscription-plans/stripe-products');
      setProducts(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load Stripe products');
    } finally {
      setLoading(false);
    }
  };

  // Placeholder for mapping logic
  // In a real app, you would allow mapping/unmapping here

  return (
    <div className="admin-page">
      <h1>Studio Subscription Payment Gateway</h1>
      <p>Configure Stripe product and subscription level mappings below.</p>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="admin-subscription-error">{error}</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Stripe Product</th>
              <th>Stripe Price ID</th>
              <th>Mapped Subscription Level</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.priceId}</td>
                <td>{p.subscriptionLevel || <span className="admin-subscription-not-mapped">Not mapped</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminSubscriptionGateway;


import React, { useEffect, useState } from 'react';
import api from '../../services/api';

interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  features: string[];
}

const AdminSubscription: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/subscription-plans');
      setPlans(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <h1>Subscription Levels</h1>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: 'red' }}>{error}</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Monthly Price</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            {plans.map(plan => (
              <tr key={plan.id}>
                <td>{plan.name}</td>
                <td>${plan.monthlyPrice}</td>
                <td>
                  <ul>
                    {plan.features.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminSubscription;

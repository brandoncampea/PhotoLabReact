import '../../PhotoLabStyles.css';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';


interface StripePlan {
  id: string;
  name: string;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
}

const AdminSubscriptionGateway: React.FC = () => {
  const [plans, setPlans] = useState<StripePlan[]>([]);
  const [editState, setEditState] = useState<Record<string, { monthly: string; yearly: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
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
      setPlans(res.data);
      // Initialize edit state
      const initialEdit: Record<string, { monthly: string; yearly: string }> = {};
      res.data.forEach((plan: StripePlan) => {
        initialEdit[plan.id] = {
          monthly: plan.stripe_monthly_price_id || '',
          yearly: plan.stripe_yearly_price_id || '',
        };
      });
      setEditState(initialEdit);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load Stripe products');
    } finally {
      setLoading(false);
    }
  };


  const handleInputChange = (planId: string, field: 'monthly' | 'yearly', value: string) => {
    setEditState((prev) => ({
      ...prev,
      [planId]: {
        ...prev[planId],
        [field]: value,
      },
    }));
  };

  const handleSave = async (planId: string) => {
    setSavingId(planId);
    setError(null);
    try {
      await api.patch(`/subscription-plans/${planId}`, {
        stripe_monthly_price_id: editState[planId].monthly,
        stripe_yearly_price_id: editState[planId].yearly,
      });
      await fetchProducts();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSavingId(null);
    }
  };

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
              <th>Plan Name</th>
              <th>Monthly Price ID</th>
              <th>Annual Price ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.name}</td>
                <td>
                  <input
                    type="text"
                    value={editState[plan.id]?.monthly ?? ''}
                    onChange={(e) => handleInputChange(plan.id, 'monthly', e.target.value)}
                    style={{ width: '220px' }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={editState[plan.id]?.yearly ?? ''}
                    onChange={(e) => handleInputChange(plan.id, 'yearly', e.target.value)}
                    style={{ width: '220px' }}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSave(plan.id)}
                    disabled={savingId === plan.id}
                  >
                    {savingId === plan.id ? 'Saving...' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminSubscriptionGateway;

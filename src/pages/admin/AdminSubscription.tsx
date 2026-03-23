
import React, { useEffect, useState } from 'react';
import api from '../../services/api';

interface SubscriptionPlan {
  id: string;
  name: string;
  monthly_price: number;
  features: string[];
}

interface EditState {
  [planId: string]: {
    name: string;
    monthly_price: string;
    features: string;
    editing: boolean;
  };
}

const AdminSubscription: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({});
  const [newPlan, setNewPlan] = useState({
    name: '',
    monthly_price: '',
    features: '',
    creating: false,
  });
  const handleNewPlanChange = (field: 'name' | 'monthly_price' | 'features', value: string) => {
    setNewPlan((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreatePlan = async () => {
    setNewPlan((prev) => ({ ...prev, creating: true }));
    setError(null);
    try {
      await api.post('/subscription-plans', {
        name: newPlan.name,
        monthly_price: parseFloat(newPlan.monthly_price),
        features: newPlan.features.split('\n').map(f => f.trim()).filter(Boolean),
      });
      setNewPlan({ name: '', monthly_price: '', features: '', creating: false });
      await fetchPlans();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create plan');
      setNewPlan((prev) => ({ ...prev, creating: false }));
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/subscription-plans');
      setPlans(res.data);
      // Initialize edit state
      const initialEdit: EditState = {};
      res.data.forEach((plan: SubscriptionPlan) => {
        initialEdit[plan.id] = {
          name: plan.name,
          monthly_price: plan.monthly_price.toString(),
          features: plan.features.join('\n'),
          editing: false,
        };
      });
      setEditState(initialEdit);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };


  const [savingId, setSavingId] = useState<string | null>(null);

  const handleEdit = (planId: string) => {
    setEditState((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], editing: true },
    }));
  };

  const handleCancel = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setEditState((prev) => ({
      ...prev,
      [planId]: {
        name: plan.name,
        monthly_price: plan.monthly_price.toString(),
        features: plan.features.join('\n'),
        editing: false,
      },
    }));
  };

  const handleChange = (planId: string, field: 'name' | 'monthly_price' | 'features', value: string) => {
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
    const edit = editState[planId];
    try {
      await api.patch(`/subscription-plans/${planId}`, {
        name: edit.name,
        monthly_price: parseFloat(edit.monthly_price),
        features: edit.features.split('\n').map(f => f.trim()).filter(Boolean),
      });
      await fetchPlans();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSavingId(null);
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
        <>
          <div
            style={{
              marginBottom: 32,
              border: '1.5px solid #23232a',
              padding: 28,
              borderRadius: 12,
              background: '#23232a',
              boxShadow: '0 2px 12px 0 rgba(0,0,0,0.10)',
              color: '#eaeaea',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 18, color: '#eaeaea', fontWeight: 700, fontSize: 24, opacity: 0.7 }}>
              Add New Subscription Level
            </h2>
            <div
              style={{
                display: 'flex',
                gap: 18,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                width: '100%',
              }}
            >
              <div style={{ minWidth: 220, flex: '0 0 220px' }}>
                <label style={{ color: '#bdbdc7', fontWeight: 500, fontSize: 16 }}>
                  Name
                  <input
                    type="text"
                    value={newPlan.name}
                    onChange={e => handleNewPlanChange('name', e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      background: '#292938',
                      color: '#eaeaea',
                      border: '1.5px solid #35354a',
                      borderRadius: 6,
                      padding: '10px 12px',
                      fontSize: 16,
                      outline: 'none',
                    }}
                  />
                </label>
              </div>
              <div style={{ minWidth: 180, flex: '0 0 180px' }}>
                <label style={{ color: '#bdbdc7', fontWeight: 500, fontSize: 16 }}>
                  Monthly Price
                  <input
                    type="number"
                    min="0"
                    value={newPlan.monthly_price}
                    onChange={e => handleNewPlanChange('monthly_price', e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      background: '#292938',
                      color: '#eaeaea',
                      border: '1.5px solid #35354a',
                      borderRadius: 6,
                      padding: '10px 12px',
                      fontSize: 16,
                      outline: 'none',
                    }}
                  />
                </label>
              </div>
              <div style={{ flex: 1, minWidth: 320 }}>
                <label style={{ color: '#bdbdc7', fontWeight: 500, fontSize: 16 }}>
                  Features (one per line)
                  <textarea
                    rows={3}
                    value={newPlan.features}
                    onChange={e => handleNewPlanChange('features', e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      background: '#292938',
                      color: '#eaeaea',
                      border: '1.5px solid #35354a',
                      borderRadius: 6,
                      padding: '10px 12px',
                      fontSize: 16,
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </label>
              </div>
              <div style={{ alignSelf: 'center', marginLeft: 'auto' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCreatePlan}
                  disabled={newPlan.creating || !newPlan.name.trim() || !newPlan.monthly_price.trim()}
                  style={{
                    background: '#7c5cff',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 18,
                    borderRadius: 10,
                    padding: '12px 28px',
                    border: 'none',
                    boxShadow: '0 2px 8px 0 rgba(124,92,255,0.10)',
                    transition: 'background 0.2s',
                  }}
                >
                  {newPlan.creating ? 'Creating...' : 'Add Plan'}
                </button>
              </div>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Monthly Price</th>
                <th>Features</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    {editState[plan.id]?.editing ? (
                      <input
                        type="text"
                        value={editState[plan.id].name}
                        onChange={(e) => handleChange(plan.id, 'name', e.target.value)}
                      />
                    ) : (
                      plan.name
                    )}
                  </td>
                  <td>
                    {editState[plan.id]?.editing ? (
                      <input
                        type="number"
                        min="0"
                        value={editState[plan.id].monthly_price}
                        onChange={(e) => handleChange(plan.id, 'monthly_price', e.target.value)}
                      />
                    ) : (
                      `$${plan.monthly_price}`
                    )}
                  </td>
                  <td style={{ minWidth: 200 }}>
                    {editState[plan.id]?.editing ? (
                      <textarea
                        rows={3}
                        value={editState[plan.id].features}
                        onChange={(e) => handleChange(plan.id, 'features', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      <ul>
                        {plan.features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    {editState[plan.id]?.editing ? (
                      <>
                        <button className="btn btn-primary" onClick={() => handleSave(plan.id)} disabled={savingId === plan.id}>
                          {savingId === plan.id ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => handleCancel(plan.id)} style={{ marginLeft: 8 }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => handleEdit(plan.id)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default AdminSubscription;

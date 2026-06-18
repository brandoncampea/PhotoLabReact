import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

interface SubscriptionPlan {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number | null;
  features: string[];
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
}

interface EditState {
  [planId: string]: {
    name: string;
    monthly_price: string;
    yearly_price: string;
    features: string;
    stripe_monthly_price_id: string;
    stripe_yearly_price_id: string;
    editing: boolean;
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  background: '#1e1c30',
  color: '#fff',
  border: '1px solid #3a3656',
  borderRadius: 6,
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#a1a1aa',
  fontWeight: 500,
  fontSize: 13,
};

const sectionHeadingStyle: React.CSSProperties = {
  color: '#a78bfa',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 10,
  marginTop: 16,
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(20, 20, 35, 0.8)',
  border: '1px solid rgba(102, 102, 204, 0.3)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const monoTruncStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#a1a1aa',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 260,
  display: 'block',
};

const AdminSubscription: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState({
    name: '',
    monthly_price: '',
    yearly_price: '',
    features: '',
    stripe_monthly_price_id: '',
    stripe_yearly_price_id: '',
    creating: false,
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/subscription-plans');
      setPlans(res.data);
      const initialEdit: EditState = {};
      res.data.forEach((plan: SubscriptionPlan) => {
        initialEdit[plan.id] = {
          name: plan.name,
          monthly_price: plan.monthly_price.toString(),
          yearly_price: plan.yearly_price != null ? plan.yearly_price.toString() : '',
          features: plan.features.join('\n'),
          stripe_monthly_price_id: plan.stripe_monthly_price_id ?? '',
          stripe_yearly_price_id: plan.stripe_yearly_price_id ?? '',
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

  const handleNewPlanChange = (
    field: 'name' | 'monthly_price' | 'yearly_price' | 'features' | 'stripe_monthly_price_id' | 'stripe_yearly_price_id',
    value: string
  ) => {
    setNewPlan((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreatePlan = async () => {
    setNewPlan((prev) => ({ ...prev, creating: true }));
    setError(null);
    try {
      await api.post('/subscription-plans', {
        name: newPlan.name,
        monthly_price: parseFloat(newPlan.monthly_price),
        yearly_price: newPlan.yearly_price.trim() ? parseFloat(newPlan.yearly_price) : null,
        features: newPlan.features.split('\n').map((f) => f.trim()).filter(Boolean),
        stripe_monthly_price_id: newPlan.stripe_monthly_price_id.trim() || null,
        stripe_yearly_price_id: newPlan.stripe_yearly_price_id.trim() || null,
      });
      setNewPlan({
        name: '',
        monthly_price: '',
        yearly_price: '',
        features: '',
        stripe_monthly_price_id: '',
        stripe_yearly_price_id: '',
        creating: false,
      });
      await fetchPlans();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create plan');
      setNewPlan((prev) => ({ ...prev, creating: false }));
    }
  };

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
        yearly_price: plan.yearly_price != null ? plan.yearly_price.toString() : '',
        features: plan.features.join('\n'),
        stripe_monthly_price_id: plan.stripe_monthly_price_id ?? '',
        stripe_yearly_price_id: plan.stripe_yearly_price_id ?? '',
        editing: false,
      },
    }));
  };

  const handleChange = (
    planId: string,
    field: 'name' | 'monthly_price' | 'yearly_price' | 'features' | 'stripe_monthly_price_id' | 'stripe_yearly_price_id',
    value: string
  ) => {
    setEditState((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], [field]: value },
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
        yearly_price: edit.yearly_price.trim() ? parseFloat(edit.yearly_price) : null,
        features: edit.features.split('\n').map((f) => f.trim()).filter(Boolean),
        stripe_monthly_price_id: edit.stripe_monthly_price_id.trim() || null,
        stripe_yearly_price_id: edit.stripe_yearly_price_id.trim() || null,
      });
      await fetchPlans();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AdminLayout>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          padding: '40px 32px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ marginBottom: 36 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 800,
                background: 'linear-gradient(90deg, #a78bfa, #7c5cff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Subscription Pricing
            </h1>
            <p style={{ color: '#a1a1aa', marginTop: 8, fontSize: 15 }}>
              Manage subscription plans, pricing, and Stripe gateway IDs.
            </p>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fca5a5',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 24,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ ...cardStyle, marginBottom: 36 }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>
              Add New Plan
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Name
                  <input
                    type="text"
                    value={newPlan.name}
                    onChange={(e) => handleNewPlanChange('name', e.target.value)}
                    placeholder="e.g. Pro"
                    style={inputStyle}
                  />
                </label>
              </div>
              <div>
                <label style={labelStyle}>
                  Monthly Price ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPlan.monthly_price}
                    onChange={(e) => handleNewPlanChange('monthly_price', e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </label>
              </div>
              <div>
                <label style={labelStyle}>
                  Annual Price ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPlan.yearly_price}
                    onChange={(e) => handleNewPlanChange('yearly_price', e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>
                  Features (one per line)
                  <textarea
                    rows={3}
                    value={newPlan.features}
                    onChange={(e) => handleNewPlanChange('features', e.target.value)}
                    placeholder={'Feature one\nFeature two'}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </label>
              </div>
            </div>

            <div style={sectionHeadingStyle}>Stripe IDs</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Stripe Monthly Price ID
                  <input
                    type="text"
                    value={newPlan.stripe_monthly_price_id}
                    onChange={(e) => handleNewPlanChange('stripe_monthly_price_id', e.target.value)}
                    placeholder="price_..."
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
                  />
                </label>
              </div>
              <div>
                <label style={labelStyle}>
                  Stripe Annual Price ID
                  <input
                    type="text"
                    value={newPlan.stripe_yearly_price_id}
                    onChange={(e) => handleNewPlanChange('stripe_yearly_price_id', e.target.value)}
                    placeholder="price_..."
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
                  />
                </label>
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCreatePlan}
                disabled={newPlan.creating || !newPlan.name.trim() || !newPlan.monthly_price.trim()}
                style={{
                  background:
                    newPlan.creating || !newPlan.name.trim() || !newPlan.monthly_price.trim()
                      ? 'rgba(124,92,255,0.4)'
                      : '#7c5cff',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  borderRadius: 8,
                  padding: '10px 28px',
                  border: 'none',
                  cursor:
                    newPlan.creating || !newPlan.name.trim() || !newPlan.monthly_price.trim()
                      ? 'not-allowed'
                      : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {newPlan.creating ? 'Creating...' : 'Add Plan'}
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 40 }}>Loading plans...</div>
          ) : plans.length === 0 ? (
            <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 40 }}>No subscription plans yet.</div>
          ) : (
            <div>
              <div
                style={{
                  color: '#a78bfa',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 12,
                }}
              >
                Plans
              </div>
              {plans.map((plan) => {
                const edit = editState[plan.id];
                const isEditing = edit?.editing ?? false;

                return (
                  <div key={plan.id} style={cardStyle}>
                    {isEditing ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                          <div>
                            <label style={labelStyle}>
                              Name
                              <input
                                type="text"
                                value={edit.name}
                                onChange={(e) => handleChange(plan.id, 'name', e.target.value)}
                                style={inputStyle}
                              />
                            </label>
                          </div>
                          <div>
                            <label style={labelStyle}>
                              Monthly Price ($)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={edit.monthly_price}
                                onChange={(e) => handleChange(plan.id, 'monthly_price', e.target.value)}
                                style={inputStyle}
                              />
                            </label>
                          </div>
                          <div>
                            <label style={labelStyle}>
                              Annual Price ($)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={edit.yearly_price}
                                onChange={(e) => handleChange(plan.id, 'yearly_price', e.target.value)}
                                style={inputStyle}
                              />
                            </label>
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>
                              Features (one per line)
                              <textarea
                                rows={4}
                                value={edit.features}
                                onChange={(e) => handleChange(plan.id, 'features', e.target.value)}
                                style={{ ...inputStyle, resize: 'vertical' }}
                              />
                            </label>
                          </div>
                        </div>

                        <div style={sectionHeadingStyle}>Stripe IDs</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <div>
                            <label style={labelStyle}>
                              Stripe Monthly Price ID
                              <input
                                type="text"
                                value={edit.stripe_monthly_price_id}
                                onChange={(e) =>
                                  handleChange(plan.id, 'stripe_monthly_price_id', e.target.value)
                                }
                                placeholder="price_..."
                                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
                              />
                            </label>
                          </div>
                          <div>
                            <label style={labelStyle}>
                              Stripe Annual Price ID
                              <input
                                type="text"
                                value={edit.stripe_yearly_price_id}
                                onChange={(e) =>
                                  handleChange(plan.id, 'stripe_yearly_price_id', e.target.value)
                                }
                                placeholder="price_..."
                                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
                              />
                            </label>
                          </div>
                        </div>

                        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleCancel(plan.id)}
                            style={{
                              border: '1px solid rgba(102,102,204,0.5)',
                              background: 'rgba(102,102,204,0.18)',
                              color: '#cfd5ff',
                              fontWeight: 600,
                              fontSize: 14,
                              borderRadius: 8,
                              padding: '8px 20px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSave(plan.id)}
                            disabled={savingId === plan.id}
                            style={{
                              background: savingId === plan.id ? 'rgba(124,92,255,0.4)' : '#7c5cff',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: 14,
                              borderRadius: 8,
                              padding: '8px 20px',
                              border: 'none',
                              cursor: savingId === plan.id ? 'not-allowed' : 'pointer',
                              transition: 'background 0.2s',
                            }}
                          >
                            {savingId === plan.id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '0 0 160px' }}>
                          <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 6 }}>
                            {plan.name}
                          </div>
                          <div style={{ color: '#a78bfa', fontSize: 14, fontWeight: 600 }}>
                            ${plan.monthly_price.toFixed(2)}/mo
                          </div>
                          <div style={{ color: '#a1a1aa', fontSize: 13, marginTop: 2 }}>
                            {plan.yearly_price != null
                              ? `$${plan.yearly_price.toFixed(2)}/yr`
                              : '—'}
                          </div>
                        </div>

                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div
                            style={{
                              color: '#a78bfa',
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              marginBottom: 8,
                            }}
                          >
                            Features
                          </div>
                          {plan.features.length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {plan.features.map((f) => (
                                <li key={f} style={{ color: '#e4e4e7', fontSize: 13, marginBottom: 3 }}>
                                  {f}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span style={{ color: '#a1a1aa', fontSize: 13 }}>—</span>
                          )}
                        </div>

                        <div style={{ flex: '0 0 280px', minWidth: 200 }}>
                          <div
                            style={{
                              color: '#a78bfa',
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              marginBottom: 8,
                            }}
                          >
                            Stripe IDs
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <span
                              style={{ color: '#a1a1aa', fontSize: 11, display: 'block', marginBottom: 2 }}
                            >
                              Monthly
                            </span>
                            {plan.stripe_monthly_price_id ? (
                              <span style={monoTruncStyle} title={plan.stripe_monthly_price_id}>
                                {plan.stripe_monthly_price_id}
                              </span>
                            ) : (
                              <span style={{ color: '#52525b', fontSize: 12 }}>—</span>
                            )}
                          </div>
                          <div>
                            <span
                              style={{ color: '#a1a1aa', fontSize: 11, display: 'block', marginBottom: 2 }}
                            >
                              Annual
                            </span>
                            {plan.stripe_yearly_price_id ? (
                              <span style={monoTruncStyle} title={plan.stripe_yearly_price_id}>
                                {plan.stripe_yearly_price_id}
                              </span>
                            ) : (
                              <span style={{ color: '#52525b', fontSize: 12 }}>—</span>
                            )}
                          </div>
                        </div>

                        <div style={{ alignSelf: 'center', marginLeft: 'auto' }}>
                          <button
                            onClick={() => handleEdit(plan.id)}
                            style={{
                              border: '1px solid rgba(102,102,204,0.5)',
                              background: 'rgba(102,102,204,0.18)',
                              color: '#cfd5ff',
                              fontWeight: 600,
                              fontSize: 14,
                              borderRadius: 8,
                              padding: '8px 20px',
                              cursor: 'pointer',
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSubscription;

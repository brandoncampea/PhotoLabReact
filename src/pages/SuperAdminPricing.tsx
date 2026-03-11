import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../AdminStyles.css';

interface SubscriptionPlan {
  id: string | number;
  name: string;
  description: string;
  monthly_price: number;
  yearly_price?: number;
  max_albums?: number;
  max_storage_gb?: number;
  features: string[];
  is_active: boolean;
}

export default function SuperAdminPricing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [_loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SubscriptionPlan>>({});
  const [featureInput, setFeatureInput] = useState('');
  const [creatingPlan, setCreatingPlan] = useState(false);

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchPlans();
    }
  }, [user]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/subscription-plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data);
        setError('');
      } else {
        setError('Failed to load plans');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setCreatingPlan(false);
    setEditingPlan(String(plan.id));
    setFormData({
      ...plan,
      features: [...(plan.features || [])]
    });
    setFeatureInput('');
  };

  const handleAddFeature = () => {
    if (featureInput.trim()) {
      setFormData(prev => ({
        ...prev,
        features: [...(prev.features || []), featureInput.trim()]
      }));
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (index: number) => {
    setFormData(prev => ({
      ...prev,
      features: (prev.features || []).filter((_, i) => i !== index)
    }));
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/subscription-plans/${editingPlan}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            monthly_price: formData.monthly_price,
            yearly_price: formData.yearly_price,
            description: formData.description,
            features: formData.features,
            is_active: formData.is_active
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPlans(plans.map(p => String(p.id) === editingPlan ? data.plan : p));
        setEditingPlan(null);
        setFormData({});
        alert('Plan updated successfully!');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update plan');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setEditingPlan(null);
    setCreatingPlan(false);
    setFormData({});
    setFeatureInput('');
  };

  const handleStartCreate = () => {
    setEditingPlan(null);
    setCreatingPlan(true);
    setError('');
    setFormData({
      name: '',
      description: '',
      monthly_price: 0,
      yearly_price: 0,
      max_albums: 0,
      max_storage_gb: 0,
      features: [],
      is_active: true,
    });
    setFeatureInput('');
  };

  const handleCreatePlan = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/subscription-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          monthly_price: formData.monthly_price,
          yearly_price: formData.yearly_price,
          max_albums: formData.max_albums,
          max_storage_gb: formData.max_storage_gb,
          features: formData.features,
          is_active: formData.is_active,
        })
      });

      if (response.ok) {
        const data = await response.json();
        setPlans((prev) => [...prev, data.plan].sort((a, b) => a.monthly_price - b.monthly_price));
        setCreatingPlan(false);
        setFormData({});
        setFeatureInput('');
        alert('Subscription level created successfully!');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create plan');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (user?.role !== 'super_admin') {
    return <div className="admin-page">Access denied. Super admin only.</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Subscription Plan Pricing</h1>
        <button onClick={handleStartCreate} className="btn btn-primary">
          + Add Subscription Level
        </button>
      </div>

      {error && <div className="info-box-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {creatingPlan && (
        <div className="admin-summary-box" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Create Subscription Level</h3>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g., Growth"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={formData.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Monthly Price ($)</label>
              <input
                type="number"
                min="0"
                value={formData.monthly_price || 0}
                onChange={(e) => handleInputChange('monthly_price', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-group">
              <label>Yearly Price ($)</label>
              <input
                type="number"
                min="0"
                value={formData.yearly_price || 0}
                onChange={(e) => handleInputChange('yearly_price', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Max Albums</label>
              <input
                type="number"
                min="0"
                value={formData.max_albums || 0}
                onChange={(e) => handleInputChange('max_albums', parseInt(e.target.value || '0', 10))}
              />
            </div>
            <div className="form-group">
              <label>Max Storage (GB)</label>
              <input
                type="number"
                min="0"
                value={formData.max_storage_gb || 0}
                onChange={(e) => handleInputChange('max_storage_gb', parseInt(e.target.value || '0', 10))}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Features</label>
            <div className="super-pricing-feature-row">
              <input
                type="text"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                placeholder="Add a feature..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddFeature();
                  }
                }}
              />
              <button onClick={handleAddFeature} className="btn btn-secondary">Add</button>
            </div>
            <ul className="super-pricing-feature-list">
              {(formData.features || []).map((feature, idx) => (
                <li key={idx}>
                  <span>{feature}</span>
                  <button onClick={() => handleRemoveFeature(idx)} className="btn btn-danger btn-sm">Remove</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.is_active || false}
                onChange={(e) => handleInputChange('is_active', e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              Active
            </label>
          </div>
          <div className="super-pricing-actions">
            <button onClick={handleCreatePlan} className="btn btn-success">Create Level</button>
            <button onClick={handleCancel} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="super-pricing-grid">
        {plans.map(plan => (
          <div
            key={plan.id}
            className={`super-pricing-card ${editingPlan === String(plan.id) ? 'editing' : ''}`}
          >
            {editingPlan === String(plan.id) ? (
              // Edit Mode
              <div>
                <h3>{plan.name}</h3>

                <div className="form-group">
                  <label>Monthly Price ($)</label>
                  <input
                    type="number"
                    value={formData.monthly_price || 0}
                    onChange={(e) => handleInputChange('monthly_price', parseFloat(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>Yearly Price ($) - Recommended: Monthly × 10</label>
                  <input
                    type="number"
                    value={formData.yearly_price || 0}
                    onChange={(e) => handleInputChange('yearly_price', parseFloat(e.target.value))}
                  />
                  <small className="muted-text">
                    Suggested: ${((formData.monthly_price || 0) * 10).toFixed(2)} (2 months free)
                  </small>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={formData.description || ''}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Features</label>
                  <div className="super-pricing-feature-row">
                    <input
                      type="text"
                      value={featureInput}
                      onChange={(e) => setFeatureInput(e.target.value)}
                      placeholder="Add a feature..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddFeature();
                        }
                      }}
                    />
                    <button
                      onClick={handleAddFeature}
                      className="btn btn-secondary"
                    >
                      Add
                    </button>
                  </div>

                  <ul className="super-pricing-feature-list">
                    {(formData.features || []).map((feature, idx) => (
                      <li key={idx}>
                        <span>{feature}</span>
                        <button
                          onClick={() => handleRemoveFeature(idx)}
                          className="btn btn-danger btn-sm"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.is_active || false}
                      onChange={(e) => handleInputChange('is_active', e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    Active
                  </label>
                </div>

                <div className="super-pricing-actions">
                  <button
                    onClick={handleSavePlan}
                    className="btn btn-primary"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Display Mode
              <div>
                <h3>{plan.name}</h3>
                <p className="muted-text" style={{ marginBottom: '15px' }}>
                  {plan.description}
                </p>

                <div className="super-pricing-monthly">
                  ${plan.monthly_price}/month
                </div>
                
                {plan.yearly_price && (
                  <div className="super-pricing-yearly">
                    or ${plan.yearly_price}/year
                    <span className="super-pricing-savings">
                      (Save ${((plan.monthly_price * 12) - plan.yearly_price).toFixed(2)})
                    </span>
                  </div>
                )}

                <div style={{ marginBottom: '15px' }}>
                  <h4>Features:</h4>
                  <ul className="super-pricing-feature-checklist">
                    {(plan.features || []).map((feature, idx) => (
                      <li key={idx}>
                        ✓ {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`super-pricing-status ${plan.is_active ? 'active' : 'inactive'}`}>
                  {plan.is_active ? '✓ Active' : '✗ Inactive'}
                </div>

                <button
                  onClick={() => handleEditPlan(plan)}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  Edit Pricing
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

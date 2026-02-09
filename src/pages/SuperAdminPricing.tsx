import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../AdminStyles.css';

interface SubscriptionPlan {
  id: string;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SubscriptionPlan>>({});
  const [featureInput, setFeatureInput] = useState('');

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchPlans();
    }
  }, [user]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/subscription-plans');
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
    setEditingPlan(plan.id);
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
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:3001/api/subscription-plans/${editingPlan}`,
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
        setPlans(plans.map(p => p.id === editingPlan ? data.plan : p));
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
    setFormData({});
    setFeatureInput('');
  };

  if (user?.role !== 'super_admin') {
    return <div style={{ padding: '20px' }}>Access denied. Super admin only.</div>;
  }

  return (
    <div className="admin-container">
      <h1>Subscription Plan Pricing</h1>
      {error && <div style={{ color: '#d32f2f', marginBottom: '20px' }}>{error}</div>}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '30px',
        marginTop: '30px'
      }}>
        {plans.map(plan => (
          <div
            key={plan.id}
            style={{
              border: '2px solid #ddd',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: editingPlan === plan.id ? '#f0f7ff' : '#fff'
            }}
          >
            {editingPlan === plan.id ? (
              // Edit Mode
              <div>
                <h3>{plan.name}</h3>

                <div style={{ marginBottom: '15px' }}>
                  <label>Monthly Price ($)</label>
                  <input
                    type="number"
                    value={formData.monthly_price || 0}
                    onChange={(e) => handleInputChange('monthly_price', parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '16px'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label>Yearly Price ($) - Recommended: Monthly × 10</label>
                  <input
                    type="number"
                    value={formData.yearly_price || 0}
                    onChange={(e) => handleInputChange('yearly_price', parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '16px'
                    }}
                  />
                  <small style={{ color: '#666', fontSize: '12px' }}>
                    Suggested: ${((formData.monthly_price || 0) * 10).toFixed(2)} (2 months free)
                  </small>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label>Description</label>
                  <input
                    type="text"
                    value={formData.description || ''}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label>Features</label>
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      value={featureInput}
                      onChange={(e) => setFeatureInput(e.target.value)}
                      placeholder="Add a feature..."
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddFeature();
                        }
                      }}
                    />
                    <button
                      onClick={handleAddFeature}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Add
                    </button>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {(formData.features || []).map((feature, idx) => (
                      <li
                        key={idx}
                        style={{
                          padding: '8px',
                          backgroundColor: '#f5f5f5',
                          borderRadius: '4px',
                          marginBottom: '5px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>{feature}</span>
                        <button
                          onClick={() => handleRemoveFeature(idx)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginBottom: '15px' }}>
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

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSavePlan}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: '#ccc',
                      color: '#333',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Display Mode
              <div>
                <h3>{plan.name}</h3>
                <p style={{ color: '#666', marginBottom: '15px' }}>
                  {plan.description}
                </p>

                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: '#007bff',
                  marginBottom: '5px'
                }}>
                  ${plan.monthly_price}/month
                </div>
                
                {plan.yearly_price && (
                  <div style={{
                    fontSize: '18px',
                    color: '#4caf50',
                    marginBottom: '15px'
                  }}>
                    or ${plan.yearly_price}/year
                    <span style={{ fontSize: '14px', marginLeft: '8px' }}>
                      (Save ${((plan.monthly_price * 12) - plan.yearly_price).toFixed(2)})
                    </span>
                  </div>
                )}

                <div style={{ marginBottom: '15px' }}>
                  <h4>Features:</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {(plan.features || []).map((feature, idx) => (
                      <li key={idx} style={{ padding: '4px 0', fontSize: '14px' }}>
                        ✓ {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{
                  padding: '10px',
                  backgroundColor: plan.is_active ? '#e8f5e9' : '#ffebee',
                  borderRadius: '4px',
                  marginBottom: '15px',
                  fontSize: '12px',
                  color: plan.is_active ? '#2e7d32' : '#c62828'
                }}>
                  {plan.is_active ? '✓ Active' : '✗ Inactive'}
                </div>

                <button
                  onClick={() => handleEditPlan(plan)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
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

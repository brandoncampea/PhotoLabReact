import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../AdminStyles.css';

interface Studio {
  id: number;
  name: string;
  email: string;
  created_at: string;
  subscription_status: string;
  subscription_plan: string;
  subscription_start?: string;
  subscription_end?: string;
  userCount?: number;
  fee_type?: string;
  fee_value?: number;
  billing_cycle?: string;
  is_free_subscription?: boolean;
  cancellation_requested?: boolean;
  cancellation_date?: string;
}

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  features: string[];
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedStudio, setSelectedStudio] = useState<Studio | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [newSubscription, setNewSubscription] = useState({
    subscriptionPlan: '',
    subscriptionStatus: 'active',
    billingCycle: 'monthly',
    isFreeSubscription: false
  });
  const [studioFees, setStudioFees] = useState({
    feeType: 'percentage',
    feeValue: 0
  });

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchStudios();
      fetchPlans();
    }
  }, [user]);

  const fetchStudios = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('http://localhost:3001/api/studios', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStudios(data);
        setError('');
      } else {
        setError('Failed to load studios');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/studios/plans/list');
      if (response.ok) {
        const data = await response.json();
        setPlans(Object.values(data));
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  };

  const handleUpdateSubscription = async () => {
    if (!selectedStudio) return;

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `http://localhost:3001/api/studios/${selectedStudio.id}/subscription`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            subscriptionPlan: newSubscription.subscriptionPlan,
            subscriptionStatus: newSubscription.subscriptionStatus,
            billingCycle: newSubscription.billingCycle,
            isFreeSubscription: newSubscription.isFreeSubscription
          })
        }
      );

      if (response.ok) {
        alert('Subscription updated successfully');
        setShowSubscriptionModal(false);
        fetchStudios();
      } else {
        setError('Failed to update subscription');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleOpenFeeModal = async (studio: Studio) => {
    setSelectedStudio(studio);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `http://localhost:3001/api/studios/${studio.id}/fees`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStudioFees({
          feeType: data.feeType,
          feeValue: data.feeValue
        });
      }
    } catch (err) {
      console.error('Failed to fetch fees:', err);
    }
    setShowFeeModal(true);
  };

  const handleUpdateFees = async () => {
    if (!selectedStudio) return;

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `http://localhost:3001/api/studios/${selectedStudio.id}/fees`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            feeType: studioFees.feeType,
            feeValue: studioFees.feeValue
          })
        }
      );

      if (response.ok) {
        alert('Studio fees updated successfully');
        setShowFeeModal(false);
        fetchStudios();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update fees');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getPlanPrice = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    return plan ? `$${plan.monthlyPrice}/mo` : 'N/A';
  };

  if (user?.role !== 'super_admin') {
    return <div style={{ padding: '20px' }}>Access denied. Super admin only.</div>;
  }

  return (
    <div className="admin-container">
      <h1>Super Admin Dashboard</h1>

      {error && <div style={{ color: '#d32f2f', marginBottom: '20px' }}>{error}</div>}

      <div style={{ marginBottom: '30px' }}>
        <button
          onClick={() => navigate('/super-admin-pricing')}
          style={{
            padding: '12px 24px',
            backgroundColor: '#7c3aed',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          💰 Manage Pricing
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>{studios.length}</h3>
          <p>Total Studios</p>
        </div>
        <div className="stat-card">
          <h3>{studios.filter(s => s.subscription_status === 'active').length}</h3>
          <p>Active Subscriptions</p>
        </div>
        <div className="stat-card">
          <h3>${studios.reduce((sum, s) => sum + parseFloat(s.subscription_plan || '0'), 0).toFixed(2)}</h3>
          <p>Monthly Revenue</p>
        </div>
      </div>

      <h2>Studios Management</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Studio Name</th>
              <th>Email</th>
              <th>Plan</th>
              <th>Billing</th>
              <th>Status</th>
              <th>Fee</th>
              <th>Created</th>
              <th>Users</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {studios.map(studio => (
              <tr key={studio.id}>
                <td>{studio.name}</td>
                <td>{studio.email}</td>
                <td>{getPlanPrice(studio.subscription_plan)}</td>
                <td>
                  <span style={{ fontSize: '13px', color: '#666' }}>
                    {studio.is_free_subscription 
                      ? 'FREE' 
                      : (studio.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly')}
                  </span>
                </td>
                <td>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: studio.cancellation_requested 
                      ? '#ff9800' 
                      : studio.subscription_status === 'active' ? '#4caf50' : '#f44336',
                    color: 'white',
                    fontSize: '12px'
                  }}>
                    {studio.cancellation_requested 
                      ? `Cancelling ${studio.subscription_end ? new Date(studio.subscription_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}` 
                      : studio.subscription_status}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: '13px', color: '#666' }}>
                    {studio.fee_type === 'percentage' 
                      ? `${studio.fee_value}%` 
                      : `$${(studio.fee_value || 0).toFixed(2)}`}
                  </span>
                </td>
                <td>{new Date(studio.created_at).toLocaleDateString()}</td>
                <td>{studio.userCount || 0}</td>
                <td>
                  <button
                    onClick={() => {
                      setSelectedStudio(studio);
                      setNewSubscription({
                        subscriptionPlan: studio.subscription_plan,
                        subscriptionStatus: studio.subscription_status,
                        billingCycle: studio.billing_cycle || 'monthly',
                        isFreeSubscription: studio.is_free_subscription || false
                      });
                      setShowSubscriptionModal(true);
                    }}
                    style={{
                      padding: '6px 12px',
                      marginRight: '8px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Edit Sub
                  </button>
                  <button
                    onClick={() => handleOpenFeeModal(studio)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#ff9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Edit Fees
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Subscription Modal */}
      {showSubscriptionModal && selectedStudio && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h2>Update Subscription for {selectedStudio.name}</h2>

            <div style={{ marginBottom: '20px' }}>
              <label>Subscription Plan</label>
              <select
                value={newSubscription.subscriptionPlan}
                onChange={(e) => setNewSubscription({
                  ...newSubscription,
                  subscriptionPlan: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                {plans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - ${plan.monthlyPrice}/mo
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label>Status</label>
              <select
                value={newSubscription.subscriptionStatus}
                onChange={(e) => setNewSubscription({
                  ...newSubscription,
                  subscriptionStatus: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="past_due">Past Due</option>
                <option value="canceled">Canceled</option>
                <option value="paused">Paused</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={newSubscription.isFreeSubscription}
                  onChange={(e) => setNewSubscription({
                    ...newSubscription,
                    isFreeSubscription: e.target.checked
                  })}
                />
                <span>Free Subscription (No Billing)</span>
              </label>
            </div>

            {!newSubscription.isFreeSubscription && (
              <div style={{ marginBottom: '20px' }}>
                <label>Billing Cycle</label>
                <select
                  value={newSubscription.billingCycle}
                  onChange={(e) => setNewSubscription({
                    ...newSubscription,
                    billingCycle: e.target.value
                  })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginBottom: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly (Save ~17%)</option>
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleUpdateSubscription}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Update
              </button>
              <button
                onClick={() => setShowSubscriptionModal(false)}
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
        </div>
      )}

      {/* Fee Modal */}
      {showFeeModal && selectedStudio && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h2>Update Fees for {selectedStudio.name}</h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                Fee Type
              </label>
              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    name="feeType"
                    value="percentage"
                    checked={studioFees.feeType === 'percentage'}
                    onChange={() => setStudioFees({ ...studioFees, feeType: 'percentage' })}
                  />
                  Percentage (%)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    name="feeType"
                    value="fixed"
                    checked={studioFees.feeType === 'fixed'}
                    onChange={() => setStudioFees({ ...studioFees, feeType: 'fixed' })}
                  />
                  Fixed Amount ($)
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                {studioFees.feeType === 'percentage' ? 'Fee Percentage' : 'Fee Amount ($)'}
              </label>
              <input
                type="number"
                value={studioFees.feeValue}
                onChange={(e) => setStudioFees({ ...studioFees, feeValue: parseFloat(e.target.value) || 0 })}
                min="0"
                max={studioFees.feeType === 'percentage' ? '100' : undefined}
                step={studioFees.feeType === 'percentage' ? '0.1' : '0.01'}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '16px'
                }}
              />
              <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                {studioFees.feeType === 'percentage'
                  ? 'This percentage will be added to each product price'
                  : 'This fixed amount will be added to each product price'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleUpdateFees()}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Update Fees
              </button>
              <button
                onClick={() => setShowFeeModal(false)}
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
        </div>
      )}
    </div>
  );
}


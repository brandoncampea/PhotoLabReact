import React, { useState, useEffect } from 'react';
import { SUBSCRIPTION_PLANS } from '../services/subscriptionService';

interface Studio {
  id: number;
  name: string;
  email: string;
  subscription_plan: string;
  subscription_status: string;
  subscription_start?: string;
  subscription_end?: string;
  stripe_customer_id?: string;
  userCount?: number;
  created_at: string;
}

export const AdminDashboard: React.FC = () => {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudio, setSelectedStudio] = useState<Studio | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Partial<Studio>>({});

  useEffect(() => {
    fetchStudios();
  }, []);

  const fetchStudios = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/studios', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch studios');
      }

      const data = await response.json();
      setStudios(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditStudio = (studio: Studio) => {
    setSelectedStudio(studio);
    setEditData({
      subscription_plan: studio.subscription_plan,
      subscription_status: studio.subscription_status
    });
    setShowEditModal(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedStudio) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/studios/${selectedStudio.id}/subscription`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editData)
      });

      if (!response.ok) {
        throw new Error('Failed to update studio');
      }

      await fetchStudios();
      setShowEditModal(false);
      setSelectedStudio(null);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getPlanDetails = (planId: string) => {
    return SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="loading">Loading studios...</div>;
  }

  return (
    <div className="dashboardContainer">
      <h1 className="gradient-text" style={{ marginBottom: '0.5rem' }}>Studio Management Dashboard</h1>

      {error && <div className="error-message">{error}</div>}

      <div className="studios-container">
        <div className="studios-header">
          <h2>All Studios ({studios.length})</h2>
          <a href="/signup-studio" className="btn-add-studio">+ Add Studio</a>
        </div>

        {studios.length === 0 ? (
          <p className="no-studios">No studios found</p>
        ) : (
          <div className="studios-table">
            <table>
              <thead>
                <tr>
                  <th>Studio Name</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Price/Month</th>
                  <th>Users</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {studios.map(studio => {
                  const plan = getPlanDetails(studio.subscription_plan);
                  return (
                    <tr key={studio.id}>
                      <td className="studio-name">{studio.name}</td>
                      <td>{studio.email}</td>
                      <td className="plan-cell">
                        <span className="plan-badge">{plan?.name || 'Unknown'}</span>
                      </td>
                      <td>
                        <span className={`status-badge status-${studio.subscription_status}`}>
                          {studio.subscription_status}
                        </span>
                      </td>
                      <td className="price">${plan?.monthlyPrice || 'N/A'}</td>
                      <td className="center">{studio.userCount || 0}</td>
                      <td>{formatDate(studio.created_at)}</td>
                      <td className="actions">
                        <button 
                          onClick={() => handleEditStudio(studio)}
                          className="btn-edit"
                          title="Edit subscription"
                        >
                          ⚙️ Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEditModal && selectedStudio && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content admin-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header admin-modal-header">
              <h2>Edit Studio: {selectedStudio.name}</h2>
              <button 
                className="btn-close"
                onClick={() => setShowEditModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body admin-modal-body">
              <div className="form-group">
                <label htmlFor="subscription_plan">Subscription Plan</label>
                <select
                  id="subscription_plan"
                  value={editData.subscription_plan || selectedStudio.subscription_plan}
                  onChange={(e) => setEditData({ ...editData, subscription_plan: e.target.value })}
                >
                  {Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => (
                    <option key={id} value={id}>
                      {plan.name} - ${plan.monthlyPrice}/month
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="subscription_status">Status</label>
                <select
                  id="subscription_status"
                  value={editData.subscription_status || selectedStudio.subscription_status}
                  onChange={(e) => setEditData({ ...editData, subscription_status: e.target.value })}
                >
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="paused">Paused</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>

              <div className="info-box">
                <p><strong>Studio Email:</strong> {selectedStudio.email}</p>
                <p><strong>Created:</strong> {formatDate(selectedStudio.created_at)}</p>
                {selectedStudio.subscription_start && (
                  <p><strong>Subscription Start:</strong> {formatDate(selectedStudio.subscription_start)}</p>
                )}
                {selectedStudio.subscription_end && (
                  <p><strong>Subscription End:</strong> {formatDate(selectedStudio.subscription_end)}</p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                onClick={() => setShowEditModal(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveChanges}
                className="btn-save"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;

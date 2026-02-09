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
    <div className="admin-dashboard">
      <h1>Studio Management Dashboard</h1>

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
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Studio: {selectedStudio.name}</h2>
              <button 
                className="btn-close"
                onClick={() => setShowEditModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
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

      <style jsx>{`
        .admin-dashboard {
          max-width: 1400px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .admin-dashboard h1 {
          font-size: 32px;
          margin-bottom: 30px;
          color: #333;
        }

        .error-message {
          background-color: #f8d7da;
          color: #721c24;
          padding: 12px 16px;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .studios-container {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .studios-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background-color: #f8f9fa;
          border-bottom: 1px solid #ddd;
        }

        .studios-header h2 {
          margin: 0;
          font-size: 20px;
          color: #333;
        }

        .btn-add-studio {
          background-color: #28a745;
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          text-decoration: none;
          cursor: pointer;
          transition: background-color 0.3s;
        }

        .btn-add-studio:hover {
          background-color: #218838;
        }

        .no-studios {
          padding: 40px;
          text-align: center;
          color: #666;
        }

        .studios-table {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        thead {
          background-color: #f8f9fa;
        }

        th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #ddd;
          white-space: nowrap;
        }

        td {
          padding: 12px 16px;
          border-bottom: 1px solid #ddd;
        }

        tbody tr:hover {
          background-color: #f8f9fa;
        }

        .studio-name {
          font-weight: 500;
          color: #007bff;
        }

        .plan-cell {
          text-align: center;
        }

        .plan-badge {
          display: inline-block;
          background-color: #e7f3ff;
          color: #0056b3;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-active {
          background-color: #d4edda;
          color: #155724;
        }

        .status-inactive {
          background-color: #e2e3e5;
          color: #383d41;
        }

        .status-past_due {
          background-color: #fff3cd;
          color: #856404;
        }

        .status-canceled {
          background-color: #f8d7da;
          color: #721c24;
        }

        .status-paused {
          background-color: #d1ecf1;
          color: #0c5460;
        }

        .price {
          font-weight: 500;
          color: #28a745;
        }

        .center {
          text-align: center;
        }

        .actions {
          text-align: center;
        }

        .btn-edit {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: background-color 0.3s;
        }

        .btn-edit:hover {
          background-color: #0056b3;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #ddd;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 20px;
        }

        .btn-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #999;
        }

        .btn-close:hover {
          color: #333;
        }

        .modal-body {
          padding: 20px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }

        .form-group select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .info-box {
          background-color: #f8f9fa;
          padding: 12px;
          border-radius: 4px;
          margin-top: 20px;
        }

        .info-box p {
          margin: 6px 0;
          font-size: 14px;
          color: #666;
        }

        .modal-footer {
          display: flex;
          gap: 10px;
          padding: 20px;
          border-top: 1px solid #ddd;
          background-color: #f8f9fa;
        }

        .btn-cancel,
        .btn-save {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.3s;
        }

        .btn-cancel {
          background-color: #e9ecef;
          color: #333;
        }

        .btn-cancel:hover {
          background-color: #dee2e6;
        }

        .btn-save {
          background-color: #007bff;
          color: white;
        }

        .btn-save:hover {
          background-color: #0056b3;
        }

        @media (max-width: 768px) {
          .studios-header {
            flex-direction: column;
            gap: 10px;
            align-items: flex-start;
          }

          th, td {
            padding: 8px;
            font-size: 12px;
          }

          .modal-content {
            width: 95%;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;

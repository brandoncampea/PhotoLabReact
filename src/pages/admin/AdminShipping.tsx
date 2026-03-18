
import React, { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';

const AdminShipping: React.FC = () => {
  const [provider, setProvider] = useState('');
  const [tracking, setTracking] = useState('');
  const [status, setStatus] = useState('Pending');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate API call
    setMessage('Shipping info submitted!');
    setProvider('');
    setTracking('');
    setStatus('Pending');
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <AdminLayout>
      <div className="admin-form">
        <h1>Admin Shipping</h1>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="provider">Provider</label>
            <input
              id="provider"
              type="text"
              className="input"
              value={provider}
              onChange={e => setProvider(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="tracking">Tracking Number</label>
            <input
              id="tracking"
              type="text"
              className="input"
              value={tracking}
              onChange={e => setTracking(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              className="input"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="Pending">Pending</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Returned">Returned</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Submit</button>
        </form>
        {message && <div className="success-message">{message}</div>}
      </div>
    </AdminLayout>
  );
};

export default AdminShipping;
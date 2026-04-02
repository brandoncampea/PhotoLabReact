import React from 'react';
import AdminSmugMug from './AdminSmugMug';
import './AdminVendorIntegrations.css';

const AdminVendorIntegrations: React.FC = () => {
  return (
    <div className="admin-orders-container admin-vendor-integrations-page">
      <div className="admin-orders-header">
        <h1>Vendor Integrations</h1>
      </div>

      <div className="admin-vendor-card admin-tab-strip">
        <button className="admin-tab-button active" type="button">
          SmugMug
        </button>
      </div>

      <div className="admin-vendor-card" style={{ marginTop: '1.25rem' }}>
        <AdminSmugMug embedded />
      </div>
    </div>
  );
};

export default AdminVendorIntegrations;

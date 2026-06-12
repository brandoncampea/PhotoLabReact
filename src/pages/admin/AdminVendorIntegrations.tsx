import React, { useState } from 'react';
import AdminSmugMug from './AdminSmugMug';
import AdminInstagramIntegration from './AdminInstagramIntegration';
import './AdminVendorIntegrations.css';

const AdminVendorIntegrations: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'smugmug' | 'instagram'>('smugmug');

  return (
    <div className="admin-orders-container admin-vendor-integrations-page">
      <div className="admin-orders-header">
        <h1>Vendor Integrations</h1>
      </div>

      <div className="admin-vendor-card admin-tab-strip">
        <button
          className={`admin-tab-button ${activeTab === 'smugmug' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveTab('smugmug')}
        >
          SmugMug
        </button>
        <button
          className={`admin-tab-button ${activeTab === 'instagram' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveTab('instagram')}
        >
          Instagram
        </button>
      </div>

      <div className="admin-vendor-card" style={{ marginTop: '1.25rem' }}>
        {activeTab === 'smugmug' ? <AdminSmugMug embedded /> : <AdminInstagramIntegration embedded />}
      </div>
    </div>
  );
};

export default AdminVendorIntegrations;

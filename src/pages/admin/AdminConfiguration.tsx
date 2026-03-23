import React, { useState } from 'react';
import AdminWhccConfig from './AdminWhccConfig';
import AdminRoesConfig from './AdminRoesConfig';
import AdminMpixConfig from './AdminMpixConfig';

const TABS = [
  { key: 'whcc', label: 'WHCC' },
  { key: 'roes', label: 'ROES' },
  { key: 'mpix', label: 'Mpix' },
];

const AdminConfiguration: React.FC = () => {
  const [activeTab, setActiveTab] = useState('whcc');

  return (
    <>
      <div className="admin-tab-strip">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`admin-tab-button${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: '2rem' }}>
        {activeTab === 'whcc' && <AdminWhccConfig />}
        {activeTab === 'roes' && <AdminRoesConfig />}
        {activeTab === 'mpix' && <AdminMpixConfig />}
      </div>
    </>
  );
};

export default AdminConfiguration;

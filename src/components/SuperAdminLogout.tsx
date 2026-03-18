import React from 'react';
import AdminLayout from './AdminLayout';

const SuperAdminLogout = () => (
  <AdminLayout>
    <h2>Logout</h2>
    <div className="superadmin-logout-content">
      <button className="superadmin-logout-btn">Logout</button>
    </div>
  </AdminLayout>
);

export default SuperAdminLogout;

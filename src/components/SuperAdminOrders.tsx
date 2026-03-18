import React from 'react';
import AdminLayout from './AdminLayout';

const SuperAdminOrders = () => (
  <AdminLayout>
    <h2>Super Admin Orders</h2>
    <div className="superadmin-orders-content">
      <input type="text" placeholder="Filter by studio" className="superadmin-search" />
      {/* Render super admin orders table/list here */}
    </div>
  </AdminLayout>
);

export default SuperAdminOrders;

import React from 'react';
import AdminLayout from '../../components/AdminLayout';

const SuperAdminOrders = () => (
  <AdminLayout>
    <h1 data-testid="superadmin-orders-heading">Super Admin Orders</h1>
    <div className="superadmin-orders-content">
      <input type="text" placeholder="Filter by studio" className="superadmin-search" data-testid="superadmin-orders-search" />
      {/* Render super admin orders table/list here */}
    </div>
  </AdminLayout>
);

export default SuperAdminOrders;

import React from 'react';
import AdminLayout from '../../components/AdminLayout';

const SuperAdminShipping = () => (
  <AdminLayout>
    <h1 data-testid="superadmin-shipping-heading">Super Admin Shipping</h1>
    <div className="superadmin-shipping-content">
      <input type="text" placeholder="Shipping option" className="superadmin-shipping-input" data-testid="superadmin-shipping-input" />
      <button className="superadmin-save">Save</button>
      {/* Render super admin shipping options table/list here */}
    </div>
  </AdminLayout>
);

export default SuperAdminShipping;

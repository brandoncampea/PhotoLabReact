import React from 'react';
import AdminLayout from './AdminLayout';

const AdminShipping = () => (
  <AdminLayout>
    <h2>Shipping Options</h2>
    <div className="admin-shipping-content">
      <input type="text" placeholder="Shipping option" className="admin-shipping-input" />
      <button className="admin-save">Save</button>
      {/* Render shipping options table/list here */}
    </div>
  </AdminLayout>
);

export default AdminShipping;

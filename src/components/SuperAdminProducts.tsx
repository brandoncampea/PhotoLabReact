import React from 'react';
import AdminLayout from './AdminLayout';

const SuperAdminProducts = () => (
  <AdminLayout>
    <h2>Super Admin Products</h2>
    <div className="superadmin-products-content">
      <button className="superadmin-upload">Upload Watermark</button>
      {/* Render super admin products table/list here */}
    </div>
  </AdminLayout>
);

export default SuperAdminProducts;

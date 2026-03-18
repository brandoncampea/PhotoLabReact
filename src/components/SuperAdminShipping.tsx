
import AdminLayout from './AdminLayout';

const SuperAdminShipping = () => (
  <AdminLayout>
    <h2>Super Admin Shipping Options</h2>
    <div className="superadmin-shipping-content">
      <input type="text" placeholder="Shipping option" className="superadmin-shipping-input" />
      <button className="superadmin-save">Save</button>
      {/* Render super admin shipping options table/list here */}
    </div>
  </AdminLayout>
);

export default SuperAdminShipping;

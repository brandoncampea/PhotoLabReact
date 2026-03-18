
import AdminLayout from './AdminLayout';

const AdminProducts = () => (
  <AdminLayout>
    <h2>Products</h2>
    <div className="admin-products-content">
      <button className="admin-upload">Upload Watermark</button>
      {/* Render products table/list here */}
    </div>
  </AdminLayout>
);

export default AdminProducts;

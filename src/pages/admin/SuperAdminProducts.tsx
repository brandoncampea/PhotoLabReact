

const SuperAdminProducts = () => (
  <>
    <h1 data-testid="superadmin-products-heading">Super Admin Products</h1>
    <div className="superadmin-products-content">
      <input type="text" placeholder="Search products..." className="superadmin-products-search" data-testid="superadmin-products-search" />
      <button className="superadmin-upload">Upload Watermark</button>
      {/* Render super admin products table/list here */}
    </div>
  </>
);

export default SuperAdminProducts;

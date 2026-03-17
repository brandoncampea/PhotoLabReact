import React from "react";
import AdminLayout from "../components/AdminLayout";

const AdminDashboard: React.FC = () => {
  return (
    <AdminLayout>
      <div className="admin-dashboard">
        <h1>Admin Dashboard</h1>
        <p>Welcome to the admin portal. Use the sidebar to manage albums, orders, users, and settings.</p>
        {/* Add dashboard widgets, stats, or quick links here as needed */}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;

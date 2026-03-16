
import React from "react";
import AdminLayout from '../../components/AdminLayout';
import '../../AdminStyles.css';

const SuperAdminDashboard: React.FC = () => {
  return (
    <AdminLayout>
      <div style={{ padding: 32, textAlign: 'center' }}>
        <h1>Super Admin Dashboard</h1>
        <p>This is a placeholder for the Super Admin Dashboard page.</p>
      </div>
    </AdminLayout>
  );
};

export default SuperAdminDashboard;

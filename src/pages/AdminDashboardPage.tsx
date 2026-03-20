import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminDashboard from '../components/AdminDashboard';
import { useAuth } from '../contexts/AuthContext';

const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== 'super_admin') {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user || user.role !== 'super_admin') {
    return <div>Unauthorized</div>;
  }

  return (
    <div className="page-container">
      <div className="sidebar">
        {/* Sidebar content here (links, nav, etc.) */}
        <ul className="sidebar-menu">
          <li><a href="/admin/dashboard">Dashboard</a></li>
          <li><a href="/admin/studios">Studio Admins</a></li>
          <li><a href="/admin/analytics">Analytics</a></li>
          <li><a href="/admin/profile">Profile</a></li>
        </ul>
        <a href="/customer" className="admin-customer-site">Customer Site</a>
        <button className="btn-logout">Logout</button>
      </div>
      <div className="main-content">
        <AdminDashboard />
      </div>
    </div>
  );
};

export default AdminDashboardPage;

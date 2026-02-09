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
      <AdminDashboard />
    </div>
  );
};

export default AdminDashboardPage;

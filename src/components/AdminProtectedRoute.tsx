import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Require logged-in admin or studio_admin
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (user && user.role !== 'admin' && user.role !== 'studio_admin' && user.role !== 'super_admin') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;

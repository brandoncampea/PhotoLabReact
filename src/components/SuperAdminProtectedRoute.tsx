import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface SuperAdminProtectedRouteProps {
  children: React.ReactNode;
}

const SuperAdminProtectedRoute: React.FC<SuperAdminProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'super_admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
};

export default SuperAdminProtectedRoute;

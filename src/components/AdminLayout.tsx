
import React from 'react';
// import { useAuth } from '../contexts/AuthContext';
// import { Link, useLocation } from 'react-router-dom';

// const adminLinks = [
//   { label: 'Dashboard', to: '/admin/dashboard' },
//   { label: 'Albums', to: '/admin/albums' },
//   { label: 'Orders', to: '/admin/orders' },
// ];
// const superAdminLinks = [
//   { label: 'Super Admin Dashboard', to: '/admin/dashboard' },
//   { label: 'Payment Methods', to: '/admin/payment-methods' },
//   { label: 'Studio Subscription Payment Gateway', to: '/admin/subscription-gateway' },
//   { label: 'Subscription Pricing', to: '/admin/subscription-pricing' },
//   { label: 'Lab Configuration', to: '/admin/lab-config' },
//   { label: 'Price Lists', to: '/admin/price-lists' },
//   { label: 'Users', to: '/admin/users' },
//   { label: 'Studio Admins', to: '/admin/studio-admins' },
//   { label: 'Analytics', to: '/admin/analytics' },
//   { label: 'Profile', to: '/admin/profile' },
// ];

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // const { user } = useAuth();
  // const location = useLocation();
  // const isSuperAdmin = user?.role === 'super_admin';

  // Flat admin links: Dashboard, Albums, Orders first, then all others (no duplicates)
  // All admin links as top-level items in the side nav (no grouping, no Admin section)
  // const flatAdminLinks = [
  //   { label: 'Dashboard', to: '/admin/dashboard' },
  //   { label: 'Albums', to: '/admin/albums' },
  //   { label: 'Orders', to: '/admin/orders' },
  //   { label: 'Analytics', to: '/admin/analytics' },
  //   { label: 'Products', to: '/admin/products' },
  //   { label: 'Customers', to: '/admin/customers' },
  //   { label: 'Shipping', to: '/admin/shipping' },
  //   { label: 'Album Styles', to: '/admin/album-styles' },
  //   { label: 'Discount Codes', to: '/admin/discount-codes' },
  //   { label: 'Watermarks', to: '/admin/watermarks' },
  //   { label: 'Profile', to: '/admin/profile' },
  // ];

  return (
    <>{children}</>
  );
};

export default AdminLayout;

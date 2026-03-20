import React from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => (
  <div className="layout">
    <Navbar />
    <div className="page-container">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  </div>
);

export default Layout;

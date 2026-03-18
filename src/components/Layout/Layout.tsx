import React from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => (
  <div className="layout">
    <Navbar />
    <div className="main">
      <Sidebar />
      <div className="content">{children}</div>
    </div>
  </div>
);

export default Layout;

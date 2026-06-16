import React from 'react';
import NavbarWithFab from './Navbar';
import Sidebar from './Sidebar';
import { SidebarProvider } from '../../contexts/SidebarContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => (
  <SidebarProvider>
    <div style={{ minHeight: '100vh', background: '#181829' }}>
      <NavbarWithFab />
      <Sidebar />
      <main style={{ padding: '16px 0 0 0', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {children}
      </main>
    </div>
  </SidebarProvider>
);

export default Layout;

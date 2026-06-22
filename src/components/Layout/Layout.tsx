import React from 'react';
import NavbarWithFab from './Navbar';
import Sidebar from './Sidebar';
import { SidebarProvider, useSidebar } from '../../contexts/SidebarContext';

interface LayoutProps {
  children: React.ReactNode;
}

const LayoutMain: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pinned } = useSidebar();
  return (
    <main style={{
      padding: '16px 0 0 0',
      maxWidth: 1100,
      marginLeft: pinned ? 260 : 'auto',
      marginRight: 'auto',
      width: '100%',
      transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {children}
    </main>
  );
};

const Layout: React.FC<LayoutProps> = ({ children }) => (
  <SidebarProvider>
    <div style={{ minHeight: '100vh', background: '#181829' }}>
      <NavbarWithFab />
      <Sidebar />
      <LayoutMain>{children}</LayoutMain>
    </div>
  </SidebarProvider>
);

export default Layout;

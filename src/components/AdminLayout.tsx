import React, { useEffect, useState } from 'react';
import '../PhotoLabStyles.css';
// Removed unused imports
import { useAuth } from '../contexts/AuthContext';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isStudioAdmin = user?.role === 'studio_admin';
  const canSwitchMenu = isSuperAdmin;
  const [menuMode, setMenuMode] = useState<'super' | 'studio'>(() => {
    const stored = localStorage.getItem('adminMenuMode');
    return stored === 'studio' ? 'studio' : 'super';
  });
  // Removed studios logic

  useEffect(() => {
    if (isStudioAdmin) {
      setMenuMode('studio');
      return;
    }

    if (isSuperAdmin) {
      return;
    }

    setMenuMode('studio');
  }, [isStudioAdmin, isSuperAdmin, canSwitchMenu, menuMode]);

  useEffect(() => {
    localStorage.setItem('adminMenuMode', menuMode);
  }, [menuMode]);

  // Removed unused clearStudioView

  return (
    <div className="admin-layout">
      {children}
    </div>
  );
}
export default AdminLayout;

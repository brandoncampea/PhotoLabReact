

import React, { useEffect, useState } from 'react';
import { studioService } from '../services/studioService';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [studioName, setStudioName] = useState<string | null>(null);

  useEffect(() => {
    const viewAsStudioId = localStorage.getItem('viewAsStudioId');
    console.log('[AdminLayout] viewAsStudioId:', viewAsStudioId);
    if (viewAsStudioId) {
      studioService.getStudio(Number(viewAsStudioId)).then(studio => {
        console.log('[AdminLayout] studioService.getStudio result:', studio);
        setStudioName(studio.name);
      }).catch((err) => {
        console.error('[AdminLayout] Failed to fetch studio:', err);
        setStudioName(null);
      });
    } else {
      setStudioName(null);
    }
  }, []);

  return (
    <>
      {studioName && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', background: '#222', color: '#fff', padding: '0.5rem 1.5rem', fontWeight: 700, fontSize: '1.2rem', zIndex: 1000, letterSpacing: '0.02em' }}>
          Managing: {studioName}
        </div>
      )}
      <div style={{ marginTop: studioName ? '2.5rem' : 0 }}>{children}</div>
    </>
  );
};

export default AdminLayout;

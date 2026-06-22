import React, { createContext, useContext, useState } from 'react';

type SidebarContextType = {
  open: boolean;
  pinned: boolean;
  toggle: () => void;
  close: () => void;
  togglePin: () => void;
};

const SidebarContext = createContext<SidebarContextType>({
  open: false,
  pinned: false,
  toggle: () => {},
  close: () => {},
  togglePin: () => {},
});

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(() => localStorage.getItem('sidebarPinned') === 'true');

  const togglePin = () => {
    setPinned(v => {
      const next = !v;
      localStorage.setItem('sidebarPinned', String(next));
      if (next) setOpen(false);
      return next;
    });
  };

  return (
    <SidebarContext.Provider value={{
      open,
      pinned,
      toggle: () => setOpen(v => !v),
      close: () => setOpen(false),
      togglePin,
    }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);

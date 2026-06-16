import React, { createContext, useContext, useState } from 'react';

type SidebarContextType = { open: boolean; toggle: () => void; close: () => void };
const SidebarContext = createContext<SidebarContextType>({ open: false, toggle: () => {}, close: () => {} });

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ open, toggle: () => setOpen(v => !v), close: () => setOpen(false) }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);

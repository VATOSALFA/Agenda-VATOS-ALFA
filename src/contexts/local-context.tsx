
'use client';

import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react';

interface LocalContextType {
  selectedLocalId: string | null;
  setSelectedLocalId: (id: string | null) => void;
}

const LocalContext = createContext<LocalContextType | undefined>(undefined);

export function LocalProvider({ children }: { children: ReactNode }) {
  const [selectedLocalId, setSelectedLocalIdState] = useState<string | null>(null);

  // Initialize from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vatos-alfa-local-id');
    if (saved) {
      setSelectedLocalIdState(saved);
    }
  }, []);

  const setSelectedLocalId = (id: string | null) => {
    setSelectedLocalIdState(id);
    if (id) {
      localStorage.setItem('vatos-alfa-local-id', id);
    } else {
      localStorage.removeItem('vatos-alfa-local-id');
    }
  };

  const value = useMemo(() => ({
    selectedLocalId,
    setSelectedLocalId,
  }), [selectedLocalId]);

  return (
    <LocalContext.Provider value={value}>
      {children}
    </LocalContext.Provider>
  );
}

export function useLocal(): LocalContextType {
  const context = useContext(LocalContext);
  if (context === undefined) {
    throw new Error('useLocal must be used within a LocalProvider');
  }
  return context;
}

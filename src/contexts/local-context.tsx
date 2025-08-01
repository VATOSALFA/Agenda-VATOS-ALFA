
'use client';

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

interface LocalContextType {
  selectedLocalId: string | null;
  setSelectedLocalId: (id: string | null) => void;
}

const LocalContext = createContext<LocalContextType | undefined>(undefined);

export function LocalProvider({ children }: { children: ReactNode }) {
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);

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

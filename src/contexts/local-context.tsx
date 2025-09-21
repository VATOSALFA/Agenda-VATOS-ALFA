
'use client';

import { createContext, useContext, useState, useMemo, type ReactNode, useEffect } from 'react';
import { useAuth } from './firebase-auth-context';

interface LocalContextType {
  selectedLocalId: string | null;
  setSelectedLocalId: (id: string | null) => void;
}

const LocalContext = createContext<LocalContextType | undefined>(undefined);

export function LocalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  
  useEffect(() => {
    if (user) {
      // If the user has a specific local_id assigned (e.g., local admin, receptionist),
      // force that local and don't allow changing it from other components that might
      // try to set a default.
      if (user.local_id) {
        setSelectedLocalId(user.local_id);
      }
    } else {
      // If the user logs out, reset the selected local.
      setSelectedLocalId(null);
    }
  }, [user]);


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

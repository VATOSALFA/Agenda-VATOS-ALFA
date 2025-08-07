
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
      // If user has a specific local_id, force that one.
      if (user?.local_id) {
          setSelectedLocalId(user.local_id);
      }
      // If the user becomes null (logged out), reset the localId.
      if (!user) {
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

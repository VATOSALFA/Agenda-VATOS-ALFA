'use client';

import { useAuth } from '@/contexts/firebase-auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/agenda');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex justify-center items-center h-screen bg-muted/40">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}


'use client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useRouter } from 'next/navigation';

// This layout is for stand-alone settings pages.
export default function SettingsLayout({children}: {children: React.ReactNode}) {
  const { user } = useAuth();
  const router = useRouter();

  if (!user?.permissions?.includes('ver_configuracion')) {
    // Or redirect to an unauthorized page
    router.replace('/agenda');
    return null;
  }
  
  return <>{children}</>
}

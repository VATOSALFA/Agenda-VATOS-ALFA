
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This entire layout is deprecated and redirects to the /admin layout.
export default function DeprecatedSettingsLayout() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return null; // Or a loading spinner
}

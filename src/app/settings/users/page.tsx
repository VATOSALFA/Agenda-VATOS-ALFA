
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the /admin/users page.
export default function DeprecatedUsersPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/users');
  }, [router]);

  return null;
}

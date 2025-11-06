'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the /settings/users page.
export default function DeprecatedUsersPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/users');
  }, [router]);

  return null;
}

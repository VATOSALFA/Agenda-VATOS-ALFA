'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This entire layout is deprecated and redirects to the /admin layout.
export default function DeprecatedSettingsLayout({children}: {children: React.ReactNode}) {
  return <>{children}</>
}

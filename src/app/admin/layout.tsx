
'use client';

// This layout was causing routing conflicts and is no longer necessary.
// The main app layout now handles all nested routes correctly.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

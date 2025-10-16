'use client';

interface AdminLayoutProps {
  children: React.ReactNode
}

// This layout is modified to remove the sidebar for the client page, as requested.
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex-1">{children}</div>
  )
}


interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex-1 p-4 md:p-8 pt-6 overflow-y-auto">
        {children}
    </div>
  );
}

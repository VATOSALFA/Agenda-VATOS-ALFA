
'use client';

import type { ReactNode } from 'react';
import Header from './header';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';
import { NewSaleSheet } from '../sales/new-sale-sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { Loader2 } from 'lucide-react';

type Props = {
  children: ReactNode;
};

export default function MainLayout({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { setSelectedLocalId } = useLocal();
  
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const refreshData = () => setDataRefreshKey(prev => prev + 1);

  // Effect to manage local selection based on auth state
  useEffect(() => {
    if (!loading) {
      if (user?.local_id) {
        setSelectedLocalId(user.local_id);
      }
    }
  }, [user, loading, setSelectedLocalId]);

  // Global event listeners to open modals
  useEffect(() => {
    const handleNewReservation = () => {
        setReservationInitialData(null);
        setIsReservationModalOpen(true);
    };
    const handleNewBlock = () => {
        setBlockInitialData(null);
        setIsBlockScheduleModalOpen(true);
    };
    const handleNewSale = () => {
        setSaleInitialData(null);
        setIsSaleSheetOpen(true);
    }

    document.addEventListener('new-reservation', handleNewReservation);
    document.addEventListener('new-block', handleNewBlock);
    document.addEventListener('new-sale', handleNewSale);

    return () => {
        document.removeEventListener('new-reservation', handleNewReservation);
        document.removeEventListener('new-block', handleNewBlock);
        document.removeEventListener('new-sale', handleNewSale);
    };
  }, []);
  
  // Auth redirection logic moved here from AuthProvider to avoid dependency cycles
   useEffect(() => {
    if (!loading && !user) {
      const isProtectedRoute = !pathname.startsWith('/book') && pathname !== '/login';
      if (isProtectedRoute) {
        router.push('/login');
      }
    }
  }, [user, loading, pathname, router]);

  const showHeader = user && !loading && pathname !== '/login' && !pathname.startsWith('/book') && !pathname.startsWith('/admin/conversations');
  
  const isAuthPage = pathname === '/login';
  const isPublicBookingPage = pathname.startsWith('/book');
  
   if (loading && !isAuthPage && !isPublicBookingPage) {
    return (
      <div className="flex justify-center items-center h-screen bg-muted/40">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Render children for public pages even if user is not loaded
  if (!user && !isAuthPage && !isPublicBookingPage) {
      return null;
  }

  return (
    <>
      {showHeader && <Header />}
      <main className={cn(showHeader && "pt-16")}>
          {children}
      </main>
      
      {/* Modals and Sheets available globally */}
      <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
          <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
              <NewReservationForm
              isOpen={isReservationModalOpen}
              onOpenChange={setIsReservationModalOpen}
              isDialogChild
              onFormSubmit={refreshData}
              initialData={reservationInitialData}
              isEditMode={!!reservationInitialData?.id}
              />
          </DialogContent>
      </Dialog>
      
      <BlockScheduleForm
          isOpen={isBlockScheduleModalOpen}
          onOpenChange={setIsBlockScheduleModalOpen}
          onFormSubmit={refreshData}
          initialData={blockInitialData}
      />
      
      <NewSaleSheet 
          isOpen={isSaleSheetOpen} 
          onOpenChange={setIsSaleSheetOpen}
          initialData={saleInitialData}
          onSaleComplete={refreshData}
      />
    </>
  );
}


'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/firebase-auth-context';
import { NewReservationForm } from '@/components/reservations/new-reservation-form';
import { BlockScheduleForm } from '@/components/reservations/block-schedule-form';
import { NewSaleSheet } from '@/components/sales/new-sale-sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Header from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export default function AppInitializer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const refreshData = () => setDataRefreshKey(prev => prev + 1);

  useEffect(() => {
    const handleNewReservation = (e: CustomEvent) => {
        setReservationInitialData(e.detail);
        setIsReservationModalOpen(true);
    };
    const handleNewBlock = (e: CustomEvent) => {
        setBlockInitialData(e.detail);
        setIsBlockScheduleModalOpen(true);
    };
    const handleNewSale = (e: CustomEvent) => {
        setSaleInitialData(e.detail);
        setIsSaleSheetOpen(true);
    }

    document.addEventListener('new-reservation', handleNewReservation as EventListener);
    document.addEventListener('new-block', handleNewBlock as EventListener);
    document.addEventListener('new-sale', handleNewSale as EventListener);

    return () => {
        document.removeEventListener('new-reservation', handleNewReservation as EventListener);
        document.removeEventListener('new-block', handleNewBlock as EventListener);
        document.removeEventListener('new-sale', handleNewSale as EventListener);
    };
  }, []);
  
  const isAuthPage = pathname === '/login';
  const isPublicBookingPage = pathname.startsWith('/book');
  
  if (loading && !isAuthPage && !isPublicBookingPage) {
    return (
      <div className="flex justify-center items-center h-screen bg-muted/40">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const showHeader = user && !isAuthPage;

  return (
    <>
      {showHeader && <Header />}
      <main className={cn(showHeader && "pt-16")}>
          {children}
      </main>
      
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
};

    
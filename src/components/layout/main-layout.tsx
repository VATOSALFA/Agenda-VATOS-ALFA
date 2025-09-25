
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
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Local } from '@/lib/types';

type Props = {
  children: ReactNode;
};

export default function MainLayout({ children }: Props) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { selectedLocalId, setSelectedLocalId } = useLocal();
  const { data: locales } = useFirestoreQuery<Local>('locales');
  
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const refreshData = () => setDataRefreshKey(prev => prev + 1);

  // Set default local based on user or first available
  useEffect(() => {
    if (user?.local_id) {
      setSelectedLocalId(user.local_id);
    } else if (!selectedLocalId && locales && locales.length > 0) {
      setSelectedLocalId(locales[0].id);
    }
  }, [user, locales, selectedLocalId, setSelectedLocalId]);

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

  const showHeader = user && !loading && pathname !== '/login' && !pathname.startsWith('/book');

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

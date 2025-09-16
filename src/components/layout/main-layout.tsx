
'use client';

import type { ReactNode } from 'react';
import Header from './header';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';
import { NewSaleSheet } from '../sales/new-sale-sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { onSnapshot, collection, query, where, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

type Props = {
  children: ReactNode;
};

export default function MainLayout({ children }: Props) {
  const pathname = usePathname();
  const { toast } = useToast();
  const router = useRouter();
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const refreshData = () => setDataRefreshKey(prev => prev + 1);

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

  useEffect(() => {
    const mountTime = Timestamp.now();

    const q = query(
      collection(db, 'conversaciones'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const message = change.doc.data();
          if (message.timestamp.toMillis() > mountTime.toMillis() && message.direction === 'inbound') {
            if (pathname !== '/admin/conversations') {
              toast({
                title: `Nuevo mensaje de ${message.from.replace('whatsapp:', '')}`,
                description: message.body,
                duration: 10000, 
                onClick: () => router.push('/admin/conversations'),
                className: 'cursor-pointer hover:bg-muted',
              });
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [pathname, router, toast]);


  // Don't render header on login page
  if (pathname === '/login') {
    return <main>{children}</main>;
  }
  
  if (pathname === '/book' || pathname.startsWith('/book/')) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16">{children}</main>
      
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
    </div>
  );
}

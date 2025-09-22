
<<<<<<< HEAD

=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
'use client';

import type { ReactNode } from 'react';
import Header from './header';
import { usePathname } from 'next/navigation';
<<<<<<< HEAD
import { useState, useEffect, useRef, useCallback } from 'react';
=======
import { useState, useEffect } from 'react';
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';
import { NewSaleSheet } from '../sales/new-sale-sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
<<<<<<< HEAD
import { onSnapshot, collection, query, where, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65

type Props = {
  children: ReactNode;
};

export default function MainLayout({ children }: Props) {
  const pathname = usePathname();
<<<<<<< HEAD
  const { toast } = useToast();
  const router = useRouter();
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const refreshData = () => setDataRefreshKey(prev => prev + 1);

<<<<<<< HEAD
  // Sound unlock effect
  useEffect(() => {
    const unlockAudio = () => {
      // Create a dummy audio context
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
      // We only need to do this once
      document.removeEventListener('click', unlockAudio);
    };

    document.addEventListener('click', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
    };
  }, []);

=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
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

<<<<<<< HEAD
  useEffect(() => {
    const mountTime = Timestamp.now();

    const q = query(
      collection(db, 'conversaciones'),
      where('timestamp', '>', mountTime),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const message = change.doc.data();
          if (message.direction === 'inbound') {
              try {
                  const sound = new Audio('https://cdn.freesound.org/previews/242/242857_4284969-lq.mp3');
                  sound.play().catch(e => console.warn("Error playing sound, user interaction might be needed.", e));
              } catch (e) {
                  console.error("Failed to play notification sound.", e);
              }
              
              if (pathname !== '/admin/conversations') {
              toast({
                title: `Nuevo mensaje de ${message.from.replace('whatsapp:', '')}`,
                description: message.body,
                duration: Infinity, // This makes the toast persistent
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

=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65

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

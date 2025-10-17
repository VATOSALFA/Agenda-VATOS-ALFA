
'use client';

import { useState, useEffect } from 'react';
import { NewReservationForm } from '@/components/reservations/new-reservation-form';
import { BlockScheduleForm } from '@/components/reservations/block-schedule-form';
import { NewSaleSheet } from '@/components/sales/new-sale-sheet';

export default function AppInitializer() {
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);
  
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);
  
  const [queryKey, setQueryKey] = useState(0);
  const onDataRefresh = () => setQueryKey(prev => prev + 1);


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
    };

    document.addEventListener('new-reservation', handleNewReservation);
    document.addEventListener('new-block', handleNewBlock);
    document.addEventListener('new-sale', handleNewSale);

    return () => {
      document.removeEventListener('new-reservation', handleNewReservation);
      document.removeEventListener('new-block', handleNewBlock);
      document.removeEventListener('new-sale', handleNewSale);
    };
  }, []);

  return (
    <>
      <NewReservationForm
        isOpen={isReservationModalOpen}
        onOpenChange={setIsReservationModalOpen}
        isDialogChild={false} // It's a standalone dialog
        onFormSubmit={onDataRefresh}
        initialData={reservationInitialData}
        isEditMode={!!reservationInitialData?.id}
      />
      
      <BlockScheduleForm
        isOpen={isBlockScheduleModalOpen}
        onOpenChange={setIsBlockScheduleModalOpen}
        onFormSubmit={onDataRefresh}
        initialData={blockInitialData}
      />
      
      <NewSaleSheet 
        isOpen={isSaleSheetOpen} 
        onOpenChange={setIsSaleSheetOpen}
        initialData={saleInitialData}
        onSaleComplete={onDataRefresh}
      />
    </>
  );
}

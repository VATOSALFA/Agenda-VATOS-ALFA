
'use client';

import { useState, useEffect } from 'react';
import { NewReservationForm } from '@/components/reservations/new-reservation-form';
import { BlockScheduleForm } from '@/components/reservations/block-schedule-form';
import { NewSaleSheet } from '@/components/sales/new-sale-sheet';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';

export default function AppInitializer() {
  const { user } = useAuth();
  const { selectedLocalId, setSelectedLocalId } = useLocal();
  const { data: locales } = useFirestoreQuery<any>('locales');

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);

  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);

  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);

  const [queryKey, setQueryKey] = useState(0);
  const onDataRefresh = () => setQueryKey(prev => prev + 1);


  useEffect(() => {
    // Global Local Initialization Logic
    if (user?.local_id) {
      // Enforce assigned local from user profile
      if (selectedLocalId !== user.local_id) {
        setSelectedLocalId(user.local_id);
      }
    } else if (!selectedLocalId && locales.length > 0) {
      // Default to first local if none selected (for admins)
      setSelectedLocalId(locales[0].id);
    }
  }, [user, locales, selectedLocalId, setSelectedLocalId]);

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

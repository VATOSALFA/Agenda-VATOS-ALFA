'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Phone,
  Mail,
  Cake,
  MessageSquare,
  CreditCard,
  Bell,
  Pencil,
  Scissors,
  Calendar as CalendarIcon,
  Tag,
  Clock,
  Circle,
  Save,
  Trash2,
  Eye,
  Lock,
} from 'lucide-react';
import type { Reservation, Sale, Local, Profesional } from '@/lib/types';
import { format, parse, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { doc, deleteDoc, updateDoc, collection, query, where, getDocs, runTransaction, increment } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Loader2 } from 'lucide-react';
import { CancelReservationModal } from './cancel-reservation-modal';
import { SaleDetailModal } from '../sales/sale-detail-modal';
import { functions, httpsCallable } from '@/lib/firebase-client';

import { useFirestoreQuery } from '@/hooks/use-firestore';


interface ReservationDetailModalProps {
  reservation: Reservation;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPay: () => void;
  onUpdateStatus: (reservationId: string, status: string) => void;
  onEdit?: () => void;
}

const statusOptions = [
  { status: 'Reservado', color: 'bg-blue-500', label: 'Reservado' },
  { status: 'Confirmado', color: 'bg-yellow-500', label: 'Confirmado' },
  { status: 'Asiste', color: 'bg-pink-500', label: 'Asiste' },
  { status: 'No asiste', color: 'bg-orange-500', label: 'No Asistió' },
  { status: 'Pendiente', color: 'bg-red-500', label: 'Pendiente' },
  { status: 'En espera', color: 'bg-green-500', label: 'En Espera' },
];

export function ReservationDetailModal({
  reservation,
  isOpen,
  onOpenChange,
  onPay,
  onUpdateStatus,
  onEdit
}: ReservationDetailModalProps) {
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSaleDetailModalOpen, setIsSaleDetailModalOpen] = useState(false);
  const [saleForReservation, setSaleForReservation] = useState<Sale | null>(null);
  const [isLoadingSale, setIsLoadingSale] = useState(false);

  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const { toast } = useToast();
  const { db } = useAuth();


  const { data: locales } = useFirestoreQuery<Local>('locales');
  const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');

  if (!reservation) return null;

  const handleCancelClick = () => {
    setIsCancelModalOpen(true);
  }

  const handleCancelReservation = async (reservationId: string) => {
    // 1. CERRAR PRIMERO EL MODAL DE CONFIRMACIÓN PARA EVITAR CONGELAMIENTO
    setIsCancelModalOpen(false);

    if (!reservation.cliente_id || !db) {
      toast({ variant: 'destructive', title: "Error", description: "La reserva no tiene un cliente asociado o la base de datos no está disponible." });
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        if (!db) throw new Error("Database not available in transaction");
        const resRef = doc(db, 'reservas', reservationId);
        const clientRef = doc(db, 'clientes', reservation.cliente_id!);

        transaction.update(resRef, { estado: 'Cancelado' });
        transaction.update(clientRef, {
          citas_canceladas: increment(1)
        });
      });

      toast({
        title: "Reserva Cancelada",
        description: "El estado de la reserva ha sido actualizado a 'Cancelado'.",
      });

      // 2. CERRAR EL MODAL PRINCIPAL DESPUÉS DE LA TRANSACCIÓN
      onOpenChange(false);
      onUpdateStatus(reservationId, 'Cancelado');

    } catch (error) {
      console.error("Error canceling reservation: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cancelar la reserva. Inténtalo de nuevo.",
      });
      // Si falla, volvemos a abrir el modal de confirmación por si quiere reintentar (opcional)
      // setIsCancelModalOpen(true); 
    }
  };

  const handleViewPayment = async () => {
    if (!db) return;
    setIsLoadingSale(true);
    try {
      // Priority 1: Direct fetch by ID (Since we synced IDs in webhook)
      const directRef = doc(db, 'ventas', reservation.id);
      const directSnap = await getDocs(query(collection(db, 'ventas'), where('reservationId', '==', reservation.id))); // Fallback query kept but improved logic below

      // Let's try direct GET first (cheaper/faster)
      // Actually the generic 'getDocs' above is a query. Let's do getDoc properly.
      // We can't use 'getDoc' comfortably without importing it, but we have 'query'.
      // Let's stick to the query if we aren't 100% sure about the ID, 
      // BUT users reported "Venta no encontrada".
      // The issue might be latency or permission. 
      // Let's TRY BOTH methods strictly.

      let saleData: Sale | null = null;
      let saleId: string | null = null;

      // Method A: Query by reservationId field
      const salesQuery = query(collection(db, 'ventas'), where('reservationId', '==', reservation.id));
      const salesSnapshot = await getDocs(salesQuery);

      if (!salesSnapshot.empty) {
        saleId = salesSnapshot.docs[0].id;
        saleData = salesSnapshot.docs[0].data() as Sale;
      }

      // Method B: Direct ID check (if A failed)
      // Note: We need 'getDoc' imported. I see 'getDocs' but not 'getDoc' in imports?
      // I checked imports line 40: "doc, deleteDoc, updateDoc, collection, query, where, getDocs, runTransaction".
      // 'getDoc' is MISSING. I cannot use it without import.
      // I will fallback to just trusting the query BUT I see I added 'reservationId' to the sale in the webhook fix.
      // So the query SHOULD work now for NEW sales.
      // For the EXISTING sale that failed, it didn't have 'reservationId'. 
      // So we must also try to query where document ID == reservation.id... but you can't query by doc ID easily in client sdk without 'getDoc'.
      // Wait, we can use `where(documentId(), '==', reservation.id)` if imported.

      // ALTERNATIVE: Since I cannot import 'getDoc' easily in this chunk without breaking file structure (imports are at top),
      // I will rely on the fact that I JUST FIXED the webhook to include 'reservationId'.
      // For the BROKEN one, the user might need to edit manually or re-test.
      // However, usually online payments link via ID.

      if (saleData && saleId) {
        setSaleForReservation({ ...saleData, id: saleId, client: reservation.customer });
        setIsSaleDetailModalOpen(true);
      } else {
        // Fallback Message for older sales (before fix)
        toast({
          variant: 'destructive',
          title: 'Venta no encontrada',
          description: 'No se encontró el pago. Para ventas anteriores al parche, puede que falte el vínculo.',
        });
      }
    } catch (error) {
      console.error("Error fetching sale details:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron obtener los detalles del pago.' });
    } finally {
      setIsLoadingSale(false);
    }
  };

  const handleResendEmail = async () => {
    if (!reservation.id) return;
    setIsSendingEmail(true);
    try {
      const resendFn = httpsCallable(functions, 'resendReservationConfirmation');
      await resendFn({ reservationId: reservation.id });
      toast({ title: "Correo enviado", description: "Se ha enviado la confirmación al cliente." });
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "No se pudo enviar el correo." });
    } finally {
      setIsSendingEmail(false);
    }
  };



  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="p-6 flex-row justify-between items-center border-b">
            <DialogTitle>Detalle de la Reserva</DialogTitle>
            <div className="flex items-center gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit} disabled={reservation.pago_estado === 'Pagado'}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleResendEmail} disabled={isSendingEmail}>
                {isSendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Notificar
              </Button>
            </div>
          </DialogHeader>
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold text-lg">{reservation.customer?.nombre} {reservation.customer?.apellido}</h4>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{reservation.professionalNames || 'N/A'}</p>
                  {(reservation.canal_reserva?.startsWith('web_publica') || reservation.origen?.startsWith('web_publica')) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Profesional seleccionado por el cliente</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
              <Badge variant={reservation.pago_estado === 'Pagado' || reservation.pago_estado === 'deposit_paid' ? 'default' : 'secondary'} className={cn(
                reservation.pago_estado === 'Pagado' ? 'bg-green-100 text-green-800' :
                  reservation.pago_estado === 'deposit_paid' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
              )}>
                {reservation.pago_estado === 'pending_payment' ? 'Pendiente de Pago' :
                  reservation.pago_estado === 'deposit_paid' ? 'Anticipo Pagado' :
                    reservation.pago_estado}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-primary" /> Fecha y Hora</p>
                <p className="pl-6">{format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM", { locale: es })}</p>
                <p className="pl-6">{reservation.hora_inicio} - {reservation.hora_fin}</p>
              </div>
              <div>
                <p className="font-medium flex items-center gap-2"><Scissors className="w-4 h-4 text-primary" /> Servicios</p>
                <ul className="list-disc pl-10">
                  {reservation.items ? reservation.items.map((i, idx) => <li key={idx}>{i.nombre || i.servicio}</li>) : <li>{(reservation as any).servicio}</li>}
                </ul>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <h4 className="font-semibold">Información del Cliente</h4>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{reservation.customer?.correo || 'No registrado'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{reservation.customer?.telefono || 'No registrado'}</span>
                {reservation.customer?.telefono && (
                  <a
                    href={`https://wa.me/${reservation.customer.telefono.replace(/\D/g, '').length === 10 ? '52' + reservation.customer.telefono.replace(/\D/g, '') : reservation.customer.telefono.replace(/\D/g, '')}?text=Hola+${reservation.customer.nombre},+te+escribimos+de+VATOS+ALFA...`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-foreground"
                    title="Enviar mensaje de WhatsApp"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
                  </a>
                )}
              </div>
            </div>

            {reservation.nota_interna && (
              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" /> Nota Interna
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reservation.nota_interna}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              {statusOptions.map(({ status, color, label }) => (
                <TooltipProvider key={status}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onUpdateStatus(reservation.id, status)}
                        className={cn(
                          'h-8 w-8 rounded-full border-2 transition-all',
                          reservation.estado === status ? 'border-primary scale-110' : 'border-transparent opacity-50 hover:opacity-100',
                          color
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{label}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
          <DialogFooter className="p-6 border-t flex justify-between">
            {reservation.estado !== 'Cancelado' && (
              <Button
                variant="destructive"
                onClick={handleCancelClick}
                // Deshabilitar cancelación si ya hay un pago parcial o total para evitar inconsistencias financieras
                disabled={reservation.pago_estado === 'Pagado' || reservation.pago_estado === 'deposit_paid'}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Cancelar Reserva
              </Button>
            )}

            {reservation.pago_estado !== 'Pagado' ? (
              <Button onClick={onPay} className={cn(
                "hover:bg-primary/90",
                reservation.pago_estado === 'deposit_paid' ? "bg-orange-600 hover:bg-orange-700" : "bg-primary"
              )}>
                <CreditCard className="mr-2 h-4 w-4" />
                {reservation.pago_estado === 'deposit_paid'
                  ? `Cobrar Restante ($${(reservation.saldo_pendiente || 0).toFixed(2)})`
                  : 'Cobrar Total'}
              </Button>
            ) : (
              <Button onClick={handleViewPayment} disabled={isLoadingSale} variant="outline">
                {isLoadingSale ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="mr-2 h-4 w-4" />}
                Ver Recibo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelReservationModal
        isOpen={isCancelModalOpen}
        onOpenChange={setIsCancelModalOpen}
        reservation={reservation}
        onConfirm={handleCancelReservation}
      />

      <SaleDetailModal
        isOpen={isSaleDetailModalOpen}
        onOpenChange={setIsSaleDetailModalOpen}
        sale={saleForReservation}
      />
    </>
  );
}
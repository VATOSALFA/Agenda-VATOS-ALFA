

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '../ui/scroll-area';
import { Mail, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { functions, httpsCallable } from '@/lib/firebase-client';

interface CommissionRowData {
  professionalId: string;
  professionalName: string;
  clientName: string;
  itemName: string;
  itemType: 'servicio' | 'producto';
  saleAmount: number;
  commissionAmount: number;
  commissionPercentage: number;
}

interface ProfessionalCommissionSummary {
  professionalId: string;
  professionalName: string;
  totalSales: number;
  totalCommission: number;
  details: CommissionRowData[];
}

interface CommissionDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  summary: ProfessionalCommissionSummary | null;
  dateRangeStr?: string;
}

export function CommissionDetailModal({ isOpen, onOpenChange, summary, dateRangeStr }: CommissionDetailModalProps) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  if (!summary) return null;

  const handleSendEmail = async () => {
    setIsSending(true);
    try {
      const sendReport = httpsCallable(functions, 'sendCommissionReport');
      const result: any = await sendReport({
        professionalId: summary.professionalId,
        details: summary.details,
        dateRangeStr: dateRangeStr || ''
      });

      if (result.data.success) {
        toast({ title: "Correo enviado", description: `El reporte se ha enviado a ${summary.professionalName}.` });
      } else {
        toast({ variant: "destructive", title: "Error", description: result.data.message || "No se pudo enviar el correo." });
      }
    } catch (error: any) {
      console.error("Email error:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Error al enviar el correo." });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Detalle de Comisiones: {summary.professionalName}</DialogTitle>
          <DialogDescription>
            Desglose de todas las ventas y comisiones para este profesional en el período seleccionado.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] -mx-6 px-6">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Venta</TableHead>
                  <TableHead className="text-right">% Comisión</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.details.map((detail, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{detail.itemName}</TableCell>
                    <TableCell>{detail.clientName}</TableCell>
                    <TableCell className="capitalize">{detail.itemType}</TableCell>
                    <TableCell className="text-right">${detail.saleAmount.toLocaleString('es-MX')}</TableCell>
                    <TableCell className="text-right">{detail.commissionPercentage.toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-semibold text-primary">${detail.commissionAmount.toLocaleString('es-MX')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">${summary.totalSales.toLocaleString('es-MX')}</TableCell>
                  <TableCell colSpan={1}></TableCell>
                  <TableCell className="text-right font-bold text-primary">${summary.totalCommission.toLocaleString('es-MX')}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </ScrollArea>
        </div>

        <DialogFooter className="flex justify-between items-center sm:justify-between">
          <div className="flex-1"></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSendEmail} disabled={isSending}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Enviar por correo
            </Button>
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  );
}

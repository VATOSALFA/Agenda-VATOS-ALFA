
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

import type { ProfessionalCommissionSummary } from "@/lib/types";

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

        {/* Mobile View */}
        <div className="md:hidden flex flex-col h-[60vh] -mx-6">
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-4 p-1 pb-4">
              {summary.details.map((detail, index) => (
                <div key={index} className="flex flex-col space-y-3 border p-4 rounded-lg bg-card text-card-foreground shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-sm">{detail.itemName}</div>
                      <div className="text-xs text-muted-foreground">{detail.clientName}</div>
                    </div>
                    <div className="text-[10px] font-medium px-2 py-0.5 bg-blue-600 text-white rounded-full capitalize">{detail.itemType}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                    <div>
                      <span className="text-muted-foreground block">Venta</span>
                      <div className="font-medium">${detail.saleAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground block">Comisión ({detail.commissionPercentage.toFixed(0)}%)</span>
                      <div className="font-bold text-primary">${detail.commissionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t pt-4 mt-2 px-6 pb-2 bg-background z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between text-sm font-medium">
              <span>Total Ventas</span>
              <span>${summary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-primary">
              <span>Total Comisiones</span>
              <span>${summary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Desktop View */}
        <div className="hidden md:block max-h-[60vh] -mx-6 px-6">
          <ScrollArea className="h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
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
                    <TableCell className="capitalize">
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                        {detail.itemType}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">${detail.saleAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{detail.commissionPercentage.toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-semibold text-primary">${detail.commissionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">${summary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  <TableCell colSpan={1}></TableCell>
                  <TableCell className="text-right font-bold text-primary">${summary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
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

'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '../ui/scroll-area';
import { Mail, Loader2, DollarSign, X } from 'lucide-react';
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
      <DialogContent hideCloseButton={true} className="max-w-3xl sm:max-w-4xl max-h-[85dvh] sm:max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background">
        {/* Official Vatos Alfa Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-blue-900/40 flex-shrink-0">
          <div className="header-light-beam" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                  Detalle de Comisiones: {summary.professionalName}
                </DialogTitle>
                <p className="text-xs text-slate-300">
                  Desglose de ventas y comisiones para este profesional en el período seleccionado.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile View */}
        <div className="md:hidden flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 overscroll-contain">
            <div className="space-y-2.5 pb-2">
              {summary.details.map((detail, index) => (
                <div key={index} className="flex flex-col space-y-2 border border-border/60 p-3 rounded-xl bg-card/60 backdrop-blur-sm text-card-foreground shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{detail.itemName}</div>
                      <div className="text-xs text-muted-foreground truncate">{detail.clientName}</div>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 bg-muted/40 text-foreground border border-border/60 rounded-md capitalize shrink-0">
                      {detail.itemType}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/40">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Venta</span>
                      <div className="font-medium flex items-center gap-1 mt-0.5 font-sans">
                        ${detail.saleAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {detail.discountDetails && (
                          <span className="text-[10px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded border border-border/40 whitespace-nowrap font-medium">
                            {detail.discountDetails.type === 'percentage' ? `${detail.discountDetails.value}%` : `$${detail.discountDetails.value}`} dcto
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground block text-[11px]">Comisión ({detail.commissionPercentage.toFixed(0)}%)</span>
                      <div className="font-bold text-sm text-blue-500 dark:text-blue-400 mt-0.5 font-sans">
                        ${detail.commissionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 pt-2.5 px-4 pb-2.5 bg-muted/20 flex-shrink-0">
            <div className="flex justify-between text-xs text-muted-foreground font-sans">
              <span>Total Ventas</span>
              <span className="font-semibold text-foreground">${summary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-foreground mt-1 font-sans">
              <span>Total Comisiones</span>
              <span className="text-blue-500 dark:text-blue-400">${summary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Desktop View */}
        <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-hidden p-4 sm:p-5">
          <div className="rounded-xl border border-border/60 overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="max-h-[48vh] overflow-y-auto custom-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 border-b border-border/60">
                  <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                    <TableHead className="py-1 px-3 font-semibold text-xs">Concepto</TableHead>
                    <TableHead className="py-1 px-3 font-semibold text-xs">Cliente</TableHead>
                    <TableHead className="py-1 px-3 font-semibold text-xs">Tipo</TableHead>
                    <TableHead className="py-1 px-3 font-semibold text-xs text-right">Venta</TableHead>
                    <TableHead className="py-1 px-3 font-semibold text-xs text-right">% Comisión</TableHead>
                    <TableHead className="py-1 px-3 font-semibold text-xs text-right">Comisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.details.map((detail, index) => (
                    <TableRow key={index} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                      <TableCell className="py-1.5 px-3 font-medium text-xs">{detail.itemName}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{detail.clientName}</TableCell>
                      <TableCell className="py-1.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-muted/40 border border-border/60 text-[10px] font-medium capitalize text-foreground">
                          {detail.itemType}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right font-sans">
                        <div className="flex flex-col items-end justify-center">
                          <span className="text-xs font-medium text-foreground">${detail.saleAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          {detail.discountDetails && (
                            <span className="text-[10px] text-muted-foreground font-medium bg-muted/40 px-1.5 py-0.5 rounded mt-0.5 border border-border/40 whitespace-nowrap">
                              {detail.discountDetails.type === 'percentage' ? `${detail.discountDetails.value}%` : `$${detail.discountDetails.value}`} dcto
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right text-xs font-sans">{detail.commissionPercentage.toFixed(2)}%</TableCell>
                      <TableCell className="py-1.5 px-3 text-right font-bold text-xs text-blue-500 dark:text-blue-400 font-sans">
                        ${detail.commissionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="bg-muted/40 border-t border-border/60 sticky bottom-0">
                  <TableRow className="h-9">
                    <TableCell colSpan={3} className="py-1.5 px-3 text-right font-bold text-xs">Total</TableCell>
                    <TableCell className="py-1.5 px-3 text-right font-bold text-xs font-sans">${summary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell colSpan={1} className="py-1.5 px-3"></TableCell>
                    <TableCell className="py-1.5 px-3 text-right font-bold text-xs text-blue-500 dark:text-blue-400 font-sans">${summary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/10 flex justify-between items-center flex-shrink-0">
          <div></div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border/60 hover:bg-white/5 font-medium text-xs h-9"
              onClick={handleSendEmail}
              disabled={isSending}
            >
              {isSending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5 text-slate-400" />}
              Enviar por correo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border/60 hover:bg-white/5 font-medium text-xs h-9"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, X } from 'lucide-react';
import type { AggregatedSellerSale } from '@/lib/types';

interface SellerSaleDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  summary: AggregatedSellerSale | null;
}

export function SellerSaleDetailModal({ isOpen, onOpenChange, summary }: SellerSaleDetailModalProps) {
  if (!summary) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        hideCloseButton={true}
        className="max-w-4xl p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background flex flex-col"
      >
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Detalle de Ventas: {summary.sellerName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Desglose de todos los productos vendidos por este profesional en el período seleccionado.
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Contenido / Tabla Compacta */}
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <ScrollArea className="max-h-[50vh]">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                    <TableHead className="py-1 px-3 text-xs font-semibold">Fecha</TableHead>
                    <TableHead className="py-1 px-3 text-xs font-semibold">Cliente</TableHead>
                    <TableHead className="py-1 px-3 text-xs font-semibold">Producto vendido</TableHead>
                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Unidades</TableHead>
                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Recaudación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.details.map((detail, index: number) => (
                    <TableRow key={detail.saleId + index} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                      <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap">{detail.date}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">{detail.clientName}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-foreground/90">{detail.productName}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-right font-mono">{detail.unitsSold}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-right font-bold text-foreground">
                        ${detail.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="h-8 bg-muted/40 font-bold border-t border-border/60">
                    <TableCell colSpan={3} className="py-1 px-3 text-right font-bold text-xs uppercase tracking-wider text-muted-foreground">Total</TableCell>
                    <TableCell className="py-1 px-3 text-right font-bold text-xs font-mono">{summary.unitsSold}</TableCell>
                    <TableCell className="py-1 px-3 text-right font-extrabold text-sm text-foreground">
                      ${summary.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ScrollArea>
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-xl border-border/60 text-xs">
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

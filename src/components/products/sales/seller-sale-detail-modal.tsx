'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
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
        className="w-[95vw] sm:w-full max-w-4xl max-h-[88dvh] sm:max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background"
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

        {/* Contenido / Tabla con Scroll Suave y Robusto en Móvil, Tablet y PC */}
        <div className="p-3 sm:p-5 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin overscroll-contain touch-pan-y rounded-xl border border-border/60 bg-card/40">
            <Table className="w-full min-w-[540px] sm:min-w-full">
              <TableHeader className="sticky top-0 bg-[#10172b] dark:bg-[#10172b] z-10 border-b border-border/60 shadow-xs">
                <TableRow className="h-8 bg-transparent hover:bg-transparent border-b border-border/60">
                  <TableHead className="py-1 px-3 text-xs font-semibold text-white">Fecha</TableHead>
                  <TableHead className="py-1 px-3 text-xs font-semibold text-white">Cliente</TableHead>
                  <TableHead className="py-1 px-3 text-xs font-semibold text-white">Producto vendido</TableHead>
                  <TableHead className="py-1 px-3 text-xs font-semibold text-white text-right">Unidades</TableHead>
                  <TableHead className="py-1 px-3 text-xs font-semibold text-white text-right">Recaudación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.details.map((detail, index: number) => (
                  <TableRow key={detail.saleId + index} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                    <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap text-muted-foreground font-sans">{detail.date}</TableCell>
                    <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">{detail.clientName}</TableCell>
                    <TableCell className="py-1.5 px-3 text-xs text-foreground/90">{detail.productName}</TableCell>
                    <TableCell className="py-1.5 px-3 text-xs text-right font-sans font-medium text-foreground">{detail.unitsSold}</TableCell>
                    <TableCell className="py-1.5 px-3 text-xs text-right font-bold text-foreground font-sans">
                      ${detail.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="sticky bottom-0 bg-[#10172b] dark:bg-[#10172b] z-10 border-t border-border/60 font-bold shadow-xs">
                <TableRow className="h-9 hover:bg-transparent">
                  <TableCell colSpan={3} className="py-1.5 px-3 text-right font-bold text-xs uppercase tracking-wider text-muted-foreground">Total</TableCell>
                  <TableCell className="py-1.5 px-3 text-right font-bold text-xs font-sans text-white">{summary.unitsSold}</TableCell>
                  <TableCell className="py-1.5 px-3 text-right font-bold text-sm text-white font-sans">
                    ${summary.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-3 shrink-0 gap-2">
            <div className="text-xs text-muted-foreground font-sans flex items-center gap-1.5 flex-wrap">
              <span>Total:</span>
              <strong className="text-foreground">{summary.unitsSold} {summary.unitsSold === 1 ? 'unidad' : 'unidades'}</strong>
              <span>•</span>
              <strong className="text-foreground font-bold text-sm font-sans">${summary.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</strong>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-xl border-border/60 text-xs shrink-0">
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

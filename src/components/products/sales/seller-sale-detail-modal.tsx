
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
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AggregatedSellerSale } from '@/app/(admin)/products/sales/page';

interface SellerSaleDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  summary: AggregatedSellerSale | null;
}

export function SellerSaleDetailModal({ isOpen, onOpenChange, summary }: SellerSaleDetailModalProps) {
  if (!summary) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Detalle de Ventas: {summary.sellerName}</DialogTitle>
          <DialogDescription>
            Desglose de todos los productos vendidos por este profesional en el período seleccionado.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] -mx-6 px-6">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto vendido</TableHead>
                  <TableHead className="text-right">Unidades vendidas</TableHead>
                  <TableHead className="text-right">Recaudación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.details.map((detail, index: number) => (
                  <TableRow key={detail.saleId + index}>
                    <TableCell>{detail.date}</TableCell>
                    <TableCell>{detail.clientName}</TableCell>
                    <TableCell className="font-medium">{detail.productName}</TableCell>
                    <TableCell className="text-right">{detail.unitsSold}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">${detail.revenue.toLocaleString('es-CL')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">{summary.unitsSold}</TableCell>
                  <TableCell className="text-right font-bold text-primary">${summary.revenue.toLocaleString('es-CL')}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

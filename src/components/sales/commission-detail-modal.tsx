
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
}

export function CommissionDetailModal({ isOpen, onOpenChange, summary }: CommissionDetailModalProps) {
  if (!summary) return null;

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
                            <TableCell className="text-right">${detail.saleAmount.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">{detail.commissionPercentage.toFixed(2)}%</TableCell>
                            <TableCell className="text-right font-semibold text-primary">${detail.commissionAmount.toLocaleString('es-CL')}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                            <TableCell className="text-right font-bold">${summary.totalSales.toLocaleString('es-CL')}</TableCell>
                            <TableCell colSpan={1}></TableCell>
                            <TableCell className="text-right font-bold text-primary">${summary.totalCommission.toLocaleString('es-CL')}</TableCell>
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

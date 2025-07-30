
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Printer, X, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client } from '@/lib/types';


interface Sale {
    id: string;
    fecha_hora_venta?: { seconds: number };
    cliente_id: string;
    local_id?: string;
    metodo_pago: string;
    total: number;
    items?: { 
        nombre: string;
        barbero_id: string;
        precio: number;
    }[];
    client?: Client;
    professionalNames?: string;
}

interface SaleDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  sale: Sale | null;
}

const InfoItem = ({ label, value, editable }: { label: string, value: string | number, editable?: boolean }) => (
    <div>
        <div className="text-xs text-muted-foreground flex items-center">{label} {editable && <Pencil className="h-3 w-3 ml-1" />}</div>
        <div className="font-medium">{value}</div>
    </div>
);

export function SaleDetailModal({ isOpen, onOpenChange, sale }: SaleDetailModalProps) {
    if (!sale) return null;

    const formatDate = (date: any) => {
        if (!date) return 'Fecha no disponible';
        let dateObj: Date;
        if (date.seconds) { // Firestore Timestamp
          dateObj = new Date(date.seconds * 1000);
        } else if (typeof date === 'string') { // ISO String
          dateObj = parseISO(date);
        } else {
            return 'Fecha inválida';
        }
        if (isNaN(dateObj.getTime())) return 'Fecha inválida';
        return format(dateObj, 'PP p', { locale: es });
    };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <DialogHeader className="p-4 border-b flex-row items-center justify-between">
            <DialogTitle>Comprobante de pago ID: {sale.id.slice(0, 8)}</DialogTitle>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon"><Mail className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon"><Printer className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
            </div>
        </DialogHeader>
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-4">Resumen de pago</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                    <InfoItem label="Fecha" value={formatDate(sale.fecha_hora_venta)} editable />
                    <InfoItem label="Cajero" value="Sin información" />
                    <InfoItem label="Nombre del cliente" value={`${sale.client?.nombre} ${sale.client?.apellido}`} />
                    <InfoItem label="Monto total" value={`$${sale.total.toLocaleString('es-CL')}`} />
                    <InfoItem label="Monto facturado" value={`$${sale.total.toLocaleString('es-CL')}`} />
                    <InfoItem label="Monto no facturado" value="$0" />
                    <InfoItem label="Vuelto" value="$0" />
                </div>
            </div>

            <div className="p-4 border rounded-lg">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Abono N°{sale.id.slice(0, 8)} <Pencil className="h-3 w-3 ml-1 inline-block" /> | {formatDate(sale.fecha_hora_venta).split(' ')[0]} | ${sale.total.toLocaleString('es-CL')}</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <InfoItem label="Medio de Pago" value={sale.metodo_pago} />
                    <InfoItem label="Monto" value={`$${sale.total.toLocaleString('es-CL')}`} />
                </div>
            </div>

            <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">Boleta N° {sale.id.slice(9,16)} <Pencil className="h-3 w-3 ml-1 inline-block" /></h3>
                <div className="text-sm">
                     <div className="text-xs text-muted-foreground">Comentarios:</div>
                     <div className="font-medium">-</div>
                </div>
            </div>

            <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-4">Servicio sin reservas</h3>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Precio</TableHead>
                            <TableHead>Vendedor</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sale.items?.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell>{item.nombre}</TableCell>
                                <TableCell>${(item.precio || 0).toLocaleString('es-CL')}</TableCell>
                                <TableCell>{sale.professionalNames}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
        <DialogFooter className="p-4 border-t flex justify-between">
            <Button variant="destructive">Eliminar</Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



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
import { Mail, Printer, X, Pencil, Store } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client, Local, Sale, Profesional, User } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useMemo } from 'react';
import Image from 'next/image';

interface EmpresaSettings {
    receipt_logo_url?: string;
    name?: string;
}

interface SaleDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  sale: Sale | null;
}

const InfoItem = ({ label, value }: { label: string, value: string | number | undefined }) => (
    <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
    </div>
);

export function SaleDetailModal({ isOpen, onOpenChange, sale }: SaleDetailModalProps) {
    const { data: locales } = useFirestoreQuery<Local>('locales');
    const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');
    const { data: users } = useFirestoreQuery<User>('usuarios');
    const { data: empresaData } = useFirestoreQuery<EmpresaSettings>('empresa');
    const empresa = empresaData?.[0];

    const localName = useMemo(() => {
        if (!sale || !sale.local_id || !locales) return 'N/A';
        return locales.find(l => l.id === sale.local_id)?.name || 'Desconocido';
    }, [sale, locales]);

    const sellerMap = useMemo(() => {
        const map = new Map<string, string>();
        if (professionals) {
            professionals.forEach(p => map.set(p.id, p.name));
        }
        if (users) {
            users.forEach(u => map.set(u.id, u.name));
        }
        return map;
    }, [professionals, users]);


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

    const subtotal = sale.subtotal || sale.items?.reduce((acc, item) => acc + (item.precio_unitario || 0) * item.cantidad, 0) || 0;
    const discountAmount = sale.descuento?.valor && sale.descuento.tipo === 'percentage'
        ? (subtotal * sale.descuento.valor) / 100
        : (sale.descuento?.valor || 0);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="p-4 border-b flex-row items-center justify-between">
            <DialogTitle>Comprobante de pago ID: {sale.id.slice(0, 8)}</DialogTitle>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon"><Mail className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon"><Printer className="h-4 w-4" /></Button>
            </div>
        </DialogHeader>
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-center items-center mb-6">
                {empresa?.receipt_logo_url ? (
                    <Image src={empresa.receipt_logo_url} alt="Logo" width={200} height={100} className="h-auto" />
                ) : (
                    <h2 className="text-2xl font-bold">{empresa?.name || "Vatos Alfa"}</h2>
                )}
            </div>
            <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-4">Resumen de pago</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                    <InfoItem label="Fecha" value={formatDate(sale.fecha_hora_venta)} />
                    <InfoItem label="Cajero" value={sale.creado_por_nombre || 'Sin información'} />
                    <InfoItem label="Cliente" value={`${sale.client?.nombre} ${sale.client?.apellido}`} />
                    <InfoItem label="Local" value={localName} />
                    <InfoItem label="Método de pago" value={sale.metodo_pago} />
                    <InfoItem label="Monto total" value={`$${sale.total.toLocaleString('es-CL')}`} />
                </div>
            </div>

            <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-4">Detalle de la venta</h3>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead className="text-right">Precio</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sale.items?.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell>{item.nombre}</TableCell>
                                <TableCell>{sellerMap.get(item.barbero_id) || 'N/A'}</TableCell>
                                <TableCell className="text-right">${(item.precio_unitario || 0).toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                     <TableFooter>
                        <TableRow>
                            <TableCell colSpan={2} className="text-right">Subtotal</TableCell>
                            <TableCell className="text-right">${subtotal.toLocaleString('es-CL')}</TableCell>
                        </TableRow>
                        {discountAmount > 0 && (
                            <TableRow>
                                <TableCell colSpan={2} className="text-right">Descuento</TableCell>
                                <TableCell className="text-right text-destructive">-${discountAmount.toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        )}
                        <TableRow className="font-bold text-lg">
                            <TableCell colSpan={2} className="text-right">Total</TableCell>
                            <TableCell className="text-right">${sale.total.toLocaleString('es-CL')}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        </div>
        <DialogFooter className="p-4 border-t flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

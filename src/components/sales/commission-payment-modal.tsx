
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { DateRange } from 'react-day-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { where, Timestamp, writeBatch, collection, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Info, Loader2 } from 'lucide-react';
import type { Sale, Profesional, Service, Product } from '@/lib/types';


interface CommissionPaymentModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onFormSubmit: () => void;
  dateRange: DateRange | undefined;
  localId: string | null;
}

interface CommissionRowData {
    professionalId: string;
    professionalName: string;
    totalSales: number;
    totalCommission: number;
}

export function CommissionPaymentModal({ isOpen, onOpenChange, onFormSubmit, dateRange, localId }: CommissionPaymentModalProps) {
    const [commissionData, setCommissionData] = useState<CommissionRowData[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();

    const salesQueryConstraints = useMemo(() => {
        if (!dateRange?.from) return undefined;
        const constraints = [];
        constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(dateRange.from)));
        if (dateRange.to) {
            constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(dateRange.to)));
        }
        if (localId && localId !== 'todos') {
            constraints.push(where('local_id', '==', localId));
        }
        return constraints;
    }, [dateRange, localId]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', salesQueryConstraints ? `sales-${JSON.stringify(dateRange)}-${localId}` : undefined, ...(salesQueryConstraints || []));
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    
    const isLoading = salesLoading || professionalsLoading || servicesLoading || productsLoading;
    
    useEffect(() => {
        if (isLoading) return;

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));

        const commissionsByProfessional: Record<string, CommissionRowData> = {};

        sales.forEach(sale => {
            sale.items?.forEach(item => {
                const professional = professionalMap.get(item.barbero_id);
                if (!professional) return;
                
                if (!commissionsByProfessional[professional.id]) {
                    commissionsByProfessional[professional.id] = {
                        professionalId: professional.id,
                        professionalName: professional.name,
                        totalSales: 0,
                        totalCommission: 0,
                    };
                }

                const itemPrice = item.subtotal || item.precio || 0;
                let commissionConfig = null;

                if(item.tipo === 'servicio') {
                    const service = serviceMap.get(item.id);
                    if (service) {
                        commissionConfig = professional?.comisionesPorServicio?.[service.id] || service.defaultCommission || professional.defaultCommission;
                    }
                } else if (item.tipo === 'producto') {
                    const product = productMap.get(item.id);
                    if (product) {
                        commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                    }
                }

                if (commissionConfig) {
                    const commissionAmount = commissionConfig.type === '%'
                        ? itemPrice * (commissionConfig.value / 100)
                        : commissionConfig.value;
                    
                    commissionsByProfessional[professional.id].totalSales += itemPrice;
                    commissionsByProfessional[professional.id].totalCommission += commissionAmount;
                }
            });
        });
        
        setCommissionData(Object.values(commissionsByProfessional));

    }, [sales, professionals, services, products, isLoading]);


    const handlePayCommissions = async () => {
        if (commissionData.length === 0) {
            toast({ variant: 'destructive', title: 'Sin comisiones', description: 'No hay comisiones para pagar en el período seleccionado.' });
            return;
        }
        setIsProcessing(true);
        try {
            const batch = writeBatch(db);
            const now = Timestamp.now();
            
            commissionData.forEach(comm => {
                if (comm.totalCommission > 0) {
                    const egresoRef = doc(collection(db, 'egresos'));
                    batch.set(egresoRef, {
                        fecha: now,
                        monto: comm.totalCommission,
                        concepto: 'Comisión',
                        aQuien: comm.professionalId,
                        local_id: localId,
                        comentarios: `Pago de comisión por ventas del período. Total venta: $${comm.totalSales.toLocaleString('es-MX')}`,
                    });
                }
            });

            await batch.commit();

            toast({ title: 'Comisiones pagadas', description: `Se han registrado ${commissionData.length} egresos por comisiones.`});
            onFormSubmit();
            onOpenChange(false);
        } catch (error) {
            console.error("Error al pagar comisiones:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron registrar los pagos de comisiones.'});
        } finally {
            setIsProcessing(false);
        }
    }

    const overallTotalCommission = useMemo(() => {
        return commissionData.reduce((acc, curr) => acc + curr.totalCommission, 0);
    }, [commissionData]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Pago de Comisiones</DialogTitle>
                    <DialogDescription>
                        Calcula y registra el pago de comisiones para los profesionales en el período seleccionado.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Revisión de Comisiones</AlertTitle>
                        <AlertDescription>
                            El sistema ha calculado las comisiones basadas en las ventas registradas. Al presionar "Pagar Comisiones", se generará un egreso en la caja por cada profesional.
                        </AlertDescription>
                    </Alert>
                    
                    <div className="mt-4 max-h-96">
                        <ScrollArea className="h-full">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Profesional</TableHead>
                                        <TableHead className="text-right">Venta Total Atribuida</TableHead>
                                        <TableHead className="text-right">Comisión a Pagar</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={3} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                    ) : commissionData.length === 0 ? (
                                        <TableRow><TableCell colSpan={3} className="text-center h-24">No hay comisiones para calcular.</TableCell></TableRow>
                                    ) : commissionData.map((row) => (
                                        <TableRow key={row.professionalId}>
                                            <TableCell className="font-medium">{row.professionalName}</TableCell>
                                            <TableCell className="text-right">${row.totalSales.toLocaleString('es-MX')}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">${row.totalCommission.toLocaleString('es-MX')}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={2} className="text-right font-bold text-lg">Total a Pagar</TableCell>
                                        <TableCell className="text-right font-bold text-lg text-primary">${overallTotalCommission.toLocaleString('es-MX')}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </ScrollArea>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handlePayCommissions} disabled={isLoading || isProcessing || commissionData.length === 0}>
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Pagar Comisiones
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
